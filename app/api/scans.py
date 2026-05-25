import uuid
from app.db.database import get_conn

def create_scan(tenant_id, rows):
    scan_id = str(uuid.uuid4())
    total = sum(r["amount"] for r in rows)

    conn = get_conn()
    c = conn.cursor()

    c.execute(
        "INSERT INTO scans VALUES (?,?,?)",
        (scan_id, tenant_id, total)
    )

    # usage billing hook
    cost = total * 0.001
    c.execute(
        "INSERT INTO usage(tenant_id,cost) VALUES (?,?)",
        (tenant_id, cost)
    )

    conn.commit()
    conn.close()

    return {
        "scan_id": scan_id,
        "total": total,
        "cost": cost
    }
