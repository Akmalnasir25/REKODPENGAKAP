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
 * Import soalan dari Google Form ke tab Soalan — TERUS TULIS, tanpa pratonton.
 *
 * Ini jalan menu Sheet. Panel admin menggunakan pratonton dua langkah
 * (adminPreviewFormImport → adminCommitImport di AdminServer.gs); dialog
 * `ui.prompt` tidak boleh memapar kad soalan, jadi menu kekal terus-tulis.
 *
 * Tandatangan dan nilai pulangan dikekalkan: { imported, withImage, dipotong }.
 */
function importFormToSheet(formRef, quizId) {
  quizId = String(quizId || '').trim();
  var p = _parseFormQuestions(formRef, quizId);
  if (p.items.length === 0) {
    throw new Error('Tiada soalan berpilihan dijumpai dalam Form ' +
                    '(aneka pilihan, kotak semak, atau menu jatuh).');
  }
  var rows = p.items.map(function (it) { return _itemKeRow(it, quizId); });
  _writeQuestionRows(rows);
  return { imported: rows.length, withImage: p.withImage, dipotong: p.dipotong };
}

/**
 * Baca Google Form → senarai soalan bersama amarannya. TIDAK menulis apa-apa
 * ke tab Soalan.
 *
 * JENIS SOALAN yang dibaca:
 *   MULTIPLE_CHOICE (bulatan)  -> satu jawapan     'C'
 *   CHECKBOX (kotak semak)     -> jawapan berbilang 'A,C'
 *   LIST (menu jatuh)          -> satu jawapan     'C'
 *
 * GAMBAR, dua sumber:
 *   1. Blok imej BERASINGAN (FormApp.ItemType.IMAGE) — dikaitkan dengan
 *      soalan SELEPASNYA.
 *   2. Gambar INLINE (lekat terus pada soalan) — FormApp tidak mendedahkannya
 *      langsung, jadi ia diambil melalui Forms REST API bila tersedia
 *      (lihat _inlineImagesFromApi). Gambar inline mengatasi blok yang menunggu.
 *
 * Gambar disimpan ke Drive DI SINI, bukan semasa simpan. Ia bukan pilihan:
 * blob FormApp dan contentUri Forms API kedua-duanya memerlukan token OAuth
 * server, jadi klien tidak boleh mengambilnya sendiri kemudian. Setiap item
 * membawa `gambarFileId` supaya pemanggil boleh membuang fail yang ditolak
 * (lihat _buangFailDrive).
 *
 * opts.papar = true menambah `gambarPapar` (data URI) untuk skrin pratonton.
 *
 * Pulang { items:[…], withImage, dipotong }.
 */
function _parseFormQuestions(formRef, quizId, opts) {
  opts = opts || {};
  quizId = String(quizId || '').trim();
  if (!quizId) throw new Error('quizId diperlukan.');
  var formId = resolveFormId(formRef);

  var form;
  try {
    form = FormApp.openById(formId);
  } catch (e) {
    throw new Error('Gagal buka Form (guna akaun sama & URL EDIT): ' + e.message);
  }

  var inlineImg = _inlineImagesFromApi(formId, quizId);
  var sediaAda = _petaSoalanSediaAda(quizId);   // teks dinormal -> baris Sheet
  var dalamBatch = {};                          // teks dinormal -> nombor kad

  var formItems = form.getItems();
  var items = [];
  var pendingImg = null;      // gambar blok berasingan untuk soalan seterusnya
  var pendingGagal = false;   // blok imej wujud tetapi gagal disimpan
  var withImage = 0;
  var dipotong = 0;
  var belanjaPapar = 0;       // jumlah bait data URI yang sudah dikeluarkan

  formItems.forEach(function (it, idx) {
    var type = it.getType();

    if (type === FormApp.ItemType.IMAGE) {
      try {
        pendingImg = _saveImageBlob(it.asImageItem().getImage(), quizId);
        pendingGagal = false;
      } catch (e) {
        pendingImg = null;
        pendingGagal = true;
      }
      return;
    }

    var soalan = null;
    if (type === FormApp.ItemType.MULTIPLE_CHOICE) {
      soalan = _soalanDariPilihan(it.asMultipleChoiceItem(), false);
    } else if (type === FormApp.ItemType.CHECKBOX) {
      soalan = _soalanDariPilihan(it.asCheckboxItem(), true);
    } else if (type === FormApp.ItemType.LIST) {
      soalan = _soalanDariPilihan(it.asListItem(), false);
    }

    // Bukan soalan berpilihan (tajuk bahagian, pemisah halaman, jawapan
    // pendek…). pendingImg SENGAJA dikekalkan supaya gambar tetap sampai
    // kepada soalan berikutnya walaupun ada tajuk bahagian di antaranya.
    if (!soalan) return;

    var tajuk = String(it.getTitle() || '').trim();
    // Gambar inline soalan ini mengatasi blok imej yang sedang menunggu.
    var img = inlineImg[String(idx)] || inlineImg['T:' + tajuk] || pendingImg || null;
    var imgGagal = pendingGagal;
    if (img && img.gagal) { imgGagal = true; img = null; }

    var options = [];
    soalan.pilihan.forEach(function (t, i) {
      var text = String(t == null ? '' : t).trim();
      if (text !== '') options.push({ key: LETTERS[i], text: text });
    });
    var kunci = _normKunci(soalan.jawapan);

    var amaran = [];
    if (soalan.dipotong) amaran.push('dipotong');
    if (kunci.length === 0 && soalan.betulDipotong > 0) amaran.push('kunci-dipotong');
    else if (kunci.length === 0) amaran.push('tiada-kunci');
    // Sebahagian jawapan betul muat dalam A–E, sebahagian lagi tidak. Soalan ini
    // BOLEH dijawab tetapi kuncinya salah — murid yang menanda betul-betul ikut
    // Form asal akan ditanda salah. Lebih bahaya daripada soalan yang dibuang.
    if (kunci.length > 0 && soalan.betulDipotong > 0) amaran.push('kunci-separa');

    var bd = _soalanBolehDijawab(options, kunci);
    if (!bd.boleh && bd.sebab !== 'tiada-kunci') amaran.push(bd.sebab);
    if (imgGagal) amaran.push('tiada-gambar');

    // Duplikat: teks yang sama dalam quizId yang SAMA sahaja. Dua kuiz memang
    // boleh berkongsi soalan, jadi kuiz lain tidak dikira.
    var kunciTeks = _normTeksSoalan(tajuk);
    var duplikatRow = 0;
    if (kunciTeks && dalamBatch[kunciTeks]) duplikatRow = -dalamBatch[kunciTeks]; // negatif = dalam import ini
    else if (kunciTeks && sediaAda[kunciTeks]) duplikatRow = sediaAda[kunciTeks];
    if (duplikatRow) amaran.push('duplikat');
    if (kunciTeks && !dalamBatch[kunciTeks]) dalamBatch[kunciTeks] = items.length + 1;

    var item = {
      idx: idx,
      soalan: tajuk,
      options: options,
      jawapan: kunci,
      multi: kunci.length > 1,
      gambar: img ? img.url : '',
      gambarFileId: img ? img.fileId : '',
      jumlahPilihanAsal: soalan.jumlahPilihanAsal,
      duplikatRow: duplikatRow,
      amaran: amaran,
      boleh: bd.boleh,
      ambil: !_adaAmaranMaut(amaran),
    };

    if (opts.papar && item.gambar) {
      // Data URI mengelak isu perkongsian/CDN Drive (lihat _imageForClient),
      // tetapi 45 soalan bergambar boleh menjadi payload berpuluh MB. Selepas
      // bajet habis, kad selebihnya jatuh kepada URL thumbnail biasa — fail
      // sudah anyone-with-link, jadi ia biasanya tetap terpapar.
      if (belanjaPapar < PAPAR_BUDGET_BAIT) {
        var uri = _imageForClient(item.gambar);
        belanjaPapar += uri.length;
        item.gambarPapar = uri;
      } else {
        item.gambarPapar = item.gambar;
        item.paparRingkas = true;
      }
    }

    if (item.gambar) withImage++;
    if (soalan.dipotong) dipotong++;
    items.push(item);

    // Dikosongkan HANYA selepas satu soalan benar-benar diambil. Sebelum ini
    // pengosongan berlaku dalam cawangan MULTIPLE_CHOICE sahaja, jadi gambar
    // sebelum soalan kotak semak (yang dahulunya dilangkau) melimpah dan
    // melekat pada soalan berikutnya yang salah.
    pendingImg = null;
    pendingGagal = false;
  });

  return { items: items, withImage: withImage, dipotong: dipotong };
}

/** Bajet data URI bagi satu pratonton (~2 MB) sebelum jatuh ke URL Drive */
var PAPAR_BUDGET_BAIT = 2 * 1024 * 1024;

/**
 * Amaran yang bermakna soalan itu TIDAK sepatutnya disimpan tanpa disemak dahulu.
 * Ia menentukan tanda LALAI pada kad pratonton sahaja — admin tetap boleh
 * menandanya sendiri dan menyimpannya (lihat rancangan §4.3).
 */
var AMARAN_MAUT = ['kunci-dipotong', 'tiada-kunci', 'kunci-tanpa-teks',
                   'pilihan-kurang', 'kunci-separa', 'duplikat'];

function _adaAmaranMaut(amaran) {
  return (amaran || []).some(function (a) { return AMARAN_MAUT.indexOf(a) >= 0; });
}

/** Satu item pratonton → baris tab Soalan (quizId|soalan|A..E|jawapan|markah|aktif|gambar) */
function _itemKeRow(it, quizId) {
  var row = [String(quizId).trim(), String(it.soalan == null ? '' : it.soalan).trim(),
             '', '', '', '', '', _normKunci(it.jawapan).join(','), 1, true,
             String(it.gambar || '').trim()];
  (it.options || []).forEach(function (o) {
    var i = LETTERS.indexOf(o.key);
    if (i >= 0) row[2 + i] = String(o.text == null ? '' : o.text);
  });
  return row;
}

/** Tulis baris soalan ke hujung tab Soalan dalam satu operasi berkunci */
function _writeQuestionRows(rows) {
  if (!rows || rows.length === 0) return 0;
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var sh = _sheet(SHEET_SOALAN);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    return rows.length;
  } finally { lock.releaseLock(); }
}

/**
 * Teks soalan dinormalkan untuk perbandingan duplikat: huruf kecil, ruang
 * dimampatkan, tanda baca hujung dibuang. "Apakah simpulan ini?" dan
 * "apakah  simpulan ini" dikira sama.
 */
function _normTeksSoalan(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[?!.:;,]+$/, '');
}

/** Peta teks-soalan-dinormal → nombor baris, bagi satu quizId sahaja */
function _petaSoalanSediaAda(quizId) {
  var peta = {};
  var target = String(quizId).trim();
  _readObjects(SHEET_SOALAN).forEach(function (r) {
    if (String(r.quizId).trim() !== target) return;
    var k = _normTeksSoalan(r.soalan);
    if (k && !peta[k]) peta[k] = r._row;
  });
  return peta;
}

/**
 * Baca satu item berpilihan → { pilihan:[teks…], jawapan:'A,C',
 * jumlahPilihanAsal, dipotong, betulDipotong }.
 * Pulang null kalau item itu bukan soalan yang boleh digunakan.
 *
 * `multi` menentukan sama ada semua jawapan betul dikumpul (kotak semak) atau
 * hanya yang pertama (bulatan / menu jatuh).
 *
 * `betulDipotong` mengira jawapan betul yang jatuh pada pilihan ke-6 dan
 * seterusnya. Tanpanya, Form 7 pilihan yang jawapannya pilihan ke-7 menghasilkan
 * soalan berkunci KOSONG dan tiada siapa tahu kenapa — kunci itu dibuang senyap
 * oleh had lajur A–E, bukan kerana Form itu bukan kuiz.
 */
function _soalanDariPilihan(item, multi) {
  var choices;
  try { choices = item.getChoices(); } catch (e) { return null; }
  if (!choices || choices.length < 2) return null;

  var pilihan = [];
  var betul = [];
  var betulDipotong = 0;
  choices.forEach(function (c, i) {
    if (i < LETTERS.length) pilihan.push(_stripChoiceLabel(c.getValue(), i));
    var betulKah = false;
    try { betulKah = c.isCorrectAnswer(); }
    catch (e) { return; }   // Form bukan jenis Kuiz — tiada kunci jawapan
    if (!betulKah) return;
    if (i < LETTERS.length) betul.push(LETTERS[i]);
    else betulDipotong++;
  });

  if (!multi && betul.length > 1) betul = [betul[0]];

  return {
    pilihan: pilihan,
    jawapan: _normKunci(betul).join(','),
    jumlahPilihanAsal: choices.length,
    dipotong: choices.length > LETTERS.length,   // tab Soalan hanya ada lajur A–E
    betulDipotong: betulDipotong,
  };
}

/**
 * Ambil gambar INLINE (yang dilekat terus pada soalan) melalui Forms REST API.
 *
 * FormApp tidak mendedahkan gambar inline langsung — itu had perkhidmatan
 * klasik, bukan bug. REST API mendedahkannya pada questionItem.image.
 *
 * PERLU (lihat README-setup.md §C):
 *   - Forms API diaktifkan untuk projek Google Cloud skrip ini
 *   - skop https://www.googleapis.com/auth/forms.body.readonly
 *
 * Kalau mana-mana tiada, fungsi ini pulang peta KOSONG dan import berjalan
 * seperti biasa dengan blok imej berasingan sahaja. Sengaja tidak membaling
 * ralat: gambar inline ialah tambahan, bukan syarat untuk import berfungsi.
 *
 * Pulang peta { '<index item>': nilai, 'T:<tajuk>': nilai } — dipadan ikut
 * kedudukan dahulu, kemudian tajuk sebagai sandaran. `nilai` ialah
 * { url, fileId } bagi gambar yang berjaya disimpan, atau { gagal:true } bagi
 * gambar yang WUJUD dalam Form tetapi gagal diambil — dua keadaan yang berbeza,
 * kerana yang kedua patut memberi amaran kepada admin.
 */
function _inlineImagesFromApi(formId, quizId) {
  var peta = {};
  var data;
  try {
    var resp = UrlFetchApp.fetch(
      'https://forms.googleapis.com/v1/forms/' + encodeURIComponent(formId), {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true,
      });
    if (resp.getResponseCode() !== 200) return peta;   // API/skop tiada — senyap
    data = JSON.parse(resp.getContentText() || '{}');
  } catch (e) {
    return peta;
  }

  var items = (data && data.items) || [];
  items.forEach(function (it, idx) {
    var img = it.questionItem && it.questionItem.image;
    var uri = img && img.contentUri;
    if (!uri) return;
    var simpan = null;
    try { simpan = _saveImageFromUrl(uri, quizId); } catch (e) { simpan = null; }
    var nilai = simpan || { gagal: true };
    peta[String(idx)] = nilai;
    var tajuk = String(it.title || '').trim();
    if (tajuk) peta['T:' + tajuk] = nilai;
  });
  return peta;
}

/** Muat turun imej dari URL (contentUri Forms API) → Drive → { url, fileId } atau null */
function _saveImageFromUrl(url, quizId) {
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) return null;
  return _saveImageBlob(resp.getBlob(), quizId);
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

/**
 * Simpan blob imej ke folder Drive (anyone-with-link) → { url, fileId }.
 * `fileId` dipulangkan supaya pratonton boleh membuang gambar yang akhirnya
 * TIDAK jadi disimpan — tanpanya, setiap import yang dibatalkan meninggalkan
 * fail yatim dalam folder.
 */
function _saveImageBlob(blob, quizId) {
  var file = _quizImageFolder().createFile(blob);
  file.setName('soalan-' + quizId + '-' + new Date().getTime());
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return {
    url: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000',
    fileId: file.getId(),
  };
}

/**
 * Buang fail Drive (masuk sampah, bukan padam kekal) — gambar pratonton yang
 * ditolak. Ralat per fail ditelan: fail yang sudah tiada bukan kegagalan.
 * Pulang bilangan yang berjaya dibuang.
 */
function _buangFailDrive(ids) {
  var n = 0;
  (ids || []).forEach(function (id) {
    if (!id) return;
    try { DriveApp.getFileById(String(id)).setTrashed(true); n++; } catch (e) {}
  });
  return n;
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
    var msg = r.imported + ' soalan diimport (' + (r.withImage || 0) + ' dengan gambar).\n\n' +
      '• Soalan kotak semak disimpan dengan jawapan berbilang, cth "A,C".\n' +
      '• Jika lajur Jawapan kosong, Form bukan kuiz berkunci — isi A–E manual.';
    if (r.dipotong) {
      msg += '\n\n⚠ ' + r.dipotong + ' soalan ada LEBIH 5 pilihan. Tab Soalan hanya ' +
             'ada lajur A–E, jadi pilihan ke-6 dan seterusnya DIBUANG. Semak soalan ' +
             'tersebut sebelum kuiz dibuka.';
    }
    ui.alert(msg);
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
    // Ambil SELURUH baki baris supaya "Jawapan: A, C" boleh dibaca, bukan
    // huruf pertama sahaja. _normKunci yang memilih huruf yang sah.
    const ansMatch = line.match(/^jawapan\s*[:\-]?\s*(.+)$/i);

    if (qMatch) {
      flush();
      cur = { soalan: qMatch[2].trim(), options: {}, jawapan: [] };
    } else if (oMatch && cur) {
      const L = oMatch[2].toUpperCase();
      cur.options[L] = oMatch[3].trim();
      // Kumpul, bukan tulis ganti — dokumen boleh menanda '*' pada beberapa
      // pilihan untuk soalan kotak semak.
      if (oMatch[1] === '*') cur.jawapan.push(L);
    } else if (ansMatch && cur) {
      cur.jawapan = _normKunci(ansMatch[1]);
    } else if (cur && Object.keys(cur.options).length === 0) {
      cur.soalan += ' ' + line; // sambungan teks soalan
    }
  });
  flush();
  return rows;

  function toRow(c, qid) {
    const keys = Object.keys(c.options);
    const opts = LETTERS.map(function (L) { return c.options[L] || ''; });
    return [qid, c.soalan, opts[0], opts[1], opts[2], opts[3], opts[4],
            _normKunci(c.jawapan).join(','), 1, true];
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
