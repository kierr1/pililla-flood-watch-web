import type { FloodReading } from "@/hooks/useData";

export type ExportFormat = "csv" | "excel" | "pdf";
const heads = ["Recorded At", "Station ID", "Water Level (m)", "Wind Speed (km/h)", "Image URL"];
const enc = new TextEncoder();
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
function zip(files: { name: string; data: string }[]) {
  const chunks: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const n = enc.encode(f.name), b = enc.encode(f.data), crc = crc32(b);
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
function xlsx(rows: string[][]) {
  const xmlRows = [heads, ...rows].map((row, i) => {
    const cols = row.map((val, j) => {
      const addr = String.fromCharCode(65 + j) + (i + 1);
      const num = i > 0 && j >= 2 && j <= 3 && val !== "" && Number.isFinite(+val);
      return num ? '<c r="' + addr + '"><v>' + Number(val) + '</v></c>' :
        '<c r="' + addr + '" t="inlineStr"><is><t>' + xml(val.replace(/[\x00-\x1f]/g, "")) + '</t></is></c>';
    }).join("");
    return '<row r="' + (i + 1) + '">' + cols + '</row>';
  }).join("");
  return zip([
    { name: "[Content_Types].xml", data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: "_rels/.rels", data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: "xl/workbook.xml", data: '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sensor History" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: "xl/_rels/workbook.xml.rels", data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: "xl/worksheets/sheet1.xml", data: '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="25" customWidth="1"/><col min="2" max="2" width="38" customWidth="1"/><col min="3" max="4" width="19" customWidth="1"/><col min="5" max="5" width="85" customWidth="1"/></cols><sheetData>' + xmlRows + '</sheetData><autoFilter ref="A1:E' + (rows.length + 1) + '"/></worksheet>' },
  ]);
}
function pdf(rows: string[][]) {
  const esc = (s: string) => s.replace(/[^\x20-\x7e]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const pages: string[][] = [];
  let ops: string[] = [];
  let y = 0;
  let onPage = 0;
  const rectangle = (x: number, bottom: number, w: number, h: number, rgb: string) =>
    ops.push(rgb + " rg " + x + " " + bottom + " " + w + " " + h + " re f");
  const text = (x: number, baseline: number, value: string, size = 9, color = "0.15 0.25 0.25", font = "F1") =>
    ops.push(color + " rg BT /" + font + " " + size + " Tf 1 0 0 1 " + x + " " + baseline + " Tm (" + esc(value) + ") Tj ET");
  const newPage = () => {
    if (ops.length) pages.push(ops);
    ops = []; onPage = 0;
    rectangle(0, 0, 842, 595, "1 1 1");
    rectangle(0, 510, 842, 85, "0.05 0.16 0.16");
    rectangle(0, 503, 842, 7, "0.16 0.69 0.48");
    text(38, 566, "PILILLA FLOOD WATCH", 20, "1 1 1", "F2");
    text(39, 540, "SENSOR MONITORING  /  HISTORICAL REPORT", 10, "0.57 0.88 0.76", "F2");
    text(38, 474, "RECENT SENSOR READINGS", 13, "0.06 0.22 0.20", "F2");
    text(38, 455, "Generated " + new Date().toLocaleString("en-PH") + "     |     " + rows.length + " records     |     Wind speed: km/h", 9);
    rectangle(38, 416, 766, 28, "0.09 0.26 0.24");
    text(48, 426, "RECORDED AT", 9, "1 1 1", "F2");
    text(225, 426, "STATION ID", 9, "1 1 1", "F2");
    text(489, 426, "WATER (m)", 9, "1 1 1", "F2");
    text(638, 426, "WIND (km/h)", 9, "1 1 1", "F2");
    rectangle(38, 28, 766, 1, "0.77 0.83 0.80");
    text(38, 14, "PILILLA FLOOD WATCH   /   HISTORICAL SENSOR RECORDS", 7, "0.42 0.50 0.48");
    y = 411;
  };
  newPage();
  for (const row of rows) {
    const image = row[4] || "";
    // Each snapshot link stays as a separate line beneath its sensor reading.
    const links = image ? (image.match(/.{1,125}/g) ?? []) : [];
    const height = 30 + links.length * 11;
    if (y - height < 43) newPage();
    if (onPage % 2 === 0) rectangle(38, y - height + 3, 766, height, "0.94 0.97 0.96");
    text(48, y - 15, row[0].replace("T", " ").replace("Z", " UTC").slice(0, 26), 9);
    text(225, y - 15, row[1].slice(0, 37), 8);
    text(489, y - 15, row[2] || "-", 10, "0.05 0.33 0.27", "F2");
    text(638, y - 15, row[3] || "-", 10, "0.05 0.33 0.27", "F2");
    links.forEach((part, idx) => text(48, y - 30 - idx * 11,
      (idx === 0 ? "Snapshot: " : "") + part, 7, "0.30 0.41 0.39"));
    y -= height;
    onPage++;
  }
  pages.push(ops);
  const objects = ["", "<< /Type /Catalog /Pages 2 0 R >>", "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
  const ids: string[] = [];
  for (const [index, commands] of pages.entries()) {
    const page = objects.length, stream = page + 1;
    ids.push(page + " 0 R");
    // Add page number just above the footer.
    commands.push("0.32 0.42 0.40 rg BT /F1 8 Tf 1 0 0 1 729 14 Tm (Page " + (index + 1) + " / " + pages.length + ") Tj ET");
    const content = commands.join("\n");
    objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + stream + " 0 R >>");
    objects.push("<< /Length " + enc.encode(content).length + " >>\nstream\n" + content + "\nendstream");
  }
  objects[2] = "<< /Type /Pages /Kids [" + ids.join(" ") + "] /Count " + ids.length + " >>";
  let document = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets.push(enc.encode(document).length);
    document += i + " 0 obj\n" + objects[i] + "\nendobj\n";
  }
  const at = enc.encode(document).length;
  document += "xref\n0 " + objects.length + "\n0000000000 65535 f \n";
  for (let i = 1; i < objects.length; i++)
    document += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  document += "trailer\n<< /Size " + objects.length + " /Root 1 0 R >>\nstartxref\n" + at + "\n%%EOF";
  return enc.encode(document);
}
export function exportSensorHistory(readings: FloodReading[], format: ExportFormat) {
  if (!readings.length) return;
  const rows = rowsOf(readings);
  const name = "pililla-sensor-history-" + new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    const csv = [heads, ...rows].map(r => r.map(v => '"' + v.replace(/"/g, '""') + '"').join(",")).join("\r\n");
    download("\uFEFF" + csv, name + ".csv", "text/csv;charset=utf-8");
  } else if (format === "excel") {
    download(xlsx(rows), name + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  } else {
    download(pdf(rows), name + ".pdf", "application/pdf");
  }
}
