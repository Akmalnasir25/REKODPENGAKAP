import React, { useState, useEffect, useMemo } from 'react';
import { BarChart3, RefreshCw, CheckCircle, AlertTriangle, Clock, Trash2 } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';
import type { Badge } from '../../types';

/**
 * STATISTIK KEHADIRAN — SIRI DAHULU, KEMUDIAN PROGRAM
 *
 * Rujuk docs/rancangan-statistik-kehadiran-aliran-siri.md.
 *
 * Di meja pendaftaran, yang diketahui dahulu ialah "hari ini Siri 2".
 * Program ialah pecahan di dalamnya. Skrin lama menyongsangkan susunan itu:
 * program dipilih dahulu dan siri menjadi penapis kecil di bawahnya, jadi
 * "berapa sekolah Siri 2 belum sampai?" hanya boleh dijawab dengan
 * memeriksa setiap program satu per satu dan menjumlahkannya sendiri.
 *
 * Satu imbasan QR v4 mengesahkan SEMUA program sekolah itu dalam satu siri
 * (migrasi 066). Paparan mengikutinya: mod "Semua Program" ialah pilihan
 * lalai, dan sekolah yang baru sebahagian programnya disahkan mempunyai
 * kumpulannya sendiri — bukan disembunyikan dalam "sudah" atau "belum".
 *
 * Komponen ini dikongsi oleh Panel Daerah dan Panel Negeri. Sebelum ini
 * logiknya wujud dua kali dan setiap pepijat perlu dibetulkan dua kali.
 */

interface StatistikKehadiranProgramProps {
  /**
   * Senarai program PENUH bagi tahun semasa — bukan yang ditapis mengikut
   * skop badge. Skop admin dikuatkuasakan oleh daerahCode/negeriCode di
   * bawah, yang menapis SEKOLAH; menapis PROGRAM pula menyembunyikan
   * imbasan yang sah kerana QR v4 merekod setiap program sekolah itu
   * tanpa mengira skop badge (PASANG-066).
   *
   * Ditaip `Badge[]` dengan sengaja: versi `any[]` menyembunyikan fakta
   * bahawa objek yang dihantar langsung tiada `id`, jadi `badgeIds` kosong
   * dan seluruh senarai statistik kekal kosong tanpa sebarang ralat.
   */
  badges: Badge[];
  /** Rekod attendance_verifications bagi skop ini, tahun semasa, SEMUA program. */
  records: any[];
  loading: boolean;
  onRefresh: () => void;
  daerahCode?: string;
  negeriCode?: string;
  /** Panel Negeri memaparkan kod daerah pada setiap baris sekolah. */
  tunjukDaerah?: boolean;
  /**
   * Padam pengesahan kehadiran bagi satu sekolah + program + siri.
   *
   * Menerima SEMUA id bagi kunci itu, bukan satu: imbasan berganda pernah
   * mencipta lebih daripada satu baris, dan memadam sebahagian sahaja akan
   * mengekalkan lencana hijau selepas mesej "berjaya dipadam".
   *
   * Opsyenal — tanpa ia, lencana kekal label statik dan tidak boleh ditekan.
   */
  onPadam?: (rekodIds: string[], keterangan: string) => Promise<void> | void;
}

type JenisSekolah = '' | 'rendah' | 'menengah';

interface ProgramSekolah {
  id: string;
  nama: string;
  sah: boolean;
  peserta: number;
  /** Baris attendance_verifications di sebalik lencana ini. */
  rekodIds: string[];
}

interface BarisSekolah {
  kod: string;
  nama: string;
  daerah: string;
  program: ProgramSekolah[];
  jumlahSah: number;
  peserta: number;
}

export const StatistikKehadiranProgram: React.FC<StatistikKehadiranProgramProps> = ({
  badges, records, loading, onRefresh, daerahCode, negeriCode, tunjukDaerah = false, onPadam,
}) => {
  const [pendaftaran, setPendaftaran] = useState<any[]>([]);
  const [memuatPendaftaran, setMemuatPendaftaran] = useState(false);
  const [muatSemula, setMuatSemula] = useState(0);
  const [siri, setSiri] = useState<number | null>(null);
  // '' bermakna SEMUA program dalam siri itu, bukan "belum pilih".
  const [badgeId, setBadgeId] = useState('');
  const [jenis, setJenis] = useState<JenisSekolah>('');
  // Kunci lencana yang sedang dipadam — menghalang tekan dua kali daripada
  // menghantar dua permintaan padam bagi baris yang sama.
  const [padamKunci, setPadamKunci] = useState<string | null>(null);

  const badgeIds = useMemo(
    () => badges.map(b => b.id).filter((id): id is string => !!id),
    [badges],
  );
  const kunciBadge = badgeIds.join(',');
  const namaBadge = useMemo(() => {
    const map = new Map<string, string>();
    badges.forEach(b => { if (b.id) map.set(b.id, b.name); });
    return map;
  }, [badges]);

  // Kegagalan senyap yang pernah berlaku: ada program, tiada satu pun `id`,
  // jadi skrin melaporkan "tiada sekolah diluluskan" sedangkan imbasan
  // sebenarnya berjaya. Biar ia bersuara di konsol.
  useEffect(() => {
    if (badges.length > 0 && badgeIds.length === 0) {
      console.error('Statistik kehadiran: senarai program tiada `id` — statistik tidak dapat dibina.');
    }
  }, [badges.length, badgeIds.length]);

  // Satu pertanyaan bagi seluruh skop, bukan satu bagi setiap program.
  // Hasilnya melakukan tiga kerja: ia penyebut, ia senarai program bagi
  // setiap siri, dan ia membawa jenis sekolah untuk penapis SR/SM.
  useEffect(() => {
    if (badgeIds.length === 0) { setPendaftaran([]); return; }
    let batal = false;
    (async () => {
      setMemuatPendaftaran(true);
      try {
        const { supabase } = await import('../../services/supabaseClient');
        const { data, error } = await supabase
          .from('school_badge_status')
          .select('badge_id, siri, school:school_id(id, name, school_code, school_type, negeri:negeri_id(code), daerah:daerah_id(code))')
          .eq('year', new Date().getFullYear())
          // 'approved' sahaja — sama seperti apa yang imbasan QR sanggup
          // rekod (migrasi 066).
          .eq('status', 'approved')
          .in('badge_id', badgeIds);
        if (error) throw error;
        const dalamSkop = (data || []).filter((r: any) => (
          daerahCode ? r.school?.daerah?.code === daerahCode
            : negeriCode ? r.school?.negeri?.code === negeriCode
              : true
        ));
        if (!batal) setPendaftaran(dalamSkop);
      } catch (e) {
        console.error('Gagal memuat pendaftaran kehadiran:', e);
        if (!batal) setPendaftaran([]);
      } finally {
        if (!batal) setMemuatPendaftaran(false);
      }
    })();
    return () => { batal = true; };
  }, [kunciBadge, daerahCode, negeriCode, muatSemula]);

  // Siri yang benar-benar wujud: daripada pendaftaran diluluskan, digabung
  // dengan siri yang sudah ada rekod imbasan.
  const siriAda = useMemo(() => {
    const set = new Set<number>();
    pendaftaran.forEach((r: any) => set.add(r.siri || 1));
    records.forEach((r: any) => set.add(r.siri || 1));
    return Array.from(set).sort((a, b) => a - b);
  }, [pendaftaran, records]);

  // Siri lalai ialah siri imbasan TERBARU — rekod tiba disusun mengikut
  // verified_at menurun, jadi yang pertama ialah imbasan terkini. Semasa
  // perkhemahan berjalan, itulah siri yang sedang di hadapan mata petugas.
  // Sebelum sebarang imbasan, jatuh balik kepada siri tertinggi yang ada
  // pendaftaran, kerana siri bergerak ke hadapan dan bukan ke belakang.
  const siriLalai = useMemo(() => {
    if (siriAda.length === 0) return null;
    const terkini = records.find((r: any) => siriAda.includes(r.siri || 1));
    return terkini ? (terkini.siri || 1) : siriAda[siriAda.length - 1];
  }, [records, siriAda]);

  // Siri dipilih sendiri. Program bergantung padanya, jadi membiarkannya
  // kosong bermakna skrin kosong tanpa sebab.
  useEffect(() => {
    if (siriAda.length === 0) { if (siri !== null) setSiri(null); return; }
    if (siri === null || !siriAda.includes(siri)) setSiri(siriLalai);
  }, [siriAda, siri, siriLalai]);

  // Program yang ada dalam siri dipilih sahaja.
  const programSiri = useMemo<Badge[]>(() => {
    if (siri === null) return [];
    const ids = new Set(pendaftaran.filter((r: any) => (r.siri || 1) === siri).map((r: any) => r.badge_id));
    return badges.filter(b => !!b.id && ids.has(b.id));
  }, [pendaftaran, siri, badges]);

  // Pilihan program yang tiada dalam siri baharu tidak boleh dibiarkan
  // hidup di belakang tabir; ia akan menapis semuanya keluar sedangkan
  // dropdown sudah tidak memaparkannya.
  useEffect(() => {
    if (badgeId && !programSiri.some(b => b.id === badgeId)) setBadgeId('');
  }, [programSiri, badgeId]);

  const sekolah = useMemo((): BarisSekolah[] => {
    if (siri === null) return [];

    const rekod = records.filter((r: any) => (
      (r.siri || 1) === siri && (!badgeId || r.badge_id === badgeId)
    ));
    // Kunci ialah sekolah + program: satu sekolah boleh mempunyai beberapa
    // program dalam siri yang sama, dan setiap satunya disahkan sendiri.
    //
    // Rekod penuh disimpan dan bukan hanya jumlahnya, kerana lencana hijau
    // kini boleh dipadam dan padam memerlukan id barisnya.
    const rekodIkutKunci = new Map<string, any[]>();
    rekod.forEach((r: any) => {
      const kod = r.school?.school_code;
      if (!kod) return;
      const kunci = `${kod}|${r.badge_id}`;
      const senarai = rekodIkutKunci.get(kunci);
      if (senarai) senarai.push(r);
      else rekodIkutKunci.set(kunci, [r]);
    });

    const baris = pendaftaran.filter((r: any) => (
      (r.siri || 1) === siri
      && (!badgeId || r.badge_id === badgeId)
      && (!jenis || (r.school?.school_type || 'lain') === jenis)
    ));

    const map = new Map<string, BarisSekolah>();
    baris.forEach((r: any) => {
      const kod = r.school?.school_code;
      if (!kod) return;
      const sedia = map.get(kod) || {
        kod,
        nama: r.school?.name || kod,
        daerah: r.school?.daerah?.code || '-',
        program: [],
        jumlahSah: 0,
        peserta: 0,
      };
      if (!sedia.program.some(p => p.id === r.badge_id)) {
        const rekodKunci = rekodIkutKunci.get(`${kod}|${r.badge_id}`);
        sedia.program.push({
          id: r.badge_id,
          nama: namaBadge.get(r.badge_id) || 'Program',
          sah: !!rekodKunci,
          peserta: (rekodKunci || []).reduce((n, x: any) => n + (x.participant_count || 0), 0),
          rekodIds: (rekodKunci || []).map((x: any) => x.id).filter(Boolean),
        });
      }
      map.set(kod, sedia);
    });

    return Array.from(map.values()).map(s => {
      s.program.sort((a, b) => a.nama.localeCompare(b.nama));
      s.jumlahSah = s.program.filter(p => p.sah).length;
      s.peserta = s.program.reduce((n, p) => n + p.peserta, 0);
      return s;
    }).sort((a, b) => a.nama.localeCompare(b.nama));
  }, [pendaftaran, records, siri, badgeId, jenis, namaBadge]);

  // Tiga kumpulan. Sekolah yang menyertai dua program dan baru satu
  // disahkan tidak boleh dilaporkan sebagai "sudah" mahupun "belum" —
  // ia justru sekolah yang petugas perlu kejar.
  const penuh = useMemo(() => sekolah.filter(s => s.program.length > 0 && s.jumlahSah === s.program.length), [sekolah]);
  const sebahagian = useMemo(() => sekolah.filter(s => s.jumlahSah > 0 && s.jumlahSah < s.program.length), [sekolah]);
  const belum = useMemo(() => sekolah.filter(s => s.jumlahSah === 0), [sekolah]);
  const jumlahPeserta = useMemo(() => sekolah.reduce((n, s) => n + s.peserta, 0), [sekolah]);
  const peratus = sekolah.length > 0 ? Math.round((penuh.length / sekolah.length) * 100) : 0;

  const sedangMuat = loading || memuatPendaftaran;

  const kiraJenis = useMemo(() => {
    if (siri === null) return { rendah: 0, menengah: 0 };
    const kodRendah = new Set<string>();
    const kodMenengah = new Set<string>();
    pendaftaran.forEach((r: any) => {
      if ((r.siri || 1) !== siri) return;
      if (badgeId && r.badge_id !== badgeId) return;
      const kod = r.school?.school_code;
      if (!kod) return;
      if (r.school?.school_type === 'rendah') kodRendah.add(kod);
      if (r.school?.school_type === 'menengah') kodMenengah.add(kod);
    });
    return { rendah: kodRendah.size, menengah: kodMenengah.size };
  }, [pendaftaran, siri, badgeId]);

  const butangJenis: { nilai: JenisSekolah; label: string }[] = [
    { nilai: '', label: 'Semua' },
    { nilai: 'rendah', label: `SR (${kiraJenis.rendah})` },
    { nilai: 'menengah', label: `SM (${kiraJenis.menengah})` },
  ];

  // Silap imbas dijumpai di sini — "kenapa sekolah ini hijau, ia belum
  // sampai pun" — jadi di sini juga ia ditarik balik. Skop padam ialah satu
  // lencana: sekolah + program + siri yang sedang dipilih, supaya program
  // lain sekolah itu yang memang betul tidak perlu diimbas semula.
  const padamLencana = async (s: BarisSekolah, p: ProgramSekolah) => {
    if (!onPadam || p.rekodIds.length === 0) return;
    const kunci = `${s.kod}|${p.id}`;
    setPadamKunci(kunci);
    try {
      await onPadam(p.rekodIds, `${s.nama} — ${p.nama}${siri !== null ? ` (Siri ${siri})` : ''}`);
    } finally {
      setPadamKunci(null);
    }
  };

  const senaraiSekolah = (senarai: BarisSekolah[], warna: 'hijau' | 'kuning' | 'jingga') => {
    const gaya = warna === 'hijau'
      ? 'bg-green-50 border-green-100'
      : warna === 'kuning' ? 'bg-amber-50 border-amber-100' : 'bg-orange-50 border-orange-100';
    return (
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {senarai.map(s => (
          <div key={s.kod} className={`flex items-start justify-between gap-3 border rounded-lg px-4 py-2 ${gaya}`}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate">{s.nama}</p>
              <p className="text-[10px] text-slate-500">
                <span className="font-mono">{s.kod}</span>
                {tunjukDaerah && <> · {s.daerah}</>}
                {s.peserta > 0 && <> · <span className="text-green-700 font-bold">{s.peserta} peserta</span></>}
              </p>
              <div className="flex flex-wrap gap-1 mt-1">
                {s.program.map(p => {
                  const gayaLencana = `text-[9px] px-1.5 py-0.5 rounded-full font-bold ${p.sah
                    ? 'bg-green-100 text-green-700'
                    : 'bg-slate-100 text-slate-400'}`;
                  // Lencana kelabu bermakna belum disahkan — tiada apa untuk
                  // ditarik balik, jadi ia kekal label dan bukan butang.
                  if (!onPadam || !p.sah || p.rekodIds.length === 0) {
                    return <span key={p.id} className={gayaLencana}>{p.sah ? '✓ ' : ''}{p.nama}</span>;
                  }
                  const sedangPadam = padamKunci === `${s.kod}|${p.id}`;
                  return (
                    <button
                      key={p.id}
                      onClick={() => padamLencana(s, p)}
                      disabled={sedangPadam}
                      title={`Padam pengesahan kehadiran — ${p.nama}`}
                      className={`${gayaLencana} inline-flex items-center gap-1 hover:bg-red-100 hover:text-red-700 transition disabled:opacity-50`}
                    >
                      {sedangPadam ? '⋯' : '✓'} {p.nama}
                      <Trash2 size={9} />
                    </button>
                  );
                })}
              </div>
            </div>
            <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">
              {s.jumlahSah}/{s.program.length}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <BarChart3 size={18} className="text-indigo-600" /> Statistik Kehadiran Mengikut Program
        </h3>
        <button
          onClick={() => { onRefresh(); setMuatSemula(n => n + 1); }}
          disabled={sedangMuat}
          className="text-blue-600 hover:bg-blue-50 p-2 rounded-full transition"
        >
          <RefreshCw size={14} className={sedangMuat ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Kawalan: siri → program → jenis sekolah */}
      <div className="space-y-3 mb-6">
        {siriAda.length > 1 && (
          <div>
            <label className="block text-xs font-bold text-purple-600 uppercase mb-1">Siri</label>
            <div className="flex flex-wrap gap-2">
              {siriAda.map(s => (
                <button
                  key={s}
                  onClick={() => setSiri(s)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold border transition ${siri === s
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-50'}`}
                >
                  Siri {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Program</label>
          <select
            value={badgeId}
            onChange={(e) => setBadgeId(e.target.value)}
            className="w-full p-3 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">Semua Program ({programSiri.length})</option>
            {programSiri.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Jenis Sekolah</label>
          <div className="flex flex-wrap gap-2">
            {butangJenis.map(j => (
              <button
                key={j.nilai || 'semua'}
                onClick={() => setJenis(j.nilai)}
                className={`px-4 py-2 rounded-lg text-xs font-bold border transition ${jenis === j.nilai
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
              >
                {j.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {sedangMuat && sekolah.length === 0 ? (
        <div className="text-center py-8">
          <LoadingSpinner size="lg" color="border-indigo-500" />
          <p className="text-xs text-slate-400 mt-3">Memuatkan statistik...</p>
        </div>
      ) : siri === null ? (
        <div className="text-center py-12">
          <BarChart3 size={48} className="mx-auto text-slate-200 mb-3" />
          <p className="text-sm text-slate-400">Tiada pendaftaran diluluskan lagi untuk tahun ini.</p>
        </div>
      ) : sekolah.length === 0 ? (
        <div className="text-center py-12">
          <BarChart3 size={48} className="mx-auto text-slate-200 mb-3" />
          <p className="text-sm text-slate-400">
            Tiada sekolah diluluskan bagi tapisan ini{jenis ? ` (${jenis === 'rendah' ? 'SR' : 'SM'})` : ''}.
          </p>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-green-50 rounded-lg p-4 text-center border border-green-100">
              <p className="text-2xl font-bold text-green-700">{penuh.length}</p>
              <p className="text-xs text-green-600 font-medium">Dah Scan Penuh</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-4 text-center border border-amber-100">
              <p className="text-2xl font-bold text-amber-700">{sebahagian.length}</p>
              <p className="text-xs text-amber-600 font-medium">Sebahagian</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-4 text-center border border-orange-100">
              <p className="text-2xl font-bold text-orange-700">{belum.length}</p>
              <p className="text-xs text-orange-600 font-medium">Belum Scan</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 text-center border border-blue-100">
              <p className="text-2xl font-bold text-blue-700">{jumlahPeserta}</p>
              <p className="text-xs text-blue-600 font-medium">Jumlah Peserta</p>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex justify-between text-xs text-slate-600 mb-1">
              <span>
                Kemajuan Scan ({penuh.length} / {sekolah.length} Sekolah
                {siri !== null && siriAda.length > 1 ? ` · Siri ${siri}` : ''})
              </span>
              <span className="font-bold">{peratus}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-green-500 to-indigo-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${peratus}%` }}
              />
            </div>
          </div>

          <div className="mb-6">
            <h4 className="text-xs font-bold text-slate-700 uppercase mb-3 flex items-center gap-2">
              <CheckCircle size={12} className="text-green-500" /> Dah Scan Penuh ({penuh.length})
            </h4>
            {penuh.length === 0
              ? <p className="text-xs text-slate-400 italic p-4 bg-slate-50 rounded">Belum ada sekolah yang lengkap semua programnya.</p>
              : senaraiSekolah(penuh, 'hijau')}
          </div>

          {sebahagian.length > 0 && (
            <div className="mb-6">
              <h4 className="text-xs font-bold text-slate-700 uppercase mb-3 flex items-center gap-2">
                <Clock size={12} className="text-amber-500" /> Sebahagian Sahaja ({sebahagian.length})
              </h4>
              {senaraiSekolah(sebahagian, 'kuning')}
            </div>
          )}

          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase mb-3 flex items-center gap-2">
              <AlertTriangle size={12} className="text-orange-500" /> Belum Scan ({belum.length})
            </h4>
            {belum.length === 0
              ? <p className="text-xs text-green-600 italic p-4 bg-green-50 rounded border border-green-100 font-bold">🎉 Semua sekolah telah scan kehadiran!</p>
              : senaraiSekolah(belum, 'jingga')}
          </div>
        </div>
      )}
    </div>
  );
};
