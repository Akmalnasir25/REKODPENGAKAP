/**
 * Certificate.gs — jana sijil PDF dari template Google Docs/Slides.
 *
 * Placeholder dalam template (taip betul-betul):
 *   <<NAMA PENUH>>  — nama penuh calon
 *   <<IC>>          — nombor kad pengenalan
 *   <<NO AHLI>>     — nombor keahlian
 *   <<SEKOLAH>>     — nama sekolah
 *   <<MARKAH>>      — keputusan (cth "9/10 (90%)")
 * (Pilihan tambahan: {{program}} {{tarikh}} {{no_sijil}})
 *
 * IC / No. Ahli / nama sekolah diambil dari scoutnadi HANYA semasa jana sijil
 * (server-side, melalui kunci API) — tidak disimpan dalam Sheet.
 * Pulang base64 PDF untuk muat turun/cetak (salinan sementara dibuang).
 */
function generateCertificatePdf(quizId, participantId, verifyValue) {
  const cfg = getQuizConfig(quizId);

  // Sahkan semula identiti sebelum keluarkan sijil
  const v = verifyParticipant(participantId, verifyValue, cfg.verifyMethod);
  if (!v.ok) throw new Error('Pengesahan gagal. Sijil tidak boleh dikeluarkan.');

  const res = findResult(quizId, participantId);
  if (!res || !_truthy(res.passed)) {
    throw new Error('Anda belum lulus kuiz ini. Sijil belum tersedia.');
  }

  const out = _buildCertFor(cfg, participantId, res);
  markClaimed(quizId, participantId);
  return out;
}

/** Kumpul medan calon (dari scoutnadi) + markah, kemudian jana PDF */
function _buildCertFor(cfg, participantId, res) {
  const info = callEligibility({ action: 'cert_fields', participantId: participantId });
  if (!info.ok) throw new Error('Gagal dapatkan maklumat calon untuk sijil.');

  const total = parseInt(String(res.total), 10) || 0;
  const best = parseInt(String(res.bestScore), 10) || 0;
  const peratus = total > 0 ? Math.round(best / total * 100) : 0;

  const data = {
    nama: info.name || res.nama || '',
    ic: info.ic || '',
    noAhli: info.membership || '',
    sekolah: info.schoolName || '',
    markah: best + '/' + total + ' (' + peratus + '%)',
    certNo: res.certNo || '',
  };
  return buildCertificatePdf(cfg, data);
}

/**
 * Jana PDF sijil dari template (guna semula oleh peserta & guru).
 * Menyokong template Google DOCS atau Google SLIDES (auto-kesan).
 * Tidak buat sebarang semakan kelayakan — pemanggil mesti sahkan dahulu.
 *
 * data = { nama, ic, noAhli, sekolah, markah, certNo }
 */
function buildCertificatePdf(cfg, data) {
  var templateId = cfg.slidesTemplateId;
  if (!templateId) {
    throw new Error('Template sijil belum ditetapkan (slidesTemplateId kosong di Tetapan).');
  }
  var src = DriveApp.getFileById(templateId);
  var mime = src.getMimeType();
  var copy = src.makeCopy('Slip-' + (data.nama || '') + '-' + new Date().getTime());
  var copyId = copy.getId();
  var fields = {
    '<<NAMA PENUH>>': String(data.nama || ''),
    '<<IC>>': String(data.ic || ''),
    '<<NO AHLI>>': String(data.noAhli || ''),
    '<<SEKOLAH>>': String(data.sekolah || ''),
    '<<MARKAH>>': String(data.markah || ''),
    '<<NO SIRI>>': String(data.certNo || ''),   // nombor siri berturutan
    // Pilihan tambahan
    '{{program}}': String(cfg.namaProgram || ''),
    '{{tarikh}}': _today(),
    '{{no_sijil}}': String(data.certNo || ''),
  };

  try {
    if (mime === MimeType.GOOGLE_SLIDES) {
      var deck = SlidesApp.openById(copyId);
      deck.getSlides().forEach(function (slide) {
        Object.keys(fields).forEach(function (k) { slide.replaceAllText(k, fields[k]); }); // literal
      });
      deck.saveAndClose();
    } else if (mime === MimeType.GOOGLE_DOCS) {
      var doc = DocumentApp.openById(copyId);
      var parts = [doc.getBody(), doc.getHeader(), doc.getFooter()];
      parts.forEach(function (p) {
        if (!p) return;
        Object.keys(fields).forEach(function (k) { p.replaceText(_escRe(k), fields[k]); }); // regex
      });
      doc.saveAndClose();
    } else {
      throw new Error('Template mesti Google Docs atau Google Slides. (Jenis: ' + mime + ')');
    }

    var pdf = DriveApp.getFileById(copyId).getAs('application/pdf');
    var b64 = Utilities.base64Encode(pdf.getBytes());
    return {
      filename: 'Slip-' + String(data.nama || 'calon').replace(/[^\w\- ]+/g, '') + '.pdf',
      mimeType: 'application/pdf',
      dataB64: b64,
    };
  } finally {
    try { DriveApp.getFileById(copyId).setTrashed(true); } catch (e) {}
  }
}

/** Escape aksara khas regex (untuk DocumentApp.replaceText) */
function _escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
