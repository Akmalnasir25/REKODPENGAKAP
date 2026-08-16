/**
 * ImportForm.gs — import soalan ke tab Soalan.
 *  - Google Form (native, paling tepat untuk soalan sedia ada)
 *  - CSV (gunakan import Google Sheets biasa; lihat README)
 *  - Word .docx (pilihan; best-effort)
 * Menu "Kuiz" ditambah pada Sheet semasa dibuka.
 */

/**
 * Dapatkan ID Form daripada URL edit atau ID telanjang.
 * Menolak pautan "Hantar/viewform" dengan mesej jelas.
 */
function resolveFormId(ref) {
  ref = String(ref || '').trim();
  if (!ref) throw new Error('URL/ID Form kosong.');
  if (ref.indexOf('/d/e/') >= 0 || ref.toLowerCase().indexOf('viewform') >= 0) {
    throw new Error('Itu pautan "Hantar/viewform". Guna URL EDIT (.../forms/d/<ID>/edit) atau <ID> sahaja.');
  }
  var m = ref.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{15,}$/.test(ref)) return ref; // ID telanjang
  throw new Error('Tidak dapat kenal pasti ID Form. Guna URL edit atau ID.');
}

/**
 * Import soalan dari Google Form ke tab Soalan — guna FormApp sahaja
 * (tiada API tambahan diperlukan). Membaca soalan aneka pilihan + kunci
 * jawapan. GAMBAR: hanya blok imej BERASINGAN (FormApp.ItemType.IMAGE)
 * boleh dibaca → disimpan ke Drive & dikaitkan dengan soalan SELEPASNYA.
 * Gambar "inline" (lekat pada soalan) tidak boleh dibaca FormApp → tampal
 * URL manual pada medan "URL Gambar" / lajur `gambar`.
 * Pulang { imported, withImage }.
 */
function importFormToSheet(formRef, quizId) {
  quizId = String(quizId || '').trim();
  if (!quizId) throw new Error('quizId diperlukan.');
  var formId = resolveFormId(formRef);

  var form;
  try {
    form = FormApp.openById(formId);
  } catch (e) {
    throw new Error('Gagal buka Form (guna akaun sama & URL EDIT): ' + e.message);
  }

  var items = form.getItems();
  var rows = [];
  var pendingImg = '';     // gambar blok berasingan untuk soalan seterusnya
  var withImage = 0;

  items.forEach(function (it) {
    var type = it.getType();

    if (type === FormApp.ItemType.IMAGE) {
      try { pendingImg = _saveImageBlob(it.asImageItem().getImage(), quizId); }
      catch (e) { pendingImg = ''; }
      return;
    }

    if (type === FormApp.ItemType.MULTIPLE_CHOICE) {
      var mc = it.asMultipleChoiceItem();
      var choices = mc.getChoices();
      var correct = '';
      choices.forEach(function (c, i) {
        try { if (c.isCorrectAnswer() && i < LETTERS.length) correct = LETTERS[i]; } catch (e) {}
      });
      // quizId|soalan|A|B|C|D|E|jawapan|markah|aktif|gambar
      var row = [quizId, it.getTitle(), '', '', '', '', '', correct, 1, true, pendingImg];
      for (var i = 0; i < choices.length && i < 5; i++) row[2 + i] = _stripChoiceLabel(choices[i].getValue(), i);
      if (pendingImg) withImage++;
      rows.push(row);
      pendingImg = ''; // guna sekali sahaja
    }
  });

  if (rows.length === 0) throw new Error('Tiada soalan aneka pilihan dijumpai dalam Form.');

  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var sh = _sheet(SHEET_SOALAN);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    return { imported: rows.length, withImage: withImage };
  } finally { lock.releaseLock(); }
}

/**
 * Buang awalan label pilihan ("A.", "B)", "C -", "d:") jika ia sepadan dengan
 * huruf pilihan pada kedudukan itu — supaya teks tak bertindan dengan label
 * yang kuiz tambah sendiri. Kalau awalan bukan huruf yang dijangka, biar sahaja.
 */
function _stripChoiceLabel(val, idx) {
  val = String(val == null ? '' : val).trim();
  var expected = (LETTERS[idx] || '').toUpperCase();
  var m = val.match(/^([A-Ea-e])\s*[.)\-:]\s*(.+)$/);
  if (m && m[1].toUpperCase() === expected) return m[2].trim();
  return val;
}

/** Simpan blob imej ke folder Drive (anyone-with-link), pulang URL imej terus */
function _saveImageBlob(blob, quizId) {
  var file = _quizImageFolder().createFile(blob);
  file.setName('soalan-' + quizId + '-' + new Date().getTime());
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000';
}

function _quizImageFolder() {
  var name = 'Kuiz Pengakap - Gambar';
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Kuiz')
    .addItem('① Bina / Semak Tab', 'setupSheets')
    .addItem('② Set Script Properties (Supabase)…', 'promptSetupProperties')
    .addSeparator()
    .addItem('Import dari Google Form…', 'importFromGoogleForm')
    .addItem('Import dari Word (.docx di Drive)…', 'importFromWordDoc')
    .addItem('Bersih label A/B/C/D bertindan', 'cleanChoiceLabels')
    .addSeparator()
    .addItem('(Pilihan) Isi Kuiz Contoh', 'seedDemoQuiz')
    .addToUi();
}

/** Import dari Google Form melalui menu Sheet (guna Forms API + gambar) */
function importFromGoogleForm() {
  const ui = SpreadsheetApp.getUi();
  const formResp = ui.prompt('Import dari Google Form', 'Tampal URL EDIT atau ID Google Form:', ui.ButtonSet.OK_CANCEL);
  if (formResp.getSelectedButton() !== ui.Button.OK) return;
  const quizResp = ui.prompt('Import dari Google Form', 'quizId untuk soalan ini (cth: keris-emas-2026):', ui.ButtonSet.OK_CANCEL);
  if (quizResp.getSelectedButton() !== ui.Button.OK) return;

  try {
    const r = importFormToSheet(formResp.getResponseText(), quizResp.getResponseText());
    ui.alert(r.imported + ' soalan diimport (' + (r.withImage || 0) + ' dengan gambar blok berasingan).\n\n' +
      '• Gambar INLINE (lekat pada soalan) tak boleh dibaca — tampal URL pada lajur "gambar".\n' +
      '• Jika lajur Jawapan kosong, Form bukan kuiz berkunci — isi A–E manual.');
  } catch (e) {
    ui.alert('Gagal import: ' + e.message);
  }
}

/**
 * Bersihkan awalan label (A./B)/C-) yang bertindan pada lajur A–E tab Soalan.
 * Selamat dijalankan berulang — hanya potong jika awalan sepadan huruf pilihan.
 */
function cleanChoiceLabels() {
  var ui = SpreadsheetApp.getUi();
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var sh = _sheet(SHEET_SOALAN);
    var last = sh.getLastRow();
    if (last < 2) { ui.alert('Tiada soalan.'); return; }
    // Lajur A=3 … E=7
    var rng = sh.getRange(2, 3, last - 1, 5);
    var vals = rng.getValues();
    var changed = 0;
    for (var r = 0; r < vals.length; r++) {
      for (var c = 0; c < 5; c++) {
        var clean = _stripChoiceLabel(vals[r][c], c);
        if (clean !== String(vals[r][c] == null ? '' : vals[r][c]).trim()) { vals[r][c] = clean; changed++; }
        else vals[r][c] = clean;
      }
    }
    rng.setValues(vals);
    ui.alert(changed + ' pilihan dibersihkan daripada label bertindan.');
  } finally { lock.releaseLock(); }
}

/**
 * Import dari Word .docx yang dimuat naik ke Drive (best-effort).
 * Format dijangka, setiap soalan:
 *   1. Teks soalan
 *   A. pilihan a
 *   B. pilihan b
 *   *C. pilihan c    (tanda * = jawapan betul)   ATAU baris "Jawapan: C"
 */
function importFromWordDoc() {
  const ui = SpreadsheetApp.getUi();
  const idResp = ui.prompt('Import Word', 'Tampal ID fail .docx di Google Drive:', ui.ButtonSet.OK_CANCEL);
  if (idResp.getSelectedButton() !== ui.Button.OK) return;
  const quizResp = ui.prompt('Import Word', 'quizId untuk soalan ini:', ui.ButtonSet.OK_CANCEL);
  if (quizResp.getSelectedButton() !== ui.Button.OK) return;
  const quizId = quizResp.getResponseText().trim();
  if (!quizId) { ui.alert('quizId diperlukan.'); return; }

  // Tukar .docx → Google Doc supaya boleh dibaca DocumentApp
  let text;
  try {
    const blob = DriveApp.getFileById(idResp.getResponseText().trim()).getBlob();
    const resource = { title: 'tmp-quiz-import', mimeType: 'application/vnd.google-apps.document' };
    const file = Drive.Files.insert(resource, blob, { convert: true }); // perlu Advanced Drive Service
    text = DocumentApp.openById(file.id).getBody().getText();
    DriveApp.getFileById(file.id).setTrashed(true);
  } catch (e) {
    ui.alert('Gagal baca/tukar Word. Pastikan Advanced Drive Service diaktifkan.\n' + e.message);
    return;
  }

  const rows = parseWordText(text, quizId);
  if (rows.length === 0) { ui.alert('Tiada soalan dapat dihurai. Semak format dokumen.'); return; }
  const sh = _sheet(SHEET_SOALAN);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  ui.alert(rows.length + ' soalan diimport. SILA SEMAK ketepatan (import Word adalah best-effort).');
}

/** Hurai teks → baris Soalan. Pulang array [quizId,soalan,A..E,jawapan,markah,aktif] */
function parseWordText(text, quizId) {
  const lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(String);
  const rows = [];
  let cur = null;
  const flush = function () { if (cur && cur.options.length >= 2) rows.push(toRow(cur, quizId)); cur = null; };

  lines.forEach(function (line) {
    const qMatch = line.match(/^(\d+)[.)]\s*(.+)$/);            // "1. soalan"
    const oMatch = line.match(/^(\*?)\s*([A-Ea-e])[.)]\s*(.+)$/); // "A. pilihan" / "*C. ..."
    const ansMatch = line.match(/^jawapan\s*[:\-]?\s*([A-Ea-e])/i);

    if (qMatch) {
      flush();
      cur = { soalan: qMatch[2].trim(), options: {}, jawapan: '' };
    } else if (oMatch && cur) {
      const L = oMatch[2].toUpperCase();
      cur.options[L] = oMatch[3].trim();
      if (oMatch[1] === '*') cur.jawapan = L;
    } else if (ansMatch && cur) {
      cur.jawapan = ansMatch[1].toUpperCase();
    } else if (cur && Object.keys(cur.options).length === 0) {
      cur.soalan += ' ' + line; // sambungan teks soalan
    }
  });
  flush();
  return rows;

  function toRow(c, qid) {
    const keys = Object.keys(c.options);
    const opts = LETTERS.map(function (L) { return c.options[L] || ''; });
    return [qid, c.soalan, opts[0], opts[1], opts[2], opts[3], opts[4], c.jawapan, 1, true];
    void keys;
  }
}

function promptSetupProperties() {
  const ui = SpreadsheetApp.getUi();
  const p = _props();
  const ask = function (k, label) {
    const r = ui.prompt('Script Properties', label, ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() === ui.Button.OK && r.getResponseText().trim()) {
      p.setProperty(k, r.getResponseText().trim());
    }
  };
  ask('SUPABASE_FN_URL', 'SUPABASE_FN_URL (…/quiz-eligibility):');
  ask('SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY:');
  ask('QUIZ_API_KEY', 'QUIZ_API_KEY (rahsia kongsi dengan Supabase):');
  ui.alert('Script Properties dikemas kini.');
}
