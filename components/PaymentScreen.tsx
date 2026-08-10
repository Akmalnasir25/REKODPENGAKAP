import React, { useEffect, useState } from 'react';
import {
  CreditCard, Landmark, FileCheck2, Loader2, CheckCircle2,
  AlertTriangle, Clock, Upload, ExternalLink, X, Download,
} from 'lucide-react';
import {
  janaBil, semakStatusBayaran, hantarBuktiBayaran, getArahanBayaranManual, getMaklumatBayaran,
  KaedahBayaran, BilDijana, StatusBayaran,
} from '../services/paymentService';
import { getDataResit, muatNaikBukti } from '../services/paymentService';
import { muatTurunResit } from '../services/receiptService';
import { formatRM } from '../services/programSummary';

interface Props {
  /** Penapis program semasa. Kosong bermakna "Semua program". */
  badgeName: string;
  /**
   * Program yang benar-benar akan dibil dalam siri ini.
   *
   * badgeName sahaja tidak mencukupi: cara semula jadi menghantar satu siri
   * ialah memilih "Semua program", yang menjadikannya kosong. Tanpa senarai
   * ini skrin tidak boleh menyelesaikan akaun gateway, dan pilihan FPX hilang.
   */
  programs?: string[];
  year: number;
  siri: number;
  negeriCode?: string;
  daerahCode?: string;
  /** Dipanggil bila pendaftaran akhirnya masuk giliran pengesahan. */
  onSelesai: () => void;
  onTutup: () => void;
  /** Sambung semula bayaran sedia ada, cth selepas kembali dari gateway. */
  paymentIdSediaAda?: string;
}

/**
 * Skrin bayaran — muncul selepas sekolah menekan Hantar bagi program yang
 * mewajibkan bayaran.
 *
 * Pendaftaran kekal DRAF sepanjang skrin ini terbuka. Ia hanya masuk giliran
 * pengesahan admin selepas bayaran diuruskan — itulah maksud "tiada bayaran,
 * tiada penghantaran".
 */
export const PaymentScreen: React.FC<Props> = ({
  badgeName, programs, year, siri, negeriCode, daerahCode, onSelesai, onTutup, paymentIdSediaAda,
}) => {
  const [kaedah, setKaedah] = useState<KaedahBayaran | null>(null);
  const [bil, setBil] = useState<BilDijana | null>(null);
  const [status, setStatus] = useState<StatusBayaran | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [ralat, setRalat] = useState('');
  const [arahan, setArahan] = useState<{
    bankAccountInfo: string | null; adaOnline: boolean; adaPindahan: boolean; adaCek: boolean;
  }>({ bankAccountInfo: null, adaOnline: false, adaPindahan: true, adaCek: true });

  const [rujukan, setRujukan] = useState('');
  const [fail, setFail] = useState<File | null>(null);
  const [memuatNaik, setMemuatNaik] = useState(false);
  const [menjanaResit, setMenjanaResit] = useState(false);
  // Bil yang dilangkau sepenuhnya. Ia BUKAN kegagalan — pendaftaran memang
  // dihantar — tetapi menutup skrin tanpa berkata apa-apa menjadikannya
  // kelihatan seperti butang yang rosak.
  const [dilangkauPenuh, setDilangkauPenuh] = useState<BilDijana | null>(null);

  // Sambungan selepas kembali dari gateway TIDAK boleh mempercayai props.
  // billReturnUrl memuat semula halaman sepenuhnya, jadi penapis program dan
  // siri dalam UI sudah kembali kepada nilai awalnya sebelum skrin ini dibuka
  // semula. Baris bayaran ialah satu-satunya sumber yang masih tahu.
  const [asal, setAsal] = useState<{ year: number; siri: number; programs: string[] } | null>(null);
  useEffect(() => {
    if (!paymentIdSediaAda) { setAsal(null); return; }
    getMaklumatBayaran(paymentIdSediaAda).then(setAsal);
  }, [paymentIdSediaAda]);

  const tahun = asal?.year || year;
  const siriKini = asal?.siri || siri;
  // Satu bil meliputi beberapa program. Nama program hanya diperlukan untuk
  // menyelesaikan akaun bayaran skop sekolah — mana-mana program dalam siri
  // ini menyelesaikan kepada akaun yang sama.
  // Keutamaan: bil sebenar → maklumat bil yang disambung semula → senarai
  // yang dihantar oleh papan pemuka → penapis program.
  const senaraiProgram = bil?.pecahan?.length
    ? bil.pecahan.map(p => p.program)
    : (asal?.programs?.length ? asal.programs
      : (programs?.length ? programs : (badgeName ? [badgeName] : [])));
  // Akaun gateway diselesaikan mengikut skop program; mana-mana program dalam
  // siri ini menyelesaikan kepada akaun yang sama.
  const namaProgram = senaraiProgram[0] || '';

  useEffect(() => {
    if (!namaProgram) return;   // menunggu maklumat bayaran dimuatkan
    getArahanBayaranManual(namaProgram, tahun).then(setArahan);
  }, [namaProgram, tahun]);

  // Sambung semula selepas kembali dari gateway: semak status sebelum
  // memaparkan apa-apa, supaya sekolah tidak melihat "belum bayar" sedangkan
  // duit sudah keluar.
  useEffect(() => {
    if (!paymentIdSediaAda) return;
    setSibuk(true);
    semakStatusBayaran(paymentIdSediaAda)
      .then(setStatus)
      .catch((e) => setRalat(e.message))
      .finally(() => setSibuk(false));
  }, [paymentIdSediaAda]);

  const pilihKaedah = async (k: KaedahBayaran) => {
    setKaedah(k);
    setRalat('');
    setSibuk(true);
    try {
      const hasil = await janaBil({ year: tahun, siri: siriKini, method: k });
      if (hasil.skipped) { setDilangkauPenuh(hasil); return; }
      setBil(hasil);
      if (k === 'toyyibpay' && hasil.billUrl) {
        // Ke gateway. Bila sekolah kembali, App membuka semula skrin ini
        // dengan paymentIdSediaAda dan status disemak serta-merta.
        window.location.href = hasil.billUrl;
      }
    } catch (e: any) {
      setRalat(e.message);
      setKaedah(null);
    } finally {
      setSibuk(false);
    }
  };

  const hantarBukti = async () => {
    if (!bil || !rujukan.trim()) { setRalat('Sila isi no. rujukan bayaran.'); return; }
    setRalat('');
    setMemuatNaik(true);
    try {
      const bukti = fail ? await muatNaikBukti(bil.paymentId, fail) : undefined;
      const hasil = await hantarBuktiBayaran({
        paymentId: bil.paymentId,
        referenceNumber: rujukan.trim(),
        method: kaedah === 'cheque' ? 'cheque' : 'bank_transfer',
        bukti,
      });
      setStatus(hasil);
    } catch (e: any) {
      setRalat(e.message);
    } finally {
      setMemuatNaik(false);
    }
  };

  // ── Dihantar tanpa bayaran ──────────────────────────────────────────
  if (dilangkauPenuh) {
    return (
      <Bingkai onTutup={onTutup} tajuk="Pendaftaran Dihantar">
        <div className="rounded-xl p-4 border bg-blue-50 border-blue-300">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={22} className="text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-blue-800">Tiada bayaran diperlukan</p>
              <p className="text-sm text-slate-600 mt-1">
                {dilangkauPenuh.message || 'Pendaftaran anda terus dihantar untuk pengesahan.'}
              </p>
            </div>
          </div>
        </div>

        {dilangkauPenuh.sudahDibayar && dilangkauPenuh.sudahDibayar.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 mt-3">
            <p className="text-[11px] font-bold text-slate-700 mb-1">Sudah dibayar sebelum ini:</p>
            <ul className="text-[11px] text-slate-600 space-y-0.5">
              {dilangkauPenuh.sudahDibayar.map((d) => (
                <li key={d.program}>· <strong>{d.program}</strong> — {d.dibayarUntuk} orang</li>
              ))}
            </ul>
          </div>
        )}

        {dilangkauPenuh.dilangkau && dilangkauPenuh.dilangkau.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-3">
            <p className="text-[11px] font-bold text-amber-800 mb-1">Tidak dihantar:</p>
            <ul className="text-[11px] text-amber-700 space-y-0.5">
              {dilangkauPenuh.dilangkau.map((d) => (
                <li key={d.program}>· <strong>{d.program}</strong> — {d.sebab}</li>
              ))}
            </ul>
          </div>
        )}

        <button onClick={onSelesai}
          className="w-full mt-4 py-2.5 rounded-lg font-bold text-white bg-slate-800 hover:bg-slate-900 transition">
          Selesai
        </button>
      </Bingkai>
    );
  }

  // ── Keadaan akhir ───────────────────────────────────────────────────
  if (status && ['paid', 'pending_review'].includes(status.paymentStatus)) {
    const takdaTempat = status.seatStatus === 'no_seat';
    return (
      <Bingkai onTutup={onTutup} tajuk="Status Bayaran">
        <div className={`rounded-xl p-4 border ${takdaTempat ? 'bg-amber-50 border-amber-300' : 'bg-green-50 border-green-300'}`}>
          <div className="flex items-start gap-3">
            {takdaTempat
              ? <AlertTriangle size={22} className="text-amber-600 shrink-0 mt-0.5" />
              : <CheckCircle2 size={22} className="text-green-600 shrink-0 mt-0.5" />}
            <div>
              <p className={`font-bold ${takdaTempat ? 'text-amber-800' : 'text-green-800'}`}>
                {status.paymentStatus === 'paid' ? 'Bayaran diterima' : 'Bukti dihantar'}
              </p>
              <p className="text-sm text-slate-600 mt-1">
                {status.message || (status.paymentStatus === 'pending_review'
                  ? 'Menunggu semakan admin.'
                  : 'Pendaftaran anda menunggu pengesahan admin.')}
              </p>
            </div>
          </div>
        </div>
        {/* Resit hanya untuk bayaran yang SUDAH disahkan. Bukti yang masih
            menunggu semakan belum boleh diresitkan — admin mungkin menolaknya. */}
        {status.paymentStatus === 'paid' && (
          <button
            onClick={async () => {
              // Setiap cabang mesti berakhir dengan sesuatu yang kelihatan.
              // Versi terdahulu membiarkan ralat penjanaan PDF menjadi janji
              // yang ditolak tanpa dilihat sesiapa — butang kelihatan rosak.
              const id = paymentIdSediaAda || bil?.paymentId;
              if (!id) { setRalat('Bayaran ini belum mempunyai rujukan. Muat semula halaman.'); return; }
              setRalat('');
              setMenjanaResit(true);
              try {
                const data = await getDataResit(id);
                if (!data) { setRalat('Data resit tidak dijumpai untuk bayaran ini.'); return; }
                muatTurunResit(data);
              } catch (e: any) {
                console.error('resit gagal:', e);
                setRalat(`Gagal menjana resit: ${e?.message || 'ralat tidak diketahui'}`);
              } finally {
                setMenjanaResit(false);
              }
            }}
            disabled={menjanaResit}
            className="w-full mt-4 py-2.5 rounded-lg font-bold text-emerald-700 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {menjanaResit ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {menjanaResit ? 'Menjana resit…' : 'Muat Turun Resit (PDF)'}
          </button>
        )}
        <button onClick={takdaTempat ? onTutup : onSelesai}
          className="w-full mt-2 py-2.5 rounded-lg font-bold text-white bg-slate-800 hover:bg-slate-900 transition">
          Selesai
        </button>
      </Bingkai>
    );
  }

  return (
    <Bingkai onTutup={onTutup} tajuk="Bayaran Pendaftaran">
      <div className="bg-slate-50 rounded-lg p-3 mb-4 text-sm">
        <p className="font-bold text-slate-800">Siri {siriKini} · Tahun {tahun}</p>
        <p className="text-slate-500 text-xs mt-0.5">
          {senaraiProgram.length > 0 ? senaraiProgram.join(' · ') : '—'}
        </p>
      </div>

      <p className="text-xs text-slate-500 mb-3">
        Pendaftaran anda <strong>belum dihantar</strong>. Ia akan masuk giliran pengesahan
        admin selepas bayaran diuruskan.
      </p>

      {ralat && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold p-2.5 rounded-lg mb-3">
          {ralat}
        </div>
      )}

      {/* Pecahan mengikut program. Satu bil merangkumi seluruh siri, jadi
          sekolah mesti nampak apa yang mereka bayar sebelum membayar —
          jumlah tunggal tidak boleh disemak terhadap senarai peserta. */}
      {bil?.pecahan && bil.pecahan.length > 0 && (
        <div className="border border-slate-200 rounded-lg overflow-hidden mb-3">
          {bil.pecahan.map((p) => (
            <div key={p.program} className="flex items-baseline justify-between gap-2 px-3 py-2 border-b border-slate-100 last:border-b-0">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{p.program}</p>
                <p className="text-[11px] text-slate-500">
                  {[p.peserta && `${p.peserta} peserta`, p.pemimpin && `${p.pemimpin} pemimpin`,
                    p.penolong && `${p.penolong} pen. pemimpin`].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className="text-sm font-bold text-slate-700 shrink-0">{formatRM(p.amount)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-3 py-2 bg-emerald-50">
            <span className="text-xs font-bold text-emerald-800 uppercase">Jumlah</span>
            <span className="text-base font-bold text-emerald-800">{formatRM(bil.totalAmount)}</span>
          </div>
        </div>
      )}

      {/* Program yang sudah dijelaskan dalam bil terdahulu. Ia dilangkau
          supaya sekolah tidak dibil dua kali — tetapi tanpa disebut, program
          yang hilang dari senarai kelihatan seperti sistem tersilap kira. */}
      {bil?.sudahDibayar && bil.sudahDibayar.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 mb-3">
          <p className="text-[11px] font-bold text-slate-700 mb-1">Sudah dibayar sebelum ini:</p>
          <ul className="text-[11px] text-slate-600 space-y-0.5">
            {bil.sudahDibayar.map((d) => (
              <li key={d.program}>
                · <strong>{d.program}</strong>
                {d.kini > d.dibayarUntuk ? (
                  <span className="text-amber-700">
                    {' '}— dibayar untuk {d.dibayarUntuk} orang, kini {d.kini}.
                    Hubungi admin untuk {d.kini - d.dibayarUntuk} orang tambahan.
                  </span>
                ) : ` — ${d.dibayarUntuk} orang`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Program yang tidak masuk ke dalam bil dinamakan berserta sebabnya.
          Sekolah yang mendaftar dua program dan nampak satu sahaja dibil akan
          menganggap sistem tersilap kira. */}
      {bil?.dilangkau && bil.dilangkau.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3">
          <p className="text-[11px] font-bold text-amber-800 mb-1">Tidak termasuk dalam bil ini:</p>
          <ul className="text-[11px] text-amber-700 space-y-0.5">
            {bil.dilangkau.map((d) => (
              <li key={d.program}>· <strong>{d.program}</strong> — {d.sebab}</li>
            ))}
          </ul>
          <p className="text-[10px] text-amber-600 mt-1.5">
            Program ini kekal draf dan boleh dibayar kemudian.
          </p>
        </div>
      )}

      {/* Pemilihan kaedah */}
      {!bil && (
        <div className="space-y-2">
          {arahan.adaOnline && (
            <Pilihan
              ikon={<CreditCard size={18} />}
              tajuk="Bayar Online (FPX)"
              nota="Terus melalui ToyyibPay. Caj perkhidmatan dikenakan oleh bank."
              sibuk={sibuk && kaedah === 'toyyibpay'}
              onClick={() => pilihKaedah('toyyibpay')}
            />
          )}
          {arahan.adaPindahan && (
            <Pilihan
              ikon={<Landmark size={18} />}
              tajuk="Pindahan Bank"
              nota="Bayar di luar sistem, kemudian muat naik resit."
              sibuk={sibuk && kaedah === 'bank_transfer'}
              onClick={() => pilihKaedah('bank_transfer')}
            />
          )}
          {arahan.adaCek && (
            <Pilihan
              ikon={<FileCheck2 size={18} />}
              tajuk="Cek"
              nota="Rekod no. cek dan muat naik gambar cek."
              sibuk={sibuk && kaedah === 'cheque'}
              onClick={() => pilihKaedah('cheque')}
            />
          )}
          {/* Skrin tanpa satu pun pilihan ialah jalan buntu. Ia mesti
              menamakan sebabnya, bukan sekadar kosong. */}
          {!arahan.adaOnline && !arahan.adaPindahan && !arahan.adaCek ? (
            <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
              Tiada kaedah bayaran dibuka untuk daerah anda buat masa ini. Sila hubungi admin.
            </p>
          ) : !arahan.adaOnline && (
            <p className="text-[11px] text-slate-400 pt-1">
              Bayaran online tidak tersedia untuk daerah anda. Gunakan kaedah di atas.
            </p>
          )}
        </div>
      )}

      {/* Borang bukti manual */}
      {bil && kaedah !== 'toyyibpay' && (
        <div className="space-y-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <p className="text-xs text-emerald-700 font-semibold">Jumlah perlu dibayar</p>
            <p className="text-2xl font-extrabold text-emerald-800">{formatRM(bil.totalAmount)}</p>
          </div>

          {arahan.bankAccountInfo ? (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Arahan Bayaran</p>
              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans">{arahan.bankAccountInfo}</pre>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              Maklumat akaun bank belum ditetapkan oleh admin daerah. Hubungi mereka sebelum membuat bayaran.
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              {kaedah === 'cheque' ? 'No. Cek' : 'No. Rujukan Transaksi'}
            </label>
            <input
              value={rujukan}
              onChange={(e) => setRujukan(e.target.value)}
              placeholder={kaedah === 'cheque' ? 'Cth: 123456' : 'Cth: TRX20260809001'}
              className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-400 outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Bukti Bayaran <span className="text-slate-400 font-normal">(gambar atau PDF, maks 10MB)</span>
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              onChange={(e) => setFail(e.target.files?.[0] || null)}
              className="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:font-semibold"
            />
          </div>

          <button
            onClick={hantarBukti}
            disabled={memuatNaik || !rujukan.trim()}
            className="w-full py-2.5 rounded-lg font-bold text-white flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 transition"
          >
            {memuatNaik ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {memuatNaik ? 'Menghantar…' : 'Hantar Bukti Bayaran'}
          </button>
        </div>
      )}

      {/* Menunggu redirect ke gateway */}
      {bil && kaedah === 'toyyibpay' && (
        <div className="text-center py-6">
          <Loader2 size={28} className="animate-spin text-emerald-600 mx-auto mb-3" />
          <p className="text-sm text-slate-600">Mengalihkan ke ToyyibPay…</p>
          {bil.billUrl && (
            <a href={bil.billUrl} className="text-xs text-blue-600 underline inline-flex items-center gap-1 mt-2">
              Buka manual <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}

      {status?.gatewayPending && (
        <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 flex gap-2">
          <Clock size={14} className="shrink-0 mt-0.5" />
          <span>
            Bank masih memproses bayaran anda. Ini boleh mengambil sehingga 30 minit.
            Jangan bayar sekali lagi — status akan dikemas kini secara automatik.
          </span>
        </div>
      )}
    </Bingkai>
  );
};

const Bingkai: React.FC<{ tajuk: string; onTutup: () => void; children: React.ReactNode }> =
  ({ tajuk, onTutup, children }) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="bg-emerald-700 text-white px-4 py-3 flex items-center justify-between sticky top-0">
          <h2 className="font-bold flex items-center gap-2"><CreditCard size={18} /> {tajuk}</h2>
          <button onClick={onTutup} className="hover:bg-white/20 rounded p-1 transition"><X size={18} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );

const Pilihan: React.FC<{
  ikon: React.ReactNode; tajuk: string; nota: string; sibuk: boolean; onClick: () => void;
}> = ({ ikon, tajuk, nota, sibuk, onClick }) => (
  <button
    onClick={onClick}
    disabled={sibuk}
    className="w-full text-left border border-slate-200 rounded-xl p-3 hover:border-emerald-400 hover:bg-emerald-50/50 transition disabled:opacity-50 flex items-start gap-3"
  >
    <span className="text-emerald-600 mt-0.5">{sibuk ? <Loader2 size={18} className="animate-spin" /> : ikon}</span>
    <span>
      <span className="block font-bold text-slate-800 text-sm">{tajuk}</span>
      <span className="block text-[11px] text-slate-500 mt-0.5">{nota}</span>
    </span>
  </button>
);
