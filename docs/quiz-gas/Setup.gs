/**
 * Setup.gs — bina tab Sheet automatik.
 * Jalankan fungsi `setupSheets` SEKALI (dari editor Apps Script, atau menu
 * Kuiz ▸ Bina/Semak Tab). Selamat dijalankan berulang (idempotent) — ia cuma
 * pastikan tab & header wujud, tidak memadam data sedia ada.
 */

var _QUIZ_TABS = {
  Tetapan: ['quizId', 'namaProgram', 'badgeName', 'tahun', 'ambangLulus', 'bilSoalan', 'verifyMethod', 'slidesTemplateId', 'aktif'],
  Soalan: ['quizId', 'soalan', 'A', 'B', 'C', 'D', 'E', 'jawapan', 'markah', 'aktif', 'gambar'],
  Cubaan: ['timestamp', 'quizId', 'schoolCode', 'participantId', 'nama', 'score', 'total', 'passed'],
  Keputusan: ['quizId', 'participantId', 'nama', 'schoolCode', 'bestScore', 'total', 'passed', 'attempts', 'firstPassedAt', 'certNo', 'claimedAt'],
};

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(_QUIZ_TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var headers = _QUIZ_TABS[name];
    sh.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight('bold')
      .setBackground('#ede9fe');
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, headers.length);
  });

  // Buang helaian default kosong (Sheet1/Helaian1) jika bukan tab kita
  ['Sheet1', 'Helaian1'].forEach(function (defName) {
    var def = ss.getSheetByName(defName);
    if (def && Object.keys(_QUIZ_TABS).indexOf(def.getName()) < 0 &&
        def.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(def);
    }
  });

  SpreadsheetApp.getActive().toast('Tab kuiz siap dibina ✔ (Tetapan, Soalan, Cubaan, Keputusan)');
}

/**
 * (Pilihan) Isi satu kuiz + beberapa soalan contoh untuk uji cepat.
 * UBAH badgeName & tahun supaya padan dengan program sebenar di scoutnadi
 * (jika tidak, senarai peserta akan kosong).
 */
function seedDemoQuiz() {
  setupSheets();
  var t = _sheet(SHEET_TETAPAN);
  var exists = _readObjects(SHEET_TETAPAN).some(function (r) { return String(r.quizId).trim() === 'keris-perak-2026'; });
  if (!exists) {
    // quizId|namaProgram|badgeName|tahun|ambangLulus|bilSoalan|verifyMethod|slidesTemplateId|aktif
    t.appendRow(['keris-perak-2026', 'Keris Perak 2026', 'Keris Perak', 2026, 80, 3, 'ic_last4', '', true]);
  }
  var s = _sheet(SHEET_SOALAN);
  var hasQ = _readObjects(SHEET_SOALAN).some(function (r) { return String(r.quizId).trim() === 'keris-perak-2026'; });
  if (!hasQ) {
    s.appendRow(['keris-perak-2026', 'Berapakah bilangan Undang-Undang Pengakap?', '7', '9', '10', '12', '', 'C', 1, true]);
    s.appendRow(['keris-perak-2026', 'Pengasas gerakan Pengakap sedunia ialah?', 'Edison', 'Bell', 'Robert Baden-Powell', 'Churchill', '', 'C', 1, true]);
    s.appendRow(['keris-perak-2026', 'Warna asas uniform Pengakap Kanak-kanak?', 'Hijau', 'Coklat', 'Biru', 'Kuning', '', 'B', 1, true]);
  }
  SpreadsheetApp.getActive().toast('Kuiz contoh ditambah (keris-perak-2026).');
}
