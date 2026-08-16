/**
 * Admin.gs — panel admin web (login guna kredensil admin daerah scoutnadi).
 * Pengesahan dibuat di Supabase (edge function admin_login/admin_verify).
 * Setiap operasi tulis disahkan semula dengan token sebelum menulis ke Sheet.
 */

// ---- Auth ----
function adminLogin(email, password) {
  var res = callEligibility({ action: 'admin_login', email: email, password: password });
  if (!res.ok) throw new Error(res.error || 'Log masuk gagal.');
  return { token: res.token, name: res.name, role: res.role,
           negeriCode: res.negeriCode, daerahCode: res.daerahCode };
}

function _requireAdmin(token) {
  if (!token) throw new Error('Sesi tamat. Sila log masuk semula.');
  var res = callEligibility({ action: 'admin_verify', token: token });
  if (!res.ok) throw new Error('Sesi tidak sah / tamat tempoh. Sila log masuk semula.');
  return res;
}

// ---- Tetapan (kuiz/program) ----
var TETAPAN_COLS = ['quizId','namaProgram','badgeName','tahun','ambangLulus','bilSoalan','verifyMethod','slidesTemplateId','aktif'];

function adminListQuizzes(token) {
  _requireAdmin(token);
  return _readObjects(SHEET_TETAPAN).map(function (r) {
    return {
      quizId: String(r.quizId).trim(), namaProgram: r.namaProgram, badgeName: r.badgeName,
      tahun: r.tahun, ambangLulus: r.ambangLulus, bilSoalan: r.bilSoalan,
      verifyMethod: r.verifyMethod, slidesTemplateId: r.slidesTemplateId, aktif: _truthy(r.aktif),
      _row: r._row,
    };
  });
}

function adminSaveQuiz(token, q) {
  _requireAdmin(token);
  if (!q || !String(q.quizId).trim()) throw new Error('quizId diperlukan.');
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var sh = _sheet(SHEET_TETAPAN);
    var rows = _readObjects(SHEET_TETAPAN);
    var existing = rows.filter(function (r) { return String(r.quizId).trim() === String(q.quizId).trim(); })[0];
    var values = [[
      String(q.quizId).trim(), q.namaProgram || '', q.badgeName || '', q.tahun || '',
      q.ambangLulus || 80, q.bilSoalan || 10, q.verifyMethod || 'ic_last4',
      q.slidesTemplateId || '', q.aktif ? true : false,
    ]];
    if (existing) sh.getRange(existing._row, 1, 1, TETAPAN_COLS.length).setValues(values);
    else sh.appendRow(values[0]);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

// ---- Soalan ----
var SOALAN_COLS = ['quizId','soalan','A','B','C','D','E','jawapan','markah','aktif','gambar'];

function adminListQuestions(token, quizId) {
  _requireAdmin(token);
  return _readObjects(SHEET_SOALAN)
    .filter(function (r) { return String(r.quizId).trim() === String(quizId).trim(); })
    .map(function (r) {
      return {
        row: r._row, quizId: String(r.quizId).trim(), soalan: r.soalan,
        A: r.A, B: r.B, C: r.C, D: r.D, E: r.E,
        jawapan: _normKunci(r.jawapan).join(','),
        markah: r.markah || 1, aktif: _truthy(r.aktif),
        gambar: _gambarCell(r), // teguh: fallback baca lajur K jika header hilang
      };
    });
}

function adminSaveQuestion(token, q) {
  _requireAdmin(token);
  if (!q || !String(q.quizId).trim()) throw new Error('quizId diperlukan.');
  if (!String(q.soalan).trim()) throw new Error('Teks soalan diperlukan.');
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var sh = _sheet(SHEET_SOALAN);
    var values = [[
      String(q.quizId).trim(), String(q.soalan).trim(),
      q.A || '', q.B || '', q.C || '', q.D || '', q.E || '',
      _normKunci(q.jawapan).join(','), q.markah || 1, q.aktif ? true : false,
      String(q.gambar || '').trim(),
    ]];
    if (q.row) sh.getRange(q.row, 1, 1, SOALAN_COLS.length).setValues(values);
    else sh.appendRow(values[0]);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/** Muat naik imej soalan (base64 dari editor) → simpan ke Drive → pulang URL */
function adminUploadImage(token, dataB64, mimeType, name) {
  _requireAdmin(token);
  if (!dataB64) throw new Error('Tiada data imej.');
  var bytes = Utilities.base64Decode(dataB64);
  var blob = Utilities.newBlob(bytes, mimeType || 'image/png', name || 'soalan');
  var file = _quizImageFolder().createFile(blob); // _quizImageFolder di ImportForm.gs
  file.setName('soalan-' + new Date().getTime() + '-' + String(name || 'img').replace(/[^\w.\-]+/g, '_'));
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return { url: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000' };
}

function adminDeleteQuestion(token, row) {
  _requireAdmin(token);
  if (!row || row < 2) throw new Error('Baris tidak sah.');
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try { _sheet(SHEET_SOALAN).deleteRow(row); return { ok: true }; }
  finally { lock.releaseLock(); }
}

/** Normalize quizId untuk perbandingan teguh (abaikan beza ruang/nbsp) */
function _normId(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

// ---- Keputusan ----
function adminGetResults(token, quizId) {
  _requireAdmin(token);
  var all = _readObjects(SHEET_KEPUTUSAN);
  var out = all
    .filter(function (r) { return !quizId || _normId(r.quizId) === _normId(quizId); })
    .map(function (r) {
      return {
        nama: String(r.nama == null ? '' : r.nama), schoolCode: String(r.schoolCode == null ? '' : r.schoolCode),
        bestScore: Number(r.bestScore) || 0, total: Number(r.total) || 0,
        passed: _truthy(r.passed), attempts: Number(r.attempts) || 0,
        firstPassedAt: _s(r.firstPassedAt), certNo: String(r.certNo == null ? '' : r.certNo),
        claimedAt: _s(r.claimedAt),
      };
    });
  return out;
}

/** Tukar apa-apa nilai (termasuk Date) ke teks selamat untuk serialisasi */
function _s(v) {
  if (v == null) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    try { return Utilities.formatDate(v, Session.getScriptTimeZone() || 'GMT+8', 'yyyy-MM-dd HH:mm'); }
    catch (e) { return String(v); }
  }
  return String(v);
}

/**
 * Ringkasan mengikut SEKOLAH untuk admin daerah:
 *   setiap sekolah → jumlah berdaftar, jumlah dah jawab, jumlah lulus.
 * "berdaftar" dari scoutnadi (jika endpoint sokong), "jawab/lulus" dari tab Keputusan.
 */
function adminGetSchoolSummary(token, quizId) {
  _requireAdmin(token);
  quizId = _normId(quizId);

  // 1) Senarai sekolah + jumlah berdaftar (dari scoutnadi)
  var schools = [];
  try { schools = getSchoolsForProgram(quizId) || []; } catch (e) { schools = []; }
  var byCode = {}; // schoolCode -> {schoolCode, schoolName, registered, answered, passed, students[]}
  schools.forEach(function (s) {
    var code = String(s.schoolCode || '').trim();
    byCode[code] = {
      schoolCode: code, schoolName: s.name || code,
      registered: (typeof s.registered === 'number' ? s.registered : null),
      answered: 0, passed: 0, students: [],
    };
  });

  // 2) Kira jawab & lulus + kumpul senarai murid (dari Keputusan) dalam satu bacaan
  _readObjects(SHEET_KEPUTUSAN)
    .filter(function (r) { return _normId(r.quizId) === quizId; })
    .forEach(function (r) {
      var code = String(r.schoolCode || '').trim();
      if (!byCode[code]) byCode[code] = { schoolCode: code, schoolName: code, registered: null, answered: 0, passed: 0, students: [] };
      byCode[code].answered += 1;
      if (_truthy(r.passed)) byCode[code].passed += 1;
      byCode[code].students.push({
        nama: String(r.nama == null ? '' : r.nama), bestScore: Number(r.bestScore) || 0,
        total: Number(r.total) || 0, passed: _truthy(r.passed), attempts: Number(r.attempts) || 0,
        certNo: String(r.certNo == null ? '' : r.certNo), claimedAt: _s(r.claimedAt),
      });
    });

  // 3) Susun ikut nama; kira jumlah keseluruhan
  var rows = Object.keys(byCode).map(function (k) { return byCode[k]; })
    .sort(function (a, b) { return String(a.schoolName).localeCompare(String(b.schoolName)); });

  var totals = { schools: rows.length, answeredSchools: 0, registered: 0, answered: 0, passed: 0, hasRegistered: false };
  rows.forEach(function (r) {
    if (r.answered > 0) totals.answeredSchools += 1;
    if (typeof r.registered === 'number') { totals.registered += r.registered; totals.hasRegistered = true; }
    totals.answered += r.answered;
    totals.passed += r.passed;
  });

  return { rows: rows, totals: totals };
}

// ---- Import dari Google Form (melalui panel) — guna Forms API + gambar ----

/**
 * Import terus tanpa pratonton. Dikekalkan sebagai jalan pintas; panel admin
 * kini menggunakan adminPreviewFormImport → adminCommitImport.
 * `dipotong` disertakan — sebelum ini ia dikira oleh server tetapi dibuang di
 * sini, jadi panel tidak pernah memberi amaran yang menu Sheet sudah beri.
 */
function adminImportFromForm(token, formUrlOrId, quizId) {
  _requireAdmin(token);
  var r = importFormToSheet(formUrlOrId, quizId); // dikongsi dengan menu Sheet
  return { ok: true, imported: r.imported, withImage: r.withImage, dipotong: r.dipotong };
}

/**
 * LANGKAH 1 — baca Form dan pulangkan soalan untuk disemak. Tiada apa-apa
 * ditulis ke tab Soalan.
 *
 * Gambar SUDAH disimpan ke Drive pada tahap ini (tiada pilihan lain — lihat
 * _parseFormQuestions), jadi pemanggil WAJIB menghabiskan pratonton dengan
 * adminCommitImport atau adminDiscardPreview supaya gambar yang ditolak
 * dibuang.
 */
function adminPreviewFormImport(token, formUrlOrId, quizId) {
  _requireAdmin(token);
  quizId = String(quizId || '').trim();
  if (!quizId) throw new Error('Sila pilih kuiz dahulu sebelum mengimport.');

  var p = _parseFormQuestions(formUrlOrId, quizId, { papar: true });
  if (p.items.length === 0) {
    throw new Error('Tiada soalan berpilihan dijumpai dalam Form ' +
                    '(aneka pilihan, kotak semak, atau menu jatuh).');
  }

  var r = { jumlah: p.items.length, boleh: 0, adaAmaran: 0, ditanda: 0,
            bergambar: p.withImage, dipotong: p.dipotong, semuaTiadaKunci: true };
  p.items.forEach(function (it) {
    if (it.boleh) r.boleh++;
    if (it.amaran.length) r.adaAmaran++;
    if (it.ambil) r.ditanda++;
    if (it.amaran.indexOf('tiada-kunci') < 0) r.semuaTiadaKunci = false;
  });

  return { quizId: quizId, items: p.items, ringkasan: r };
}

/**
 * LANGKAH 2 — tulis soalan yang ditanda; buang gambar Drive bagi yang tidak.
 *
 * Token disahkan SEMULA di sini, bukan dipercayai daripada langkah pratonton.
 * Medan `amaran`/`boleh` daripada klien diabaikan sepenuhnya — ia hanya untuk
 * paparan. Yang dibaca ialah teks, pilihan, kunci, gambar, dan tanda `ambil`.
 * (Klien boleh mengarang kandungan ini, tetapi admin yang sama sudah boleh
 * menulis apa-apa melalui adminSaveQuestion — bukan lubang baharu.)
 */
function adminCommitImport(token, quizId, items) {
  _requireAdmin(token);
  quizId = String(quizId || '').trim();
  if (!quizId) throw new Error('quizId diperlukan.');

  var ambil = [], buang = [];
  (items || []).forEach(function (it) {
    if (!it) return;
    if (it.ambil && String(it.soalan || '').trim()) ambil.push(it);
    else if (it.gambarFileId) buang.push(it.gambarFileId);
  });
  if (ambil.length === 0) throw new Error('Tiada soalan ditanda untuk disimpan.');

  var rows = ambil.map(function (it) { return _itemKeRow(it, quizId); });
  var ditulis = _writeQuestionRows(rows);
  return { ok: true, ditulis: ditulis, gambarDibuang: _buangFailDrive(buang) };
}

/** Batal pratonton — buang semua gambar yang sempat disimpan ke Drive */
function adminDiscardPreview(token, fileIds) {
  _requireAdmin(token);
  return { ok: true, dibuang: _buangFailDrive(fileIds || []) };
}
