/**
 * Teacher.gs — halaman "Semakan Guru".
 * Guru log masuk guna akaun SEKOLAH scoutnadi (school_user). Hanya nampak
 * murid sekolahnya sendiri & boleh cetak semula sijil murid yang lulus.
 * Pengesahan + skop sekolah dibuat di Supabase (teacher_login/teacher_verify).
 */

function teacherLogin(email, password) {
  var res = callEligibility({ action: 'teacher_login', email: email, password: password });
  if (!res.ok) throw new Error(res.error || 'Log masuk gagal.');
  return { token: res.token, name: res.name, schoolCode: res.schoolCode, schoolName: res.schoolName };
}

function _requireTeacher(token) {
  if (!token) throw new Error('Sesi tamat. Sila log masuk semula.');
  var res = callEligibility({ action: 'teacher_verify', token: token });
  if (!res.ok) throw new Error('Sesi tidak sah / tamat tempoh. Sila log masuk semula.');
  return res; // { schoolCode, schoolName }
}

/** Senarai kuiz (untuk penapis) */
function teacherListQuizzes(token) {
  _requireTeacher(token);
  return _readObjects(SHEET_TETAPAN).map(function (r) {
    return { quizId: String(r.quizId).trim(), namaProgram: String(r.namaProgram || '').trim() };
  });
}

/** Senarai murid sekolah guru: yang DAH JAWAB + yang BELUM AMBIL ujian */
function teacherListStudents(token, quizId) {
  var t = _requireTeacher(token);
  var school = String(t.schoolCode).trim();
  var all = _readObjects(SHEET_KEPUTUSAN);

  // 1) Murid yang DAH JAWAB (dari Keputusan)
  var out = all
    .filter(function (r) {
      return String(r.schoolCode).trim() === school &&
             (!quizId || _normId(r.quizId) === _normId(quizId));
    })
    .map(function (r) {
      return {
        quizId: String(r.quizId).trim(), participantId: String(r.participantId).trim(),
        nama: String(r.nama == null ? '' : r.nama),
        bestScore: Number(r.bestScore) || 0, total: Number(r.total) || 0,
        passed: _truthy(r.passed), attempts: Number(r.attempts) || 0,
        firstPassedAt: _s(r.firstPassedAt),            // tarikh → teks (elak null serialisasi)
        certNo: String(r.certNo == null ? '' : r.certNo),
        claimedAt: _s(r.claimedAt),
      };
    });

  // 2) Murid BELUM AMBIL = berdaftar (scoutnadi) tolak yang dah jawab
  var answered = {};
  out.forEach(function (s) { answered[String(s.participantId).trim()] = true; });
  var notTaken = [], registered = 0;
  try {
    var cfg = getQuizConfig(quizId);
    var data = callEligibility({ action: 'list', badgeName: cfg.badgeName, year: cfg.tahun, schoolCode: school });
    var parts = data.participants || [];
    registered = parts.length;
    parts.forEach(function (p) {
      if (!answered[String(p.id).trim()]) notTaken.push({ nama: String(p.name || '') });
    });
    notTaken.sort(function (a, b) { return String(a.nama).localeCompare(String(b.nama)); });
  } catch (e) { /* jika endpoint tak sedia, notTaken kekal kosong */ }

  return { students: out, notTaken: notTaken, registered: registered, schoolCode: school };
}

/** Cetak semula sijil murid (hanya murid sekolah guru & telah lulus) */
function teacherReprintCertificate(token, quizId, participantId) {
  var t = _requireTeacher(token);
  var res = findResult(quizId, participantId);
  if (!res) throw new Error('Rekod murid tidak dijumpai.');
  if (String(res.schoolCode).trim() !== String(t.schoolCode).trim()) {
    throw new Error('Murid ini bukan dari sekolah anda.');
  }
  if (!_truthy(res.passed)) throw new Error('Murid ini belum lulus — sijil belum tersedia.');

  var cfg = getQuizConfig(quizId);
  var out = _buildCertFor(cfg, participantId, res);
  // Tanda telah dicetak (claimedAt) jika belum
  markClaimed(quizId, participantId);
  return out;
}
