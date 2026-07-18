"use strict";

function pdfEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function createSimplePdf(title, sections) {
  const contentLines = [title, "", ...sections.flatMap((section) => [section.heading, ...section.lines, ""])];
  let y = 742;
  const commands = ["BT", "/F1 18 Tf", `72 ${y} Td`, `(${pdfEscape(contentLines[0])}) Tj`, "/F1 11 Tf"];
  y -= 30;
  for (const line of contentLines.slice(1)) {
    if (y < 60) break;
    commands.push(`0 -18 Td (${pdfEscape(line)}) Tj`);
    y -= 18;
  }
  commands.push("ET");
  const stream = commands.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj",
    `4 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Courier >> endobj",
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(output));
    output += `${object}\n`;
  }
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) output += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  output += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, "binary");
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    localParts.push(local, data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, central, end]);
}

function buildDownloadAsset(filename) {
  if (filename === "CYVX_Operator_Readiness_Assessment.pdf") {
    return createSimplePdf("CYVX OPERATOR READINESS ASSESSMENT", [
      { heading: "MISSION", lines: ["Identify the single constraint preventing the most progress."] },
      { heading: "SCORE 0-2", lines: ["Offer clarity", "Lead capture", "Sales pipeline", "Fulfillment", "Automation", "Measurement", "Revenue proof"] },
      { heading: "NEXT ACTION", lines: ["Select the lowest-scoring system and execute one measurable correction within 24 hours."] },
    ]);
  }
  if (filename === "CYVX_Phone_Theft_Response_Checklist.pdf") {
    return createSimplePdf("CYVX PHONE THEFT RESPONSE CHECKLIST", [
      { heading: "BEFORE LOSS", lines: ["Use a long unique device passcode", "Enable device finding and remote lock", "Store backup codes outside the phone", "Record carrier and device identifiers"] },
      { heading: "AFTER LOSS", lines: ["Activate lost mode or remote lock", "Contact the carrier", "Review email and financial sessions", "Change exposed credentials", "Preserve incident evidence"] },
    ]);
  }
  if (filename === "Mobile_Website_Starter_Files.zip") {
    return createZip([
      { name: "index.html", content: "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>CYVX Mobile Site</title><link rel=\"stylesheet\" href=\"styles.css\"><main><p class=\"label\">CYVX / BUILD</p><h1>Turn one clear outcome into one clear action.</h1><p>Replace this copy with the buyer, problem, measurable outcome, proof, and call to action.</p><a href=\"mailto:operator@example.com\">Request access</a></main></html>" },
      { name: "styles.css", content: ":root{font-family:ui-monospace,monospace;color:#f3f4f6;background:#0d0e10}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}main{max-width:720px;border:1px solid #343840;padding:48px;background:#16181c}h1{font-size:clamp(2.5rem,8vw,5rem);line-height:.98}p{line-height:1.6;color:#a1a7b3}.label,a{color:#0066ff}a{display:inline-block;margin-top:20px;font-weight:700}" },
      { name: "README.md", content: "# Mobile Website Starter\n\nRun locally with `python -m http.server 8080` or deploy with `vercel --prod`. Replace the offer, proof, and CTA before publishing.\n" },
      { name: "verify.sh", content: "#!/usr/bin/env sh\nset -eu\ntest -f index.html\ntest -f styles.css\ngrep -q '<meta name=\"viewport\"' index.html\necho 'starter verified'\n" },
    ]);
  }
  return null;
}

module.exports = { createSimplePdf, createZip, buildDownloadAsset };
