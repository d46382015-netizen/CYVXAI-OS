from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from datetime import datetime

def generate_pdf_report(result, filename="reports/report.pdf"):
    doc = SimpleDocTemplate(filename)
    styles = getSampleStyleSheet()

    content = []

    # Title
    content.append(Paragraph("LeakOS Financial Waste Report", styles["Title"]))
    content.append(Spacer(1, 12))

    # Timestamp
    content.append(Paragraph(f"Generated: {datetime.now()}", styles["Normal"]))
    content.append(Spacer(1, 12))

    # Total waste
    content.append(
        Paragraph(f"<b>Total Monthly Waste:</b> ${result['total_waste']}", styles["Heading2"])
    )
    content.append(Spacer(1, 12))

    # Issues
    content.append(Paragraph("Key Findings:", styles["Heading2"]))
    content.append(Spacer(1, 6))

    for issue in result["issues"]:
        text = f"- {issue['vendor']} | {issue['type']} | Impact: ${issue['impact']}"
        content.append(Paragraph(text, styles["Normal"]))

    doc.build(content)

    return filename
