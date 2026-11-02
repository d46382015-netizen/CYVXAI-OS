"use strict";
const crypto = require("node:crypto");
const { StripeRevenueProvider } = require("./providers");
const EXPERIMENT_ID = "one-dollar-experiment";
const GOAL_PARTICIPANTS = 175000000;
const CONTRIBUTION_CENTS = 100;

class OneDollarExperiment {
  constructor(runtime, options = {}) {
    if (!runtime || !runtime.db) throw new Error("OneDollarExperiment requires the CYVX runtime database");
    this.runtime=runtime; this.db=runtime.db; this.env=options.env||process.env;
    this.stripe=options.stripe||new StripeRevenueProvider({...options,env:this.env});
    this.enabled=String(this.env.CYVX_ONE_DOLLAR_EXPERIMENT_ENABLED||"false").toLowerCase()==="true";
    this.baseUrl=String(options.baseUrl||this.env.CYVX_ONE_DOLLAR_EXPERIMENT_BASE_URL||this.env.CYVX_PUBLIC_BASE_URL||"").replace(/\/$/,"");
    this.logger=runtime.logger||{write(){}};
    this.ensureSchema();
  }
  ensureSchema() {
    this.db.exec("CREATE TABLE IF NOT EXISTS one_dollar_checkouts (id TEXT PRIMARY KEY,experiment_id TEXT NOT NULL,stripe_session_id TEXT NOT NULL UNIQUE,payment_intent_id TEXT,amount_cents INTEGER NOT NULL CHECK(amount_cents=100),currency TEXT NOT NULL CHECK(currency='usd'),status TEXT NOT NULL CHECK(status IN ('pending','paid','failed','expired')),referral_code TEXT,share_code TEXT NOT NULL,source TEXT,created_at TEXT NOT NULL,paid_at TEXT);"+
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_one_dollar_payment_intent ON one_dollar_checkouts(payment_intent_id) WHERE payment_intent_id IS NOT NULL;"+
    "CREATE INDEX IF NOT EXISTS idx_one_dollar_referral ON one_dollar_checkouts(referral_code);"+
    "CREATE TABLE IF NOT EXISTS one_dollar_webhook_events (event_id TEXT PRIMARY KEY,event_type TEXT NOT NULL,payload_sha256 TEXT NOT NULL,received_at TEXT NOT NULL,processed_at TEXT);"+
    "CREATE TABLE IF NOT EXISTS one_dollar_payment_adjustments (id TEXT PRIMARY KEY,checkout_id TEXT NOT NULL REFERENCES one_dollar_checkouts(id),kind TEXT NOT NULL CHECK(kind IN ('refund','dispute')),amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),provider_reference TEXT NOT NULL,status TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(kind,provider_reference));"+
    "CREATE TABLE IF NOT EXISTS one_dollar_fee_reconciliation (checkout_id TEXT PRIMARY KEY REFERENCES one_dollar_checkouts(id),balance_transaction_id TEXT NOT NULL UNIQUE,fee_cents INTEGER NOT NULL CHECK(fee_cents>=0),currency TEXT NOT NULL,reconciled_at TEXT NOT NULL);");
  }
  async createCheckout(input={}) {
    if(!this.enabled)throw coded("EXPERIMENT_CHECKOUT_DISABLED",503,"The campaign is not accepting payments yet.");
    if(!this.baseUrl||!/^https:\/\//i.test(this.baseUrl))throw coded("CAMPAIGN_BASE_URL_REQUIRED",503,"A public HTTPS campaign URL must be configured.");
    if(!this.stripe.configured())throw coded("STRIPE_UNCONFIGURED",503,"Live Stripe checkout is not configured.");
    const referral=cleanCode(input.ref||input.referral_code),source=cleanSource(input.source);
    const shareCode=crypto.randomBytes(6).toString("hex").toUpperCase(),checkoutId=crypto.randomUUID();
    const session=await this.stripe.createCheckoutSession({
      amount_cents:CONTRIBUTION_CENTS,currency:"usd",product_name:"The $1 Experiment",
      description:"A voluntary $1 contribution supporting the experiment and CYVXAI OS. Not a charitable donation; no goods, services, equity, or financial return are promised.",
      customer_email:input.email||undefined,
      success_url:this.baseUrl+"/experiment?paid=1&ref="+shareCode+"&session_id={CHECKOUT_SESSION_ID}",
      cancel_url:this.baseUrl+"/experiment?cancelled=1",idempotency_key:"one-dollar-"+checkoutId,
      metadata:{experiment_id:EXPERIMENT_ID,checkout_id:checkoutId,referral_code:referral||"",share_code:shareCode,source:source,allocation_policy:"net-50-personal-50-cyvxai-v1"}
    });
    this.db.prepare("INSERT INTO one_dollar_checkouts (id,experiment_id,stripe_session_id,amount_cents,currency,status,referral_code,share_code,source,created_at) VALUES(?,?,?,?,?,'pending',?,?,?,?)")
      .run(checkoutId,EXPERIMENT_ID,session.id,100,"usd",referral,shareCode,source,new Date().toISOString());
    this.log("checkout.created",{checkout_id:checkoutId,stripe_session_id:session.id,referral_code:referral,source:source});
    return {checkout_url:session.url,checkout_id:checkoutId,share_url:this.baseUrl+"/experiment?ref="+shareCode};
  }
  async processWebhook(rawBody,signatureHeader) {
    this.stripe.verifyWebhook(rawBody,signatureHeader);
    let event;try{event=JSON.parse(String(rawBody));}catch{throw coded("INVALID_JSON",400,"Stripe webhook body is invalid JSON.");}
    if(!event.id||!event.type)throw coded("STRIPE_EVENT_INVALID",400,"Stripe event ID and type are required.");
    if(String(this.env.NODE_ENV||"").toLowerCase()==="production"&&!event.livemode)throw coded("STRIPE_TEST_EVENT_REJECTED",400,"Test-mode Stripe events cannot affect production campaign accounting.");
    const digest=crypto.createHash("sha256").update(String(rawBody)).digest("hex");
    const inserted=this.db.prepare("INSERT OR IGNORE INTO one_dollar_webhook_events (event_id,event_type,payload_sha256,received_at) VALUES(?,?,?,?)")
      .run(String(event.id),String(event.type),digest,new Date().toISOString());
    if(!inserted.changes){const prior=this.db.prepare("SELECT processed_at FROM one_dollar_webhook_events WHERE event_id=?").get(String(event.id));if(prior&&prior.processed_at)return {duplicate:true,event_id:event.id};}
    const object=event.data&&event.data.object||{},metadata=object.metadata||{};
    let handled=false;
    if(metadata.experiment_id===EXPERIMENT_ID&&event.type==="checkout.session.completed"&&object.payment_status==="paid"){
      if(Number(object.amount_total)!==100||String(object.currency).toLowerCase()!=="usd")throw coded("CAMPAIGN_PAYMENT_AMOUNT_INVALID",422,"The campaign accepts exactly USD $1 per contribution.");
      const checkout=this.db.prepare("SELECT * FROM one_dollar_checkouts WHERE id=? AND stripe_session_id=?").get(String(metadata.checkout_id||""),String(object.id||""));
      if(!checkout)throw coded("CAMPAIGN_CHECKOUT_NOT_FOUND",404,"The matching campaign checkout was not found.");
      const pi=paymentIntentId(object.payment_intent);
      this.db.prepare("UPDATE one_dollar_checkouts SET status='paid',payment_intent_id=?,paid_at=? WHERE id=?").run(pi,new Date().toISOString(),checkout.id);
      if(pi)await this.reconcilePaymentIntent(checkout.id,pi).catch(e=>this.log("fee.reconciliation_deferred",{checkout_id:checkout.id,error:e.message}));
      handled=true;this.log("contribution.verified",{checkout_id:checkout.id,stripe_event_id:event.id,amount_cents:100});
    } else if(event.type==="charge.refunded"){
      const pi=paymentIntentId(object.payment_intent),checkout=pi&&this.db.prepare("SELECT * FROM one_dollar_checkouts WHERE payment_intent_id=?").get(pi);
      if(checkout){this.upsertAdjustment(checkout.id,"refund",Math.min(100,Math.max(0,Number(object.amount_refunded||0))),String(object.id||event.id),"confirmed");handled=true;}
    } else if(event.type==="charge.dispute.created"||event.type==="charge.dispute.closed"){
      const pi=paymentIntentId(object.payment_intent),checkout=pi&&this.db.prepare("SELECT * FROM one_dollar_checkouts WHERE payment_intent_id=?").get(pi);
      if(checkout){const status=event.type==="charge.dispute.created"?"open":String(object.status||"unknown");const amount=status==="won"?0:Math.min(100,Math.max(0,Number(object.amount||0)));this.upsertAdjustment(checkout.id,"dispute",amount,String(object.id||event.id),status);handled=true;}
    } else if(event.type==="charge.succeeded"){
      const pi=paymentIntentId(object.payment_intent),checkout=pi&&this.db.prepare("SELECT * FROM one_dollar_checkouts WHERE payment_intent_id=?").get(pi);
      if(checkout&&object.balance_transaction){await this.storeFee(checkout.id,object.balance_transaction);handled=true;}
    }
    this.db.prepare("UPDATE one_dollar_webhook_events SET processed_at=? WHERE event_id=?").run(new Date().toISOString(),String(event.id));
    return {processed:true,handled:handled,event_id:event.id,type:event.type};
  }
  upsertAdjustment(checkoutId,kind,amount,reference,status){
    this.db.prepare("INSERT INTO one_dollar_payment_adjustments (id,checkout_id,kind,amount_cents,provider_reference,status,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(kind,provider_reference) DO UPDATE SET amount_cents=excluded.amount_cents,status=excluded.status,updated_at=excluded.updated_at")
      .run(crypto.randomUUID(),checkoutId,kind,amount,reference,status,new Date().toISOString());
  }
  async reconcilePaymentIntent(checkoutId,paymentIntentId){
    const url=new URL("https://api.stripe.com/v1/payment_intents/"+encodeURIComponent(paymentIntentId));url.searchParams.append("expand[]","latest_charge.balance_transaction");
    const response=await this.stripe.fetch(url.toString(),{headers:{authorization:"Bearer "+this.stripe.secretKey},signal:AbortSignal.timeout(12000)});
    const payload=await response.json().catch(()=>({}));if(!response.ok)throw coded("STRIPE_FEE_LOOKUP_FAILED",502,payload.error&&payload.error.message||"Stripe fee lookup failed.");
    const charge=payload.latest_charge&&typeof payload.latest_charge==="object"?payload.latest_charge:null,transaction=charge&&charge.balance_transaction;
    if(transaction&&typeof transaction==="object"&&transaction.id)return this.saveFee(checkoutId,transaction);
    if(typeof transaction==="string")return this.storeFee(checkoutId,transaction);
    throw coded("STRIPE_FEE_PENDING",409,"Stripe has not exposed the balance transaction fee yet.");
  }
  async storeFee(checkoutId,balanceTransactionId){
    const response=await this.stripe.fetch("https://api.stripe.com/v1/balance_transactions/"+encodeURIComponent(balanceTransactionId),{headers:{authorization:"Bearer "+this.stripe.secretKey},signal:AbortSignal.timeout(12000)});
    const payload=await response.json().catch(()=>({}));if(!response.ok||!payload.id)throw coded("STRIPE_FEE_LOOKUP_FAILED",502,payload.error&&payload.error.message||"Stripe fee lookup failed.");
    return this.saveFee(checkoutId,payload);
  }
  saveFee(checkoutId,transaction){
    this.db.prepare("INSERT INTO one_dollar_fee_reconciliation (checkout_id,balance_transaction_id,fee_cents,currency,reconciled_at) VALUES(?,?,?,?,?) ON CONFLICT(checkout_id) DO UPDATE SET balance_transaction_id=excluded.balance_transaction_id,fee_cents=excluded.fee_cents,currency=excluded.currency,reconciled_at=excluded.reconciled_at")
      .run(checkoutId,String(transaction.id),Math.max(0,Number(transaction.fee||0)),String(transaction.currency||"usd"),new Date().toISOString());
    return {fee_cents:Number(transaction.fee||0),balance_transaction_id:transaction.id};
  }
  async reconcilePendingFees(limit=50){
    const rows=this.db.prepare("SELECT id,payment_intent_id FROM one_dollar_checkouts WHERE status='paid' AND payment_intent_id IS NOT NULL AND id NOT IN (SELECT checkout_id FROM one_dollar_fee_reconciliation) ORDER BY paid_at ASC LIMIT ?").all(Math.max(1,Math.min(250,Number(limit)||50)));
    const results=[];for(const row of rows){try{results.push({checkout_id:row.id,...await this.reconcilePaymentIntent(row.id,row.payment_intent_id)});}catch(e){results.push({checkout_id:row.id,error:e.code||e.message});}}
    return {attempted:rows.length,reconciled:results.filter(x=>x.fee_cents!==undefined).length,results};
  }
  snapshot(){
    const t=this.db.prepare("SELECT COUNT(*) AS paid_checkouts,COALESCE(SUM(amount_cents),0) AS gross_cents,COALESCE(SUM(CASE WHEN status='paid' AND id IN (SELECT checkout_id FROM one_dollar_payment_adjustments WHERE kind='refund') THEN (SELECT COALESCE(SUM(amount_cents),0) FROM one_dollar_payment_adjustments a WHERE a.checkout_id=one_dollar_checkouts.id AND a.kind='refund') ELSE 0 END),0) AS refunded_cents,COALESCE(SUM(CASE WHEN status='paid' AND id IN (SELECT checkout_id FROM one_dollar_payment_adjustments WHERE kind='dispute') THEN (SELECT COALESCE(SUM(amount_cents),0) FROM one_dollar_payment_adjustments a WHERE a.checkout_id=one_dollar_checkouts.id AND a.kind='dispute' AND a.status!='won') ELSE 0 END),0) AS disputed_cents,(SELECT COUNT(*) FROM one_dollar_fee_reconciliation) AS fee_reconciled_count,(SELECT COALESCE(SUM(fee_cents),0) FROM one_dollar_fee_reconciliation) AS processor_fee_cents,(SELECT COUNT(*) FROM one_dollar_checkouts WHERE status='paid' AND referral_code IS NOT NULL) AS referred_checkouts FROM one_dollar_checkouts WHERE status='paid'").get();
    const participants=this.db.prepare("SELECT COUNT(*) AS count FROM one_dollar_checkouts c WHERE c.status='paid' AND COALESCE((SELECT SUM(amount_cents) FROM one_dollar_payment_adjustments a WHERE a.checkout_id=c.id AND a.kind='refund'),0)<c.amount_cents AND COALESCE((SELECT SUM(amount_cents) FROM one_dollar_payment_adjustments a WHERE a.checkout_id=c.id AND a.kind='dispute' AND a.status!='won'),0)<c.amount_cents").get().count;
    const feesComplete=Number(t.paid_checkouts)===Number(t.fee_reconciled_count),net=feesComplete?Math.max(0,Number(t.gross_cents)-Number(t.refunded_cents)-Number(t.disputed_cents)-Number(t.processor_fee_cents)):null;
    return {experiment:EXPERIMENT_ID,status:this.enabled&&this.stripe.configured()&&this.baseUrl?"accepting_contributions":"prelaunch",goal_participants:GOAL_PARTICIPANTS,contribution_cents:100,verified_participants:Number(participants),gross_paid_cents:Number(t.gross_cents),refunded_cents:Number(t.refunded_cents),disputed_cents:Number(t.disputed_cents),processor_fee_cents:feesComplete?Number(t.processor_fee_cents):null,fees_reconciled:feesComplete,net_proceeds_cents:net,personal_allocation_cents:net===null?null:Math.floor(net/2),cyvxai_allocation_cents:net===null?null:net-Math.floor(net/2),referred_contributions:Number(t.referred_checkouts),progress_percent:Number((Number(participants)/GOAL_PARTICIPANTS*100).toFixed(8)),remaining_participants:Math.max(0,GOAL_PARTICIPANTS-Number(participants)),updated_at:new Date().toISOString(),accounting_note:feesComplete?"Net proceeds equal verified payments less refunds, open/lost disputes, and reconciled Stripe processing fees. Net is allocated 50/50.":"Net proceeds and allocations are withheld until every paid checkout has an actual Stripe fee reconciliation."};
  }
  health(){return {database:true,stripe:this.stripe.snapshot(),checkout_enabled:this.enabled,public_url_configured:Boolean(this.baseUrl),schema:1};}
  log(event,data){try{this.logger.write({level:"info",event:"one_dollar."+event,...data,at:new Date().toISOString()});}catch{}}
}
function paymentIntentId(v){return typeof v==="string"?v:v&&v.id?String(v.id):null;}
function cleanCode(v){const x=String(v||"").trim().toUpperCase();return /^[A-Z0-9_-]{4,32}$/.test(x)?x:null;}
function cleanSource(v){const x=String(v||"direct").trim().toLowerCase();return /^[a-z0-9_-]{1,40}$/.test(x)?x:"direct";}
function coded(code,statusCode,message){const e=new Error(message);e.code=code;e.statusCode=statusCode;return e;}
module.exports={OneDollarExperiment,EXPERIMENT_ID,GOAL_PARTICIPANTS,CONTRIBUTION_CENTS};
