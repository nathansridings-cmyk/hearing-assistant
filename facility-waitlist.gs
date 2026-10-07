/**
 * Hearing Assistant — Facility waitlist Apps Script
 *
 * Setup:
 * 1. Create a blank Google Sheet.
 * 2. Extensions → Apps Script → paste this file.
 * 3. Run setupSheet() once (Authorize when prompted).
 * 4. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the web app URL into WAITLIST_ENDPOINT in index.html and admin.html.
 * 6. Change ADMIN_KEY below before sharing admin.html.
 */

var ADMIN_KEY = 'CHANGE_ME';
var SHEET_NAME = 'Facilities';
var HEADER = ['Timestamp', 'Facility Name', 'Email'];

function doPost(e) {
  try {
    var fields = readFields_(e);
    if (!fields.facilityName) {
      return json_({ ok: false, error: 'Facility name is required.' }, 400);
    }
    if (!fields.email) {
      return json_({ ok: false, error: 'Contact email is required.' }, 400);
    }
    var sheet = getOrCreateSheet_();
    sheet.appendRow([new Date(), fields.facilityName, fields.email]);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) }, 500);
  }
}

function doGet(e) {
  e = e || {};
  var params = e.parameter || {};
  var action = (params.action || '').toLowerCase();
  if (action !== 'list') {
    return json_({
      ok: true,
      service: 'Hearing Assistant facility waitlist',
      hint: 'POST facility + email, or GET ?action=list&key=...'
    });
  }
  if ((params.key || '') !== ADMIN_KEY) {
    return json_({ ok: false, error: 'Unauthorized' }, 401);
  }
  var sheet = getOrCreateSheet_();
  var values = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var ts = values[i][0];
    var name = values[i][1];
    var email = values[i][2];
    if (!name && !ts && !email) continue;
    rows.push({
      timestamp: ts instanceof Date ? ts.toISOString() : String(ts),
      facilityName: String(name || ''),
      email: String(email || '')
    });
  }
  rows.reverse(); // newest first
  return json_({ ok: true, rows: rows });
}

/** Run once from the Apps Script editor to create the Facilities sheet + header. */
function setupSheet() {
  var sheet = getOrCreateSheet_();
  return 'Ready: sheet "' + sheet.getName() + '" with header ' + HEADER.join(' | ');
}

function readFields_(e) {
  e = e || {};
  var params = e.parameter || {};
  var name = params.facility || params.facilityName || '';
  var email = params.email || params.contactEmail || '';
  if ((!name || !email) && e.postData && e.postData.contents) {
    var type = (e.postData.type || '').toLowerCase();
    var raw = e.postData.contents;
    if (type.indexOf('application/json') !== -1) {
      try {
        var obj = JSON.parse(raw);
        if (!name) name = obj.facility || obj.facilityName || '';
        if (!email) email = obj.email || obj.contactEmail || '';
      } catch (ignore) {}
    } else {
      try {
        var parts = raw.split('&');
        for (var i = 0; i < parts.length; i++) {
          var kv = parts[i].split('=');
          var k = decodeURIComponent((kv[0] || '').replace(/\+/g, ' '));
          var v = decodeURIComponent((kv.slice(1).join('=') || '').replace(/\+/g, ' '));
          if (k === 'facility' || k === 'facilityName') name = v;
          if (k === 'email' || k === 'contactEmail') email = v;
        }
      } catch (ignore2) {}
    }
  }
  return {
    facilityName: String(name || '').trim(),
    email: String(email || '').trim()
  };
}

function getOrCreateSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Open this script from a Google Sheet (Extensions → Apps Script).');
  }
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADER);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 360);
    sheet.setColumnWidth(3, 280);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER);
    sheet.setFrozenRows(1);
  } else {
    // Migrate older 2-column sheets to include Email.
    var headerRow = sheet.getRange(1, 1, 1, Math.max(3, sheet.getLastColumn())).getValues()[0];
    if (String(headerRow[2] || '').toLowerCase() !== 'email') {
      sheet.getRange(1, 3).setValue('Email').setFontWeight('bold');
      sheet.setColumnWidth(3, 280);
    }
  }
  return sheet;
}

function json_(obj, status) {
  var out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  // Apps Script web apps do not expose custom HTTP status reliably for all clients;
  // include ok/error in the body and return JSON.
  return out;
}
