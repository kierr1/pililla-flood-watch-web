import type { FloodReading } from "@/hooks/useData";

export type ExportFormat = "csv" | "excel" | "pdf";
const heads = ["Recorded At", "Station ID", "Water Level (m)", "Wind Speed (km/h)", "Image URL"];
const enc = new TextEncoder();
async function loadLogoBytes(): Promise<Uint8Array> {
  const response = await fetch("/export-logo.jpg");
  if (!response.ok) throw new Error("Unable to load export logo");
  return new Uint8Array(await response.arrayBuffer());
}
function rowsOf(readings: FloodReading[]) {
  return readings.map(r => [r.recorded_at, r.station_id ?? "", r.water_level_m?.toString() ?? "",
    r.wind_speed == null ? "" : (r.wind_speed * 3.6).toFixed(2),
    !r.image_url || r.image_url === "#" ? "" : r.image_url]);
}
function download(bytes: BlobPart, file: string, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = file;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function crc32(b: Uint8Array) {
  let c = -1;
  for (const v of b) { c ^= v; for (let j = 0; j < 8; j++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); }
  return (c ^ -1) >>> 0;
}
function zip(files: { name: string; data: string | Uint8Array }[]) {
  const chunks: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const n = enc.encode(f.name), b = typeof f.data === "string" ? enc.encode(f.data) : f.data, crc = crc32(b);
    const local = new Uint8Array(30 + n.length), l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true);
    l.setUint16(6, 2048, true); l.setUint32(14, crc, true);
    l.setUint32(18, b.length, true); l.setUint32(22, b.length, true);
    l.setUint16(26, n.length, true); local.set(n, 30);
    chunks.push(local, b);
    const d = new Uint8Array(46 + n.length), v = new DataView(d.buffer);
    v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true);
    v.setUint16(6, 20, true); v.setUint16(8, 2048, true);
    v.setUint32(16, crc, true); v.setUint32(20, b.length, true);
    v.setUint32(24, b.length, true); v.setUint16(28, n.length, true);
    v.setUint32(42, offset, true); d.set(n, 46);
    central.push(d); offset += local.length + b.length;
  }
  const dirStart = offset;
  for (const d of central) { chunks.push(d); offset += d.length; }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true); e.setUint32(12, offset - dirStart, true);
  e.setUint32(16, dirStart, true); chunks.push(end);
  const out = new Uint8Array(offset + end.length);
  let p = 0; for (const chunk of chunks) { out.set(chunk, p); p += chunk.length; }
  return out;
}
function xlsx(rows: string[][], logo: Uint8Array) {
  const branding = '<row r="1" ht="53" customHeight="1"><c r="B1" s="1" t="inlineStr"><is><t>PILILLA FLOOD WATCH</t></is></c></row>'
    + '<row r="2"><c r="B2" s="2" t="inlineStr"><is><t>SENSOR HISTORY / DATA EXPORT</t></is></c></row>'
    + '<row r="4"><c r="A4" s="3" t="inlineStr"><is><t>RECENT SENSOR READINGS</t></is></c></row>'
    + '<row r="5"><c r="A5" s="4" t="inlineStr"><is><t>Generated: ' + xml(new Date().toLocaleString("en-PH")) + ' | Records: ' + rows.length + '</t></is></c></row>';
  const xmlRows = [heads, ...rows].map((row, i) => {
    const rowIndex = i + 7;
    const cols = row.map((val, j) => {
      const addr = String.fromCharCode(65 + j) + rowIndex;
      const num = i > 0 && j >= 2 && j <= 3 && val !== "" && Number.isFinite(+val);
      return num ? '<c r="' + addr + '" s="0"><v>' + Number(val) + '</v></c>' :
        '<c r="' + addr + '" s="' + (i === 0 ? 5 : 0) + '" t="inlineStr"><is><t>' + xml(val.replace(/[\x00-\x1f]/g, "")) + '</t></is></c>';
    }).join("");
    return '<row r="' + rowIndex + '">' + cols + '</row>';
  }).join("");
  return zip([
    { name: "xl/media/logo.jpg", data: logo },
    { name: "xl/drawings/drawing1.xml", data: '<?xml version="1.0"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="685800" cy="685800"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Pililla Flood Watch Logo"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>' },
    { name: "xl/drawings/_rels/drawing1.xml.rels", data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.jpg"/></Relationships>' },
    { name: "xl/worksheets/_rels/sheet1.xml.rels", data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>' },
    { name: "[Content_Types].xml", data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: "_rels/.rels", data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: "xl/workbook.xml", data: '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sensor History" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: "xl/_rels/workbook.xml.rels", data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: "xl/styles.xml", data: '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="18"/><color rgb="FF0852B8"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF068DE8"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0964D6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/></cellXfs></styleSheet>' },
    { name: "xl/worksheets/sheet1.xml", data: '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="25" customWidth="1"/><col min="2" max="2" width="38" customWidth="1"/><col min="3" max="4" width="19" customWidth="1"/><col min="5" max="5" width="85" customWidth="1"/></cols><sheetData>' + branding + xmlRows + '</sheetData><autoFilter ref="A7:E' + (rows.length + 7) + '"/><drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></worksheet>' },
  ]);
}
function pdf(rows: string[][], logo: Uint8Array): Uint8Array {
  const esc = (v: string) => v.replace(/[^\x20-\x7e]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const pages: string[] = [];
  let commands: string[] = [], y = 0, count = 0;
  const rect = (x: number, yy: number, w: number, h: number, c: string) => commands.push(c + " rg " + x + " " + yy + " " + w + " " + h + " re f");
  const label = (x: number, yy: number, v: string, size = 9, color = "0.10 0.20 0.40", font = "F1") =>
    commands.push(color + " rg BT /" + font + " " + size + " Tf 1 0 0 1 " + x + " " + yy + " Tm (" + esc(v) + ") Tj ET");
  function beginPage() {
    if (commands.length) pages.push(commands.join("\n"));
    commands = []; count = 0;
    rect(0, 0, 842, 595, "1 1 1");
    rect(0, 502, 842, 93, "0.03 0.16 0.59");
    rect(0, 497, 842, 5, "0.09 0.74 1");
    commands.push("q 72 0 0 72 724 514 cm /Logo Do Q");
    label(120, 557, "PILILLA FLOOD WATCH", 21, "1 1 1", "F2");
    label(120, 535, "RECENT SENSOR READINGS  /  OFFICIAL EXPORT", 10, "0.70 0.94 1", "F2");
    label(40, 465, "HISTORICAL SENSOR REPORT", 14, "0.05 0.20 0.55", "F2");
    label(40, 446, "Generated: " + new Date().toLocaleString("en-PH") + "  |  " + rows.length + " records  |  km/h", 9);
    rect(40, 406, 760, 29, "0.06 0.37 0.83");
    label(48, 416, "RECORDED AT", 9, "1 1 1", "F2");
    label(230, 416, "STATION ID", 9, "1 1 1", "F2");
    label(505, 416, "WATER (m)", 9, "1 1 1", "F2");
    label(650, 416, "WIND (km/h)", 9, "1 1 1", "F2");
    rect(40, 28, 760, 1, "0.72 0.84 0.94");
    label(40, 14, "PILILLA FLOOD WATCH   /   SENSOR MONITORING", 7, "0.28 0.40 0.58");
    y = 402;
  }
  beginPage();
  for (const row of rows) {
    const links = row[4] ? (row[4].match(/.{1,125}/g) ?? []) : [];
    const height = 31 + links.length * 11;
    if (y - height < 40) beginPage();
    if (count % 2 === 0) rect(40, y - height + 3, 760, height, "0.92 0.96 1");
    label(48, y - 16, row[0].replace("T", " ").replace("Z", " UTC").slice(0, 26));
    label(230, y - 16, row[1].slice(0, 39), 8);
    label(505, y - 16, row[2] || "-", 10, "0.03 0.29 0.70", "F2");
    label(650, y - 16, row[3] || "-", 10, "0.03 0.29 0.70", "F2");
    links.forEach((part, index) => label(48, y - 30 - index * 11, (index ? "" : "Snapshot: ") + part, 7, "0.28 0.42 0.58"));
    y -= height;
    count++;
  }
  pages.push(commands.join("\n"));
  const parts: Uint8Array[] = [];
  let length = 0;
  const offsets: number[] = [0];
  const write = (value: string | Uint8Array) => { const b = typeof value === "string" ? enc.encode(value) : value; parts.push(b); length += b.length; };
  const objects: (string | Uint8Array)[] = ["", "<< /Type /Catalog /Pages 2 0 R >>", "", 
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>", ""];
  const pageRefs: string[] = [];
  for (const [index, content] of pages.entries()) {
    const id = objects.length, contentId = id + 1;
    pageRefs.push(id + " 0 R");
    const line = "0.31 0.42 0.56 rg BT /F1 8 Tf 1 0 0 1 725 14 Tm (Page " + (index + 1) + " / " + pages.length + ") Tj ET";
    const stream = content + "\n" + line;
    objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Logo 5 0 R >> >> /Contents " + contentId + " 0 R >>");
    objects.push("<< /Length " + enc.encode(stream).length + " >>\nstream\n" + stream + "\nendstream");
  }
  objects[2] = "<< /Type /Pages /Kids [" + pageRefs.join(" ") + "] /Count " + pages.length + " >>";
  write("%PDF-1.4\n");
  for (let i = 1; i < objects.length; i++) {
    offsets.push(length);
    if (i === 5) {
      write("5 0 obj\n<< /Type /XObject /Subtype /Image /Width 96 /Height 96 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + logo.length + " >>\nstream\n");
      write(logo); write("\nendstream\nendobj\n");
    } else { write(i + " 0 obj\n"); write(objects[i]); write("\nendobj\n"); }
  }
  const xref = length;
  write("xref\n0 " + objects.length + "\n0000000000 65535 f \n");
  for (let i = 1; i < objects.length; i++) write(String(offsets[i]).padStart(10, "0") + " 00000 n \n");
  write("trailer\n<< /Size " + objects.length + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF");
  const out = new Uint8Array(length); let pos = 0;
  for (const part of parts) { out.set(part, pos); pos += part.length; }
  return out;
}
export async function exportSensorHistory(readings: FloodReading[], format: ExportFormat) {
  if (!readings.length) return;
  const rows = rowsOf(readings);
  const name = "pililla-sensor-history-" + new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    const csv = [heads, ...rows].map(r => r.map(v => '"' + v.replace(/"/g, '""') + '"').join(",")).join("\r\n");
    download("\uFEFF" + csv, name + ".csv", "text/csv;charset=utf-8");
  } else if (format === "excel") {
    download(xlsx(rows, await loadLogoBytes()), name + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  } else {
    download(pdf(rows, await loadLogoBytes()), name + ".pdf", "application/pdf");
  }
}
