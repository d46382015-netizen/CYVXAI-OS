"use strict";

const COLORS = Object.freeze({
  OPERATE: "#9D4EDD",
  SECURE: "#00FF66",
  BUILD: "#0066FF",
});

const TRIGGERS = Object.freeze({
  MANUAL: {
    keyword: "MANUAL",
    pillar: "OPERATE",
    intent: "GENERAL_OPERATOR",
    source: "POST_001",
    reply: "System access request received. Opening secure transmission link...",
    asset: "CYVX_Operator_Readiness_Assessment.pdf",
  },
  SECURE: {
    keyword: "SECURE",
    pillar: "SECURE",
    intent: "SECURITY",
    source: "POST_002",
    reply: "Transmission sent. Review your DM logs for the security checklist link.",
    asset: "CYVX_Phone_Theft_Response_Checklist.pdf",
  },
  DEPLOY: {
    keyword: "DEPLOY",
    pillar: "BUILD",
    intent: "MOBILE_BUILD",
    source: "POST_003",
    reply: "Field manual dispatched. Terminal deployment parameters inbound.",
    asset: "Mobile_Website_Starter_Files.zip",
  },
});

const POSTS = Object.freeze([
  {
    id: "POST_001",
    slug: "operator-system",
    category: "OPERATE",
    module: "OPERATE / 001",
    keyword: "MANUAL",
    title: "YOU DO NOT NEED MORE MOTIVATION",
    slides: [
      { eyebrow: "CYVX FIELD MANUAL", title: "YOU DO NOT NEED\nMORE MOTIVATION.", body: "YOU NEED\nAN OPERATING SYSTEM.", kind: "cover" },
      { eyebrow: "THE FAILURE MODE", title: "INFORMATION IS NOT CAPABILITY.", bullets: ["A SAVED VIDEO DOES NOT CREATE REVENUE", "A PROMPT DOES NOT BUILD A BUSINESS", "AN IDEA DOES NOT PRODUCE PROOF"] },
      { eyebrow: "01 / INPUT", title: "START WITH REALITY.", bullets: ["WHAT DO YOU HAVE?", "WHAT DO YOU NEED?", "WHAT IS BLOCKING PROGRESS?", "WHAT OUTCOME MUST CHANGE?"] },
      { eyebrow: "02 / SYSTEM", title: "TURN THE OUTCOME INTO A SYSTEM.", bullets: ["REQUIREMENTS", "ACTIONS", "AUTOMATION", "STORAGE", "VALIDATION", "MEASUREMENT"] },
      { eyebrow: "03 / EXECUTION", title: "BUILD THE SMALLEST SYSTEM THAT PRODUCES A REAL RESULT.", body: "NOT A MOCKUP.\nNOT A PROMISE.\nNOT AN IDEA." },
      { eyebrow: "04 / PROOF", title: "THE SYSTEM IS NOT COMPLETE UNTIL THE RESULT CAN BE:", bullets: ["VERIFIED", "REPEATED", "MEASURED", "IMPROVED", "SOLD"] },
      { eyebrow: "THE CYVX LOOP", title: "INPUT → MODEL → EXECUTE", body: "MEASURE → LEARN → IMPROVE → MONETIZE" },
      { eyebrow: "ACCESS CONTROL", title: "COMMENT: MANUAL", body: "RECEIVE THE CYVX OPERATOR READINESS ASSESSMENT.", kind: "cta" },
    ],
  },
  {
    id: "POST_002",
    slug: "secure-phone",
    category: "SECURE",
    module: "SECURE / 015",
    keyword: "SECURE",
    title: "SECURE YOUR PHONE BEFORE IT GETS STOLEN",
    slides: [
      { eyebrow: "CYVX FIELD MANUAL", title: "IF YOUR PHONE\nDISAPPEARED TODAY—", body: "HOW MUCH OF YOUR LIFE\nWOULD DISAPPEAR WITH IT?", kind: "cover" },
      { eyebrow: "THREAT SURFACE", title: "YOUR PHONE MAY CONTROL:", bullets: ["EMAIL", "BANKING", "PASSWORD RESETS", "SOCIAL ACCOUNTS", "CLOUD FILES", "AUTHENTICATION CODES"] },
      { eyebrow: "01 / PREPARE", title: "REPLACE A WEAK PIN.", body: "USE A LONG, UNIQUE DEVICE PASSCODE. KEEP YOUR MAIN ACCOUNT PASSWORD DIFFERENT." },
      { eyebrow: "02 / BUILD", title: "ENABLE THE RECOVERY CONTROLS.", bullets: ["DEVICE FINDING", "REMOTE LOCKING", "TWO-FACTOR AUTHENTICATION", "STOLEN-DEVICE PROTECTION", "HIDDEN LOCK-SCREEN NOTICES"] },
      { eyebrow: "03 / DEPLOY", title: "CREATE AN EXTERNAL RECOVERY SYSTEM.", bullets: ["BACKUP CODES", "SECOND TRUSTED DEVICE", "CARRIER INFORMATION", "DEVICE SERIAL / IMEI", "OFFLINE RECOVERY COPY"] },
      { eyebrow: "04 / VERIFY", title: "LOCK THE PHONE AND TEST:", bullets: ["REMOTE FIND", "REMOTE LOCK", "BACKUP CODE ACCESS", "RECOVERY FROM A SECOND DEVICE"] },
      { eyebrow: "CRITICAL RULE", title: "DO NOT STORE EVERY RECOVERY METHOD ON THE DEVICE YOU ARE PROTECTING.", body: "ONE DEVICE MUST NOT BE THE ONLY KEY TO YOUR DIGITAL LIFE." },
      { eyebrow: "ACCESS CONTROL", title: "COMMENT: SECURE", body: "GET THE PHONE THEFT RESPONSE CHECKLIST.", kind: "cta" },
    ],
  },
  {
    id: "POST_003",
    slug: "mobile-website",
    category: "BUILD",
    module: "BUILD / 002",
    keyword: "DEPLOY",
    title: "DEPLOY A WEBSITE FROM YOUR PHONE",
    slides: [
      { eyebrow: "CYVX FIELD MANUAL", title: "NO COMPUTER?", body: "DEPLOY A REAL WEBSITE\nFROM YOUR ANDROID PHONE.", kind: "cover" },
      { eyebrow: "SYSTEM REQUIREMENTS", title: "ANDROID + TERMUX + DEPLOYMENT ACCOUNT", bullets: ["TIME: 20 MINUTES", "COST: $0", "DIFFICULTY: INTERMEDIATE", "OUTPUT: LIVE PRODUCTION URL"] },
      { eyebrow: "01 / PREPARE", title: "CREATE THE PROJECT.", code: "mkdir -p ~/cyvx-site\ncd ~/cyvx-site" },
      { eyebrow: "02 / BUILD", title: "YOUR PAGE NEEDS:", bullets: ["CLEAR OFFER", "PROBLEM", "OUTCOME", "PROOF", "CALL TO ACTION", "CONTACT PATH"] },
      { eyebrow: "03 / DEPLOY", title: "PUBLISH FROM TERMUX.", code: "pkg update -y\npkg install -y nodejs git\nnpm install -g vercel\nvercel login\nvercel --prod" },
      { eyebrow: "04 / VERIFY", title: "CHECK THE PRODUCTION SYSTEM.", bullets: ["HTTPS", "MOBILE LAYOUT", "WORKING BUTTONS", "PAGE TITLE", "LOAD SPEED", "LIVE URL"] },
      { eyebrow: "THE OWNED ASSET", title: "A LIVE WEBSITE CAN:", bullets: ["SELL", "COLLECT LEADS", "SHOW PROOF", "BOOK CLIENTS"] },
      { eyebrow: "ACCESS CONTROL", title: "COMMENT: DEPLOY", body: "GET THE MOBILE WEBSITE STARTER FILES.", kind: "cta" },
    ],
  },
]);

function normalizeKeyword(value) {
  return String(value || "").trim().toUpperCase();
}

function validateEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function resolveTrigger(keyword) {
  return TRIGGERS[normalizeKeyword(keyword)] || null;
}

module.exports = { COLORS, TRIGGERS, POSTS, normalizeKeyword, validateEmail, resolveTrigger };
