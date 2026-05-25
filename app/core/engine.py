import pandas as pd
from io import StringIO

def scan_csv_safe(content: bytes):
    text = content.decode("utf-8", errors="ignore")
    df = pd.read_csv(StringIO(text))

    if df.empty:
        return {"total_waste": 0, "issues": []}

    if "vendor" not in df.columns:
        df["vendor"] = "unknown"

    if "amount" not in df.columns:
        df["amount"] = 0

    issues = []
    grouped = df.groupby("vendor")["amount"].sum()

    for vendor, total in grouped.items():
        if total > 500:
            issues.append({
                "vendor": vendor,
                "type": "high_spend",
                "impact": float(total)
            })

    return {
        "total_waste": float(df["amount"].sum()),
        "issues": issues
    }
