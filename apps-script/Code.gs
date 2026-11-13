/**
 * Squirrel – Schnittstelle zwischen App und Google Sheet.
 *
 * Einrichtung (einmalig):
 *  1. Im Google Sheet: Erweiterungen → Apps Script, diesen Code einfügen, speichern.
 *  2. Oben die Funktion „setup“ auswählen und „Ausführen“ klicken, Zugriff erlauben.
 *     Danach steht der Zugangsschlüssel im Sheet-Tab „Squirrel“ (Zelle B2).
 *  3. Bereitstellen → Neue Bereitstellung → Typ „Web-App“
 *     Ausführen als: „Ich“, Zugriff: „Jeder“ → Bereitstellen, Web-App-URL kopieren.
 *  4. In der App unter Einstellungen → Google Sheet: URL und Zugangsschlüssel eintragen.
 *
 * Der Zugriff „Jeder“ ist nötig, damit die App ohne Google-Login zugreifen kann.
 * Geschützt ist die Schnittstelle durch den Zugangsschlüssel.
 */

var SHEETS = {
  tx:   { name: 'Ausgaben',      cols: ['id', 'datum', 'betrag', 'kategorie', 'titel', 'tags', 'notiz', 'regel', 'erstellt'] },
  cat:  { name: 'Kategorien',    cols: ['id', 'name', 'symbol', 'farbe', 'budget', 'reihenfolge'] },
  rec:  { name: 'Wiederkehrend', cols: ['id', 'titel', 'betrag', 'kategorie', 'tags', 'rhythmus', 'tag', 'monat', 'start', 'aktiv', 'ausgelassen'] },
  tags: { name: 'Tags',          cols: ['name'] }
};
var TEXT_COLS = { tx: ['id', 'datum', 'kategorie', 'regel'], cat: ['id', 'farbe'], rec: ['id', 'kategorie', 'start'] };

function setup() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(SHEETS).forEach(function (k) {
    var def = SHEETS[k];
    var sh = ss.getSheetByName(def.name) || ss.insertSheet(def.name);
    sh.getRange(1, 1, 1, def.cols.length).setValues([def.cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    (TEXT_COLS[k] || []).forEach(function (c) {
      sh.getRange(2, def.cols.indexOf(c) + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    });
  });
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TOKEN');
  if (!token) { token = Utilities.getUuid().replace(/-/g, ''); props.setProperty('TOKEN', token); }
  var info = ss.getSheetByName('Squirrel') || ss.insertSheet('Squirrel');
  info.getRange('A1:B3').setValues([
    ['Squirrel-Schnittstelle', ''],
    ['Zugangsschlüssel', token],
    ['Hinweis', 'Diesen Schlüssel in der App unter Einstellungen → Google Sheet eintragen. Nicht weitergeben.']
  ]);
  info.getRange('A1').setFontWeight('bold');
  Logger.log('Zugangsschlüssel: ' + token);
}

/** Neuen Schlüssel erzeugen, z. B. wenn der alte bekannt geworden ist. */
function neuerSchluessel() {
  PropertiesService.getScriptProperties().deleteProperty('TOKEN');
  setup();
}

function doGet() {
  return ContentService.createTextOutput('Squirrel-Schnittstelle läuft.');
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: 'bad_request' }); }
  var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || req.token !== token) return json({ ok: false, error: 'unauthorized' });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    applyOps(req.ops || []);
    return json({ ok: true, data: snapshot(), serverTime: new Date().toISOString() });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Schreiben ---------- */
function applyOps(ops) {
  if (!ops.length) return;
  var byKind = {};
  ops.forEach(function (o) { (byKind[o.k] = byKind[o.k] || []).push(o); });
  if (byKind.tags) {
    var last = byKind.tags[byKind.tags.length - 1];
    writeRows('tags', (last.d || []).map(function (t) { return [t]; }));
  }
  ['tx', 'cat', 'rec'].forEach(function (k) {
    if (!byKind[k]) return;
    var rows = readRows(k);
    var index = {};
    rows.forEach(function (r, i) { index[r[0]] = i; });
    var removed = {};
    byKind[k].forEach(function (o) {
      if (o.op === 'del') { if (index[o.id] !== undefined) removed[index[o.id]] = true; return; }
      var row = toRow(k, o.d);
      if (index[o.id] !== undefined) { rows[index[o.id]] = row; delete removed[index[o.id]]; }
      else { index[o.id] = rows.length; rows.push(row); }
    });
    rows = rows.filter(function (r, i) { return !removed[i]; });
    if (k === 'tx') rows.sort(function (a, b) { return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0; });
    writeRows(k, rows);
  });
}

function sheet(k) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEETS[k].name);
  if (!sh) { setup(); sh = SpreadsheetApp.getActive().getSheetByName(SHEETS[k].name); }
  return sh;
}
function readRows(k) {
  var sh = sheet(k), n = sh.getLastRow() - 1, w = SHEETS[k].cols.length;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, w).getValues().filter(function (r) { return String(r[0]) !== ''; });
}
function writeRows(k, rows) {
  var sh = sheet(k), w = SHEETS[k].cols.length, old = Math.max(sh.getLastRow() - 1, 0);
  if (old) sh.getRange(2, 1, old, w).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, w).setValues(rows);
}

function toRow(k, d) {
  switch (k) {
    case 'tx':  return [d.id, d.date, Number(d.amount), d.cat, d.title || '', (d.tags || []).join(', '), d.note || '', d.rec || '', d.c ? new Date(d.c) : new Date()];
    case 'cat': return [d.id, d.name, d.icon, d.color, Number(d.budget) || 0, Number(d.order) || 0];
    case 'rec': return [d.id, d.title, Number(d.amount), d.cat, (d.tags || []).join(', '), d.freq, Number(d.day), Number(d.month) || 0, d.start, !!d.active, (d.skip || []).join(', ')];
  }
}

/* ---------- Lesen ---------- */
function snapshot() {
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  var day = function (v) { return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v || '').slice(0, 10); };
  var list = function (v) { return String(v || '').split(',').map(function (s) { return s.trim(); }).filter(String); };
  var num = function (v) { return typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.')) || 0; };
  return {
    tx: readRows('tx').map(function (r) {
      return { id: String(r[0]), date: day(r[1]), amount: num(r[2]), cat: String(r[3]), title: String(r[4] || ''), tags: list(r[5]),
               note: String(r[6] || ''), rec: r[7] ? String(r[7]) : null, c: r[8] instanceof Date ? r[8].getTime() : 0 };
    }),
    cats: readRows('cat').map(function (r) {
      return { id: String(r[0]), name: String(r[1]), icon: String(r[2] || '•'), color: String(r[3] || '#7D8791'), budget: num(r[4]), order: num(r[5]) };
    }),
    rec: readRows('rec').map(function (r) {
      return { id: String(r[0]), title: String(r[1]), amount: num(r[2]), cat: String(r[3]), tags: list(r[4]), freq: String(r[5] || 'monthly'),
               day: num(r[6]) || 1, month: num(r[7]), start: day(r[8]), active: r[9] === true || String(r[9]).toUpperCase() === 'TRUE', skip: list(r[10]) };
    }),
    tags: readRows('tags').map(function (r) { return String(r[0]); })
  };
}
