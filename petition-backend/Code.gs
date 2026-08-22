/**
 * Petition backend — Google Apps Script
 *
 * 1. sheets.new → name it "Holy Rosary Petition"
 * 2. Extensions → Apps Script, paste this file
 * 3. Deploy → New deployment → Web app
 *    Execute as: Me
 *    Who has access: Anyone
 * 4. Copy the web app URL into app.js as PETITION_ENDPOINT
 *
 * GET  → { signatures: [ {name, role, note, at} ] }   (no emails)
 * POST → JSON body { name, role, note, at }
 */
function sheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName("Signatures");
  if (!sh) {
    sh = ss.insertSheet("Signatures");
    sh.appendRow(["at", "name", "role", "note"]);
  }
  return sh;
}

function doGet() {
  const sh = sheet_();
  const values = sh.getDataRange().getValues();
  const signatures = [];
  for (let i = 1; i < values.length; i++) {
    const [at, name, role, note] = values[i];
    if (name) signatures.push({ at, name, role, note });
  }
  return ContentService.createTextOutput(
    JSON.stringify({ signatures, count: signatures.length })
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const sh = sheet_();
  let row = {};
  try {
    row = JSON.parse(e.postData.contents);
  } catch (err) {
    row = e.parameter || {};
  }
  const name = String(row.name || "").trim();
  if (!name) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  sh.appendRow([row.at || new Date().toISOString(), name, row.role || "", row.note || ""]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
