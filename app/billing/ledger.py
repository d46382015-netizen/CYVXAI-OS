from datetime import datetime

LEDGER = {}

def charge(tenant_id, amount):
    if tenant_id not in LEDGER:
        LEDGER[tenant_id] = []

    LEDGER[tenant_id].append({
        "amount": amount,
        "ts": datetime.utcnow().isoformat()
    })

def balance(tenant_id):
    return sum(x["amount"] for x in LEDGER.get(tenant_id, []))
