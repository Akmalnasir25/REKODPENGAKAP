/**
 * Quiz.gs — pemilihan soalan, penilaian (di server), dan rekod
 * Cubaan/Keputusan dengan LockService (selamat untuk pengguna serentak).
 */

/**
 * Normalkan kunci jawapan → array huruf unik & tersusun.
 *
 * Ini SATU-SATUNYA tempat kunci jawapan ditafsir. Import, pemarkahan, paparan
 * dan editor admin semuanya melaluinya, supaya mustahil dua tempat menafsir
 * "A,C" secara berbeza.
 *
 * Menerima rentetan ATAU array dengan sengaja: cubaan yang bermula SEBELUM
 * sistem menyokong jawapan berbilang menyimpan kunci sebagai rentetan ('C')
 * dalam cache, manakala yang baharu menyimpan array (['C']). Cache hidup 6 jam
 * (Code.gs), jadi kedua-dua bentuk boleh wujud serentak semasa kemas kini.
 *
 *   'C'      -> ['C']        'A,C'     -> ['A','C']
 *   'AC'     -> ['A','C']    'a, c'    -> ['A','C']
 *   'C,A'    -> ['A','C']    'A,A'     -> ['A']
 *   'A dan C'-> ['A','C']    ['A','C'] -> ['A','C']
 *
 * Input longgar, output ketat — admin boleh menaip ikut selesa, tetapi
 * perbandingan sentiasa membanding bentuk yang sama.
 */
function _normKunci(v) {
  if (v == null) return [];
  var s = (Array.isArray(v) ? v.join(',') : String(v)).toUpperCase();
  // Ada aksara selain A-E (koma, ruang, perkataan)? Anggap senarai bertanda
  // pemisah dan terima token satu huruf sahaja — supaya "A dan C" tidak
  // tersalah baca sebagai A, D, C. Kalau tiada, ia huruf berturut ("AC").
  var tokens = /[^A-E]/.test(s.trim())
    ? s.split(/[^A-E]+/).filter(function (t) { return t.length === 1; })
    : s.trim().split('');
  var out = [], seen = {};
  tokens.forEach(function (L) {
    if (L && !seen[L]) { seen[L] = true; out.push(L); }
  });
  return out.sort();
}

/**
 * Pilih N soalan rawak aktif bagi quizId.
 * Pulang: { questions: [{ id, soalan, options:[{key,text}], multi }],
 *           answerKey: { id -> ['A','C'] }, total }
 * (answerKey TIDAK dihantar ke klien — disimpan dalam cache cubaan.)
 *
 * `multi` memberitahu klien untuk memapar kotak semak. Ia mendedahkan bahawa
 * soalan itu ada lebih daripada satu jawapan betul — sama seperti Google Form
 * yang memaparkan kotak semak — tetapi tidak mendedahkan berapa atau yang mana.
 */
function pickQuestions(cfg) {
  const all = _readObjects(SHEET_SOALAN).filter(function (r) {
    return String(r.quizId).trim() === cfg.quizId && _truthy(r.aktif) && String(r.soalan).trim() !== '';
  });
  if (all.length === 0) throw new Error('Tiada soalan aktif untuk kuiz ini.');

  // Kocok betul-betul rawak (Fisher-Yates) — susunan berbeza bagi setiap murid/cubaan,
  // kemudian ambil bilSoalan pertama.
  const shuffled = _shuffle(all);
  const chosen = shuffled.slice(0, Math.min(cfg.bilSoalan, shuffled.length));

  const questions = [];
  const answerKey = {};
  chosen.forEach(function (r) {
    const qid = 'q' + r._row;
    const options = _optionsDariBaris(r);
    const kunci = _normKunci(r.jawapan);
    if (!_soalanBolehDijawab(options, kunci).boleh) return; // langkau soalan tak lengkap

    answerKey[qid] = kunci;
    questions.push({
      id: qid,
      soalan: String(r.soalan).trim(),
      gambar: _imageForClient(_gambarCell(r)),
      options: options,
      multi: kunci.length > 1,
    });
  });

  if (questions.length === 0) {
    throw new Error('Soalan tidak lengkap — perlu sekurang-kurangnya 2 pilihan ' +
                    'dan kunci jawapan yang menunjuk kepada pilihan yang ada.');
  }
  return { questions: questions, answerKey: answerKey, total: questions.length };
}

/**
 * Baris Soalan → senarai pilihan berteks, KEKAL pada hurufnya.
 * Lajur B kosong dengan lajur C berisi menghasilkan [A, C], bukan [A, B] —
 * kunci jawapan menunjuk kepada huruf, jadi huruf tidak boleh dianjak.
 */
function _optionsDariBaris(r) {
  var options = [];
  LETTERS.forEach(function (L) {
    var text = String(r[L] == null ? '' : r[L]).trim();
    if (text !== '') options.push({ key: L, text: text });
  });
  return options;
}

/**
 * Adakah soalan ini boleh dijawab dalam kuiz sebenar?
 *
 * SATU-SATUNYA takrif "boleh dijawab" dalam sistem. `pickQuestions` menggunakannya
 * untuk melangkau soalan rosak, dan pratonton import menggunakannya untuk memberi
 * amaran SEBELUM soalan itu ditulis. Kalau dua tempat menilainya secara berasingan,
 * pratonton akan menjanjikan soalan yang kuiz kemudian buang senyap.
 *
 * Pulang { boleh, sebab } — `sebab` ialah kod amaran, sama dengan yang dipapar
 * oleh skrin pratonton (lihat docs/rancangan-pratonton-import-soalan.md §3.3).
 */
function _soalanBolehDijawab(options, kunci) {
  if (!options || options.length < 2) return { boleh: false, sebab: 'pilihan-kurang' };
  if (!kunci || kunci.length === 0) return { boleh: false, sebab: 'tiada-kunci' };

  // Setiap huruf kunci mesti ada teks pilihan. Kunci 'E' pada soalan yang lajur
  // E-nya kosong bermakna soalan itu tidak boleh dijawab betul oleh sesiapa;
  // lebih baik dilangkau daripada menjatuhkan markah murid secara senyap.
  var adaTeks = {};
  options.forEach(function (o) { adaTeks[o.key] = true; });
  var sah = kunci.every(function (L) { return adaTeks[L] === true; });
  if (!sah) return { boleh: false, sebab: 'kunci-tanpa-teks' };

  return { boleh: true, sebab: '' };
}

/** Kocok array (Fisher-Yates) — pulang salinan baharu, tak ubah asal */
function _shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/**
 * Baca nilai gambar untuk satu baris soalan secara TEGUH:
 *  1) cuba ikut header 'gambar'
 *  2) jika kosong, baca terus lajur K (11) ikut KEDUDUKAN — elak isu header
 *     K1 yang hilang/tersalah nama.
 */
function _gambarCell(r) {
  var v = String(r.gambar == null ? '' : r.gambar).trim();
  if (v) return v;
  try {
    var cell = _sheet(SHEET_SOALAN).getRange(r._row, 11).getValue(); // lajur K = gambar
    return String(cell == null ? '' : cell).trim();
  } catch (e) { return ''; }
}


/**
 * Tukar nilai `gambar` (URL Drive) → data URI base64 supaya imej dibenamkan
 * terus dalam soalan. Ini elak sepenuhnya isu perkongsian/CDN Drive.
 * Guna cache (per fileId) untuk elak baca berulang. Kalau gagal / bukan fail
 * Drive, pulang nilai asal (biar klien cuba URL).
 */
function _imageForClient(gambar) {
  gambar = String(gambar || '').trim();
  if (!gambar) return '';
  if (gambar.indexOf('data:') === 0) return gambar;         // sudah data URI
  var m = gambar.match(/[-\w]{25,}/);                        // ID fail Drive
  if (!m) return gambar;                                     // URL luar biasa
  var id = m[0];
  var cache = CacheService.getScriptCache();
  var key = 'img:' + id;
  try {
    var hit = cache.get(key);
    if (hit) return hit;
  } catch (e) {}
  try {
    var blob = DriveApp.getFileById(id).getBlob();
    var uri = 'data:' + (blob.getContentType() || 'image/png') + ';base64,' +
              Utilities.base64Encode(blob.getBytes());
    try { if (uri.length < 95000) cache.put(key, uri, 21600); } catch (e2) {} // <100KB sahaja
    return uri;
  } catch (e3) {
    return gambar; // fallback: biar klien cuba URL asal
  }
}

/** Rekod cubaan + kemas kini ringkasan Keputusan (LockService) */
function recordAttempt(a, score, total, passed) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // 1) Log Cubaan
    _sheet(SHEET_CUBAAN).appendRow([
      new Date(), a.quizId, a.schoolCode, a.participantId, a.nama, score, total, passed,
    ]);

    // 2) Upsert Keputusan
    const sh = _sheet(SHEET_KEPUTUSAN);
    const rows = _readObjects(SHEET_KEPUTUSAN);
    const existing = rows.filter(function (r) {
      return String(r.quizId).trim() === a.quizId &&
             String(r.participantId).trim() === String(a.participantId).trim();
    })[0];

    const now = new Date();
    if (!existing) {
      const certNo = passed ? _newCertNo(a.quizId) : '';
      sh.appendRow([
        a.quizId, a.participantId, a.nama, a.schoolCode, score, total, passed,
        1, passed ? now : '', certNo, '',
      ]);
    } else {
      const row = existing._row;
      const attempts = (parseInt(String(existing.attempts), 10) || 0) + 1;
      const bestScore = Math.max(parseInt(String(existing.bestScore), 10) || 0, score);
      const wasPassed = _truthy(existing.passed);
      const nowPassed = wasPassed || passed;
      const firstPassedAt = existing.firstPassedAt || (passed ? now : '');
      let certNo = existing.certNo;
      if (!certNo && nowPassed) certNo = _newCertNo(a.quizId);
      // Tetapan lajur: quizId|participantId|nama|schoolCode|bestScore|total|passed|attempts|firstPassedAt|certNo|claimedAt
      sh.getRange(row, 5, 1, 7).setValues([[
        bestScore, total, nowPassed, attempts, firstPassedAt, certNo, existing.claimedAt || '',
      ]]);
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * Nombor siri sijil ikut nama kuiz: <PREFIX>/<TAHUN>/<NNNN>
 *   cth "Keris Emas 2026" → KE/2026/0001, KE/2026/0002, …
 * - PREFIX = huruf awal setiap perkataan nama program (buang perkataan nombor).
 * - TAHUN  = lajur `tahun` di Tetapan (atau tahun semasa jika kosong).
 * - Kaunter BERASINGAN setiap kuiz (Script Property `CERT_SERIAL::<quizId>`).
 * Diperuntukkan sekali per peserta yang lulus; cetak semula kekalkan nombor.
 * Dipanggil dari dalam kunci recordAttempt, jadi tak perlu kunci tambahan.
 */
function _newCertNo(quizId) {
  var cfg;
  try { cfg = getQuizConfig(quizId); } catch (e) { cfg = {}; }
  var prefix = _certPrefix(cfg.namaProgram || quizId);
  var yr = String(cfg.tahun == null ? '' : cfg.tahun).trim() ||
           Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'GMT+8', 'yyyy');
  var props = PropertiesService.getScriptProperties();
  var key = 'CERT_SERIAL::' + String(quizId).trim();
  var n = (parseInt(props.getProperty(key), 10) || 0) + 1;
  props.setProperty(key, String(n));
  var pad = ('0000' + n).slice(-4); // 4 digit
  return prefix + '/' + yr + '/' + pad;
}

/** Singkatan dari nama program: huruf awal setiap perkataan (abaikan nombor) */
function _certPrefix(name) {
  var words = String(name || '').trim().split(/\s+/).filter(function (w) {
    return w && !/^\d+$/.test(w); // buang perkataan nombor (cth tahun)
  });
  var p = words.map(function (w) { return w.charAt(0); }).join('').toUpperCase();
  return p || 'SIJIL';
}

/** Cari ringkasan keputusan untuk seorang peserta */
function findResult(quizId, participantId) {
  return _readObjects(SHEET_KEPUTUSAN).filter(function (r) {
    return String(r.quizId).trim() === String(quizId).trim() &&
           String(r.participantId).trim() === String(participantId).trim();
  })[0] || null;
}

/** Tanda sijil telah di-claim (timestamp) */
function markClaimed(quizId, participantId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const r = findResult(quizId, participantId);
    if (r && !r.claimedAt) {
      _sheet(SHEET_KEPUTUSAN).getRange(r._row, 11).setValue(new Date());
    }
  } finally {
    lock.releaseLock();
  }
}
