import pandas as pd

def detect_leaks(rows):
    df = pd.DataFrame(rows)

    if df.empty or "vendor" not in df.columns:
        return {"total_waste": 0, "issues": []}

    if "amount" not in df.columns:
        df["amount"] = 0

    issues = []
    vendor_totals = df.groupby("vendor")["amount"].sum()

    # 1. duplicate vendor (REALISTIC VERSION)
    for vendor, total in vendor_totals.items():
        count = len(df[df["vendor"] == vendor])

        if count > 1:
            issues.append({
                "type": "duplicate_vendor",
                "vendor": vendor,
                "impact": float(total * 0.1)
            })

    # 2. high spend (clean, not repeated per row)
    for vendor, total in vendor_totals.items():
        if total > 500:
            issues.append({
                "type": "high_spend",
                "vendor": vendor,
                "impact": float(total)
            })

    # remove duplicates by vendor + type
    seen = set()
    clean = []
    for i in issues:
        key = (i["vendor"], i["type"])
        if key not in seen:
            seen.add(key)
            clean.append(i)

    total = sum(i["impact"] for i in clean)

    return {
        "total_waste": round(total, 2),
        "issues": sorted(clean, key=lambda x: x["impact"], reverse=True)
    }
