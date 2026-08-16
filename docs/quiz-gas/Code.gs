/**
 * Sistem Kuiz Pengakap — Google Apps Script (teras)
 * --------------------------------------------------
 * Hidang UI (HtmlService) + fungsi server yang dipanggil klien melalui
 * google.script.run. Data soalan/keputusan dalam Google Sheets; data
 * peserta diambil dari scoutnadi (Supabase) melalui Eligibility.gs.
 *
 * Nama tab Sheet (cipta dengan baris header tepat seperti README-setup.md):
 *   Tetapan   : quizId | namaProgram | badgeName | tahun | ambangLulus | bilSoalan | verifyMethod | slidesTemplateId | aktif
 *   Soalan    : quizId | soalan | A | B | C | D | E | jawapan | markah | aktif
 *   Cubaan    : timestamp | quizId | schoolCode | participantId | nama | score | total | passed
 *   Keputusan : quizId | participantId | nama | schoolCode | bestScore | total | passed | attempts | firstPassedAt | certNo | claimedAt
 */

const SHEET_TETAPAN = 'Tetapan';
const SHEET_SOALAN = 'Soalan';
const SHEET_CUBAAN = 'Cubaan';
const SHEET_KEPUTUSAN = 'Keputusan';
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

// ============================================================
// WEB APP ENTRY
// ============================================================
function doGet(e) {
  const logoUrl = PropertiesService.getScriptProperties().getProperty('LOGO_URL') || '';
  const page = e && e.parameter && e.parameter.page;
  const file = page === 'admin' ? 'Admin' : (page === 'guru' ? 'Guru' : 'Index');
  const title = page === 'admin' ? 'Admin Kuiz — Kinta Utara'
    : (page === 'guru' ? 'Semakan Guru — Kinta Utara' : 'Kuiz Pengakap — Kinta Utara');
  const t = HtmlService.createTemplateFromFile(file);
  // URL logo (Kinta Utara) — set Script Property LOGO_URL (Drive/web). Kosong = logo disembunyikan.
  t.logoUrl = logoUrl;
  // URL web app ini (untuk pautan ?page=guru / ?page=admin pada paparan pelajar)
  t.appUrl = ScriptApp.getService().getUrl();
  return t.evaluate()
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================
// SHEET HELPERS
// ============================================================
function _ss() { return SpreadsheetApp.getActiveSpreadsheet(); }

function _sheet(name) {
  const sh = _ss().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" tidak dijumpai.');
  return sh;
}

/** Baca sheet menjadi array objek ikut header baris 1 (+ _row nombor baris) */
function _readObjects(name) {
  const sh = _sheet(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(function (h) { return String(h).trim(); });
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const obj = {};
    headers.forEach(function (h, c) { obj[h] = values[i][c]; });
    obj._row = i + 1;
    rows.push(obj);
  }
  return rows;
}

function _truthy(v) {
  if (v === true) return true;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'ya' || s === 'yes' || s === '1' || s === 'aktif';
}

function _today() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'GMT+8', 'd MMMM yyyy');
}

// ============================================================
// CONFIG (Tetapan)
// ============================================================
function getQuizConfig(quizId) {
  const rows = _readObjects(SHEET_TETAPAN);
  const r = rows.filter(function (x) { return String(x.quizId).trim() === String(quizId).trim(); })[0];
  if (!r) throw new Error('Kuiz "' + quizId + '" tidak dijumpai dalam Tetapan.');
  return {
    quizId: String(r.quizId).trim(),
    namaProgram: String(r.namaProgram || '').trim(),
    badgeName: String(r.badgeName || '').trim(),
    tahun: parseInt(String(r.tahun), 10),
    ambangLulus: parseInt(String(r.ambangLulus), 10) || 80,
    bilSoalan: parseInt(String(r.bilSoalan), 10) || 10,
    verifyMethod: String(r.verifyMethod || 'ic_last4').trim(),
    slidesTemplateId: String(r.slidesTemplateId || '').trim(),
    aktif: _truthy(r.aktif),
  };
}

// ============================================================
// SERVER FUNCTIONS (dipanggil oleh klien google.script.run)
// ============================================================

/** Senarai program aktif untuk skrin pertama */
function getActivePrograms() {
  return _readObjects(SHEET_TETAPAN)
    .filter(function (r) { return _truthy(r.aktif); })
    .map(function (r) {
      return { quizId: String(r.quizId).trim(), namaProgram: String(r.namaProgram || '').trim() };
    });
}

/** Sekolah yang ada peserta layak untuk program ini (dari scoutnadi) */
function getSchoolsForProgram(quizId) {
  const cfg = getQuizConfig(quizId);
  const data = callEligibility({ action: 'schools', badgeName: cfg.badgeName, year: cfg.tahun });
  return data.schools || [];
}

/** Senarai nama peserta berdaftar bagi sekolah dipilih */
function getParticipants(quizId, schoolCode) {
  const cfg = getQuizConfig(quizId);
  const data = callEligibility({
    action: 'list', badgeName: cfg.badgeName, year: cfg.tahun, schoolCode: schoolCode,
  });
  return data.participants || [];
}

/**
 * Mula satu cubaan: sahkan identiti → pilih soalan rawak → simpan jawapan
 * betul dalam cache (tidak dihantar ke klien) → pulang soalan + attemptId.
 */
function startAttempt(quizId, participantId, schoolCode, verifyValue) {
  const cfg = getQuizConfig(quizId);
  const v = verifyParticipant(participantId, verifyValue, cfg.verifyMethod);
  if (!v.ok) throw new Error('Pengesahan gagal. Pastikan No. IC / Keahlian betul.');

  const picked = pickQuestions(cfg); // { questions:[client], answerKey:{qid->letter}, total }
  const attemptId = Utilities.getUuid();
  const cache = CacheService.getScriptCache();
  cache.put('attempt:' + attemptId, JSON.stringify({
    quizId: cfg.quizId, participantId: participantId, schoolCode: schoolCode,
    nama: v.name, answerKey: picked.answerKey, total: picked.total,
    ambangLulus: cfg.ambangLulus,
  }), 21600); // 6 jam (maksimum CacheService)

  return {
    attemptId: attemptId,
    nama: v.name,
    namaProgram: cfg.namaProgram,
    ambangLulus: cfg.ambangLulus,
    questions: picked.questions,
  };
}

/** Hantar jawapan: nilai di server, rekod, pulang keputusan */
function submitAttempt(attemptId, answers) {
  const cache = CacheService.getScriptCache();
  const raw = cache.get('attempt:' + attemptId);
  if (!raw) throw new Error('Sesi cubaan tamat tempoh. Sila mula semula.');
  const a = JSON.parse(raw);

  let score = 0;
  Object.keys(a.answerKey).forEach(function (qid) {
    const given = answers ? String(answers[qid] || '').trim().toUpperCase() : '';
    if (given && given === String(a.answerKey[qid]).trim().toUpperCase()) score++;
  });
  const total = a.total;
  const peratus = total > 0 ? Math.round((score / total) * 100) : 0;
  const passed = peratus >= a.ambangLulus;

  recordAttempt(a, score, total, passed);
  cache.remove('attempt:' + attemptId);

  return { score: score, total: total, peratus: peratus, ambangLulus: a.ambangLulus, passed: passed };
}

/** Claim sijil PDF (hanya jika lulus) */
function claimCertificate(quizId, participantId, verifyValue) {
  return generateCertificatePdf(quizId, participantId, verifyValue);
}
