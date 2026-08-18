import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Grid3x3, RefreshCw, Download, AlertTriangle, Users, RotateCcw } from 'lucide-react';
import { Badge } from '../types';
import { LoadingSpinner } from './ui/LoadingSpinner';
import {
  labelStesen, bahagikanSekolah, ambilSekolahLayak,
  simpanJadual, ambilJadual, pindahSekolah, JadualStesen,
  ambilPengujiLayak, bahagikanPenguji, simpanPenguji, ambilPenguji,
  pindahPenguji, ambilNamaStesen, simpanNamaStesen, simpanProgramGabung,
  simpanKuotaPenguji, pilihPenguji, ambilRingkasanPenguji, kosongkanPenguji,
  RingkasanPenguji,
  PengujiLayak, PengujiStesen,
} from '../services/stationGroupService';
import { muatTurunPdfStesen, muatTurunPdfPenguji } from '../services/stationGroupPdf';

interface Props {
  badges: Badge[];
  daerahName?: string;
}

// Peserta dibahagikan mengikut SEKOLAH, bukan orang. Semua peserta satu
// sekolah duduk dalam stesen yang sama; satu stesen boleh memuatkan beberapa
// sekolah. Pangkalan data menguatkuasakannya melalui unique(run_id,school_id)
// — bukan kod ini. Rujuk docs/rancangan-kumpulan-stesen.md.
export const StationGroupsTab: React.FC<Props> = ({ badges, daerahName }) => {
  const tahunKini = new Date().getFullYear();
  const [badgeName, setBadgeName] = useState('');
  const [year, setYear] = useState(tahunKini);
  const [siri, setSiri] = useState(2);
  const [bilKumpulan, setBilKumpulan] = useState(12);

  const [jadual, setJadual] = useState<JadualStesen | null>(null);
  const [paparan, setPaparan] = useState<'peserta' | 'penguji'>('peserta');
  const [penguji, setPenguji] = useState<PengujiStesen[]>([]);
  const [pengujiLayak, setPengujiLayak] = useState<PengujiLayak[]>([]);
  const [namaStesen, setNamaStesen] = useState<Record<string, string>>({});
  // Program TAMBAHAN yang pengujinya dikumpulkan bersama program ini.
  const [gabung, setGabung] = useState<string[]>([]);
  // Berapa penguji program ini perlukan daripada kolam. '' = belum
  // ditetapkan, iaitu ambil semua yang ada.
  const [kuota, setKuota] = useState<number | ''>('');
  // Status pengagihan SEMUA program siri ini, bukan hanya yang dibuka.
  const [ringkasan, setRingkasan] = useState<RingkasanPenguji[]>([]);
  const [memuat, setMemuat] = useState(false);
  const [menjana, setMenjana] = useState(false);
  const [ralat, setRalat] = useState('');

  const namaBadge = useMemo(
    () => badges.map(b => b.name).filter(Boolean).sort(),
    [badges]);

  useEffect(() => { if (!badgeName && namaBadge.length) setBadgeName(namaBadge[0]); },
    [namaBadge, badgeName]);

  const muat = useCallback(async () => {
    if (!badgeName) return;
    setMemuat(true); setRalat('');
    try {
      const j = await ambilJadual(badgeName, year, siri);
      setJadual(j);
      setGabung(j?.programGabung || []);
      setKuota(j?.pengujiDiperlukan ?? '');
      if (j) {
        const [pg, nm] = await Promise.all([ambilPenguji(j.runId), ambilNamaStesen(j.runId)]);
        setPenguji(pg); setNamaStesen(nm);
      } else { setPenguji([]); setNamaStesen({}); }
      setRingkasan(await ambilRingkasanPenguji(year, siri));
    } catch (e: any) {
      setRalat(e.message || 'Gagal memuat jadual.');
      setJadual(null); setPenguji([]); setNamaStesen({});
    } finally { setMemuat(false); }
  }, [badgeName, year, siri]);

  useEffect(() => { muat(); }, [muat]);

  // Kolam dibaca semula setiap kali tandaan program berubah, supaya kiraan
  // yang dipaparkan sentiasa kolam yang sebenarnya akan diagihkan.
  const kunciGabung = gabung.join('|');
  useEffect(() => {
    if (!badgeName) { setPengujiLayak([]); return; }
    let dibatalkan = false;
    ambilPengujiLayak([badgeName, ...gabung], year, siri)
      .then(l => { if (!dibatalkan) setPengujiLayak(l); })
      .catch(() => { if (!dibatalkan) setPengujiLayak([]); });
    return () => { dibatalkan = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badgeName, year, siri, kunciGabung]);

  const jana = async () => {
    if (!badgeName) return;
    if (jadual && !confirm(
      `Jadual bagi ${badgeName} Siri ${siri} ${year} sudah wujud.\n\n`
      + 'Menjana semula MEMADAM jadual sedia ada, termasuk sebarang pelarasan '
      + 'manual yang kau buat. Senarai yang sudah dicetak akan menjadi lapuk.\n\nTeruskan?'
    )) return;

    setMenjana(true); setRalat('');
    try {
      const sekolah = await ambilSekolahLayak(badgeName, year, siri);
      if (sekolah.length === 0) {
        setRalat(`Tiada peserta diluluskan untuk ${badgeName} Siri ${siri} ${year}.`);
        return;
      }
      const bakul = bahagikanSekolah(sekolah, bilKumpulan);
      const label = labelStesen(bilKumpulan);
      const ikutId = new Map(sekolah.map(s => [s.schoolId, s]));

      const agihan = bakul.flatMap((ids, i) => ids.map(id => ({
        school_id: id,
        station_label: label[i],
        peserta: ikutId.get(id)?.peserta ?? 0,
      })));

      await simpanJadual(badgeName, year, siri, bilKumpulan, agihan);
      await muat();
    } catch (e: any) {
      setRalat(e.message || 'Gagal menjana kumpulan.');
    } finally { setMenjana(false); }
  };

  const janaPenguji = async () => {
    if (!jadual) return;
    setMenjana(true); setRalat('');
    try {
      const layak = await ambilPengujiLayak([badgeName, ...gabung], year, siri);
      setPengujiLayak(layak);
      // Yang sudah diambil oleh jadual program LAIN dikecualikan — kekangan
      // pangkalan data akan menolaknya, jadi lebih baik tidak mencuba.
      const boleh = layak.filter(p => !p.sudahDitempatkan || p.sudahDitempatkan === badgeName);
      if (boleh.length === 0) {
        setRalat('Tiada penguji yang boleh ditempatkan untuk program ini.');
        return;
      }
      // Kuota mengehadkan berapa yang diambil; selebihnya kekal dalam kolam
      // untuk program lain dalam siri ini.
      const dipilih = pilihPenguji(boleh, badgeName, kuota === '' ? null : kuota);
      const agih = bahagikanPenguji(dipilih, jadual.bilKumpulan);
      const ikutIc = new Map(dipilih.map(p => [p.personIc, p]));
      await simpanPenguji(jadual.runId, year, siri, agih.map(a => ({
        personIc: a.personIc,
        nama: ikutIc.get(a.personIc)?.nama || '-',
        sekolah: ikutIc.get(a.personIc)?.sekolah || '',
        stesen: a.stesen,
      })));
      await muat();
    } catch (e: any) {
      setRalat(e.message || 'Gagal menjana penguji.');
    } finally { setMenjana(false); }
  };

  // Menerima larian sebagai hujah supaya baris mana-mana program dalam
  // jadual status boleh direset, bukan hanya program yang sedang dibuka.
  const kosongkan = async (runId: string, nama: string, bil: number) => {
    if (!confirm(
      `Buang SEMUA ${bil} penguji daripada jadual ${nama} Siri ${siri}?

`
      + 'Mereka kembali ke kolam dan boleh diambil oleh program lain. Nama '
      + 'stesen yang kau taip TIDAK dipadam.'
    )) return;
    setMenjana(true); setRalat('');
    try {
      await kosongkanPenguji(runId);
      await muat();
    } catch (e: any) {
      setRalat(e.message || 'Gagal mengosongkan penguji.');
    } finally { setMenjana(false); }
  };

  const simpanKuota = async (nilai: number | '') => {
    setKuota(nilai);
    if (!jadual) return;
    try { await simpanKuotaPenguji(jadual.runId, nilai === '' ? null : nilai); }
    catch (e: any) { setRalat(e.message || 'Gagal menyimpan kuota penguji.'); }
  };

  const togolGabung = async (nama: string) => {
    const baharu = gabung.includes(nama)
      ? gabung.filter(x => x !== nama)
      : [...gabung, nama].sort();
    setGabung(baharu);
    // Disimpan hanya kalau jadual sudah wujud; tanpa larian, tiada tempat
    // untuk menyimpannya lagi dan tandaan itu hanya hidup dalam skrin ini.
    if (!jadual) return;
    try { await simpanProgramGabung(jadual.runId, baharu); }
    catch (e: any) { setRalat(e.message || 'Gagal menyimpan gabungan program.'); }
  };

  const simpanNama = async (label: string, nama: string) => {
    if (!jadual) return;
    setNamaStesen(p => ({ ...p, [label]: nama }));
    try { await simpanNamaStesen(jadual.runId, label, nama); }
    catch (e: any) { setRalat(e.message || 'Gagal menyimpan nama stesen.'); }
  };

  const pindah = async (schoolId: string, stesenBaharu: string) => {
    if (!jadual) return;
    try {
      await pindahSekolah(jadual.runId, schoolId, stesenBaharu);
      await muat();
    } catch (e: any) { setRalat(e.message || 'Gagal memindahkan sekolah.'); }
  };

  // Dikumpulkan mengikut label, mengekalkan susunan label supaya 1A..6A
  // sentiasa mendahului 1B..6B tanpa mengira susunan baris dari pangkalan data.
  const stesen = useMemo(() => {
    if (!jadual) return [];
    const label = labelStesen(jadual.bilKumpulan);
    return label.map(l => ({
      label: l,
      sekolah: jadual.sekolah.filter(s => s.stesen === l)
        .sort((a, b) => b.peserta - a.peserta),
    }));
  }, [jadual]);

  const bahagian = useMemo(() => {
    const peta = new Map<string, typeof stesen>();
    stesen.forEach(s => {
      const huruf = s.label.slice(-1);
      peta.set(huruf, [...(peta.get(huruf) || []), s]);
    });
    return Array.from(peta.entries());
  }, [stesen]);

  const stesenPenguji = useMemo(() => {
    if (!jadual) return [];
    return labelStesen(jadual.bilKumpulan).map(l => ({
      label: l,
      nama: namaStesen[l] || '',
      penguji: penguji.filter(x => x.stesen === l).sort((m, n) => m.nama.localeCompare(n.nama)),
    }));
  }, [jadual, penguji, namaStesen]);

  // Yang sudah diambil oleh jadual program lain tidak boleh diletakkan di
  // sini — kekangan pangkalan data akan menolaknya.
  const bolehDitempatkan = useMemo(
    () => pengujiLayak.filter(p => !p.sudahDitempatkan || p.sudahDitempatkan === badgeName),
    [pengujiLayak, badgeName]);

  // Pecahan mengikut program. Jumlahnya boleh melebihi saiz kolam kerana
  // seorang penguji boleh mendaftar dalam lebih daripada satu program.
  const pecahanKolam = useMemo(() => [badgeName, ...gabung].map(n => ({
    nama: n,
    bil: pengujiLayak.filter(p => p.programLain.split(', ').includes(n)).length,
  })), [pengujiLayak, badgeName, gabung]);

  // Apa yang kuota itu bermakna dalam amalan, dikira di hadapan mata supaya
  // admin tidak perlu membahagi sendiri: 24 orang untuk 12 stesen ialah 2
  // setiap stesen. Bila tidak sekata, sebahagian stesen mendapat seorang lebih.
  const kesanKuota = useMemo(() => {
    const bil = kuota === '' ? bolehDitempatkan.length : Math.min(kuota, bolehDitempatkan.length);
    const stesenBil = jadual?.bilKumpulan || 0;
    if (!stesenBil) return null;
    const asas = Math.floor(bil / stesenBil);
    const lebih = bil % stesenBil;
    return { bil, stesenBil, asas, lebih, kurang: kuota === '' ? 0 : Math.max(0, kuota - bolehDitempatkan.length) };
  }, [kuota, bolehDitempatkan, jadual]);

  const saiz = stesen.map(s => s.sekolah.reduce((n, x) => n + x.peserta, 0));
  const jumlah = saiz.reduce((a, b) => a + b, 0);
  const jurang = saiz.length ? Math.max(...saiz) - Math.min(...saiz) : 0;

  const kelasPilih = 'p-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none';

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <h3 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
          <Grid3x3 size={16} className="text-blue-600" /> Kumpulan Ujian Stesen
        </h3>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Program</span>
            <select className={kelasPilih} value={badgeName} onChange={e => setBadgeName(e.target.value)}>
              {namaBadge.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Tahun</span>
            <input type="number" className={`${kelasPilih} w-24`} value={year}
                   onChange={e => setYear(Number(e.target.value) || tahunKini)} />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Siri</span>
            <input type="number" min="1" className={`${kelasPilih} w-20`} value={siri}
                   onChange={e => setSiri(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Bil. Kumpulan</span>
            <input type="number" min="1" max="60" className={`${kelasPilih} w-24`} value={bilKumpulan}
                   onChange={e => setBilKumpulan(Math.min(60, Math.max(1, Number(e.target.value) || 12)))} />
          </label>

          <button onClick={jana} disabled={menjana || !badgeName}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition disabled:opacity-50">
            {menjana ? <LoadingSpinner size="sm" /> : <RefreshCw size={15} />}
            {jadual ? 'Jana Semula' : 'Jana Kumpulan'}
          </button>

          {jadual && paparan === 'peserta' && (
            <button onClick={() => muatTurunPdfStesen(jadual, stesen, daerahName)}
              className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-900 transition">
              <Download size={15} /> PDF Peserta
            </button>
          )}
          {jadual && paparan === 'penguji' && (
            <>
              <button onClick={janaPenguji} disabled={menjana}
                className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-violet-700 transition disabled:opacity-50">
                {menjana ? <LoadingSpinner size="sm" /> : <RefreshCw size={15} />} Agih Penguji
              </button>
              <button onClick={() => muatTurunPdfPenguji(jadual, stesenPenguji, daerahName)}
                className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-900 transition">
                <Download size={15} /> PDF Penguji
              </button>
              {/* Hanya muncul bila ada sesuatu untuk dikosongkan. Butang yang
                  tidak melakukan apa-apa hanya menimbulkan keraguan. */}
              {penguji.length > 0 && (
                <button onClick={() => kosongkan(jadual.runId, badgeName, penguji.length)} disabled={menjana}
                  className="flex items-center gap-2 bg-white text-rose-700 border border-rose-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-rose-50 transition disabled:opacity-50">
                  <RotateCcw size={15} /> Reset
                </button>
              )}
            </>
          )}
        </div>

        {/* Sentiasa kelihatan, walaupun jadual belum dijana. Menyembunyikannya
            bermakna admin tidak tahu bahagian penguji wujud langsung. */}
        <div className="flex gap-1 mt-3 border-b border-slate-200">
            {(['peserta', 'penguji'] as const).map(v => (
              <button key={v} onClick={() => setPaparan(v)}
                className={`px-3 py-1.5 text-xs font-bold border-b-2 -mb-px transition ${
                  paparan === v ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                {v === 'peserta' ? 'Peserta' : `Penguji (${penguji.length})`}
              </button>
            ))}
        </div>

        <p className="text-[11px] text-slate-400 mt-3">
          Peserta <strong>diluluskan</strong> sahaja; pegawai tidak dimasukkan. Satu sekolah
          tidak pernah dipecahkan antara stesen — ia bergerak sebagai satu unit.
        </p>
      </div>

      {ralat && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {ralat}
        </div>
      )}

      {memuat && <div className="py-8 text-center"><LoadingSpinner /></div>}

      {!memuat && !jadual && !ralat && (
        <div className="text-center py-12 text-slate-400">
          <Grid3x3 size={44} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Belum ada jadual untuk {badgeName} Siri {siri} {year}.</p>
          {paparan === 'peserta' ? (
            <p className="text-xs mt-1">Tekan Jana Kumpulan untuk membinanya.</p>
          ) : (
            // Penguji ditempatkan pada stesen yang SAMA seperti peserta, jadi
            // stesen itu perlu wujud dahulu. Dikatakan terus, bukan dibiarkan
            // admin meneka kenapa skrin ini kosong.
            <p className="text-xs mt-1">
              Jana jadual <strong>Peserta</strong> dahulu — penguji ditempatkan
              pada stesen yang sama.
            </p>
          )}
        </div>
      )}

      {/* Status SEMUA program siri ini. Sengaja di luar blok `jadual` supaya
          ia kelihatan walaupun program yang dibuka belum ada jadual — itulah
          saat admin paling perlu tahu apa yang program lain sudah ambil. */}
      {!memuat && paparan === 'penguji' && ringkasan.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-100 px-4 py-2">
            <span className="font-bold text-sm text-slate-800">
              Status pengagihan penguji &mdash; Siri {siri} {year}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left font-bold uppercase text-[9px] px-3 py-1.5">Program</th>
                  <th className="text-center font-bold uppercase text-[9px] px-3 py-1.5 w-16">Stesen</th>
                  <th className="text-center font-bold uppercase text-[9px] px-3 py-1.5 w-16">Perlu</th>
                  <th className="text-center font-bold uppercase text-[9px] px-3 py-1.5 w-24">Ditempatkan</th>
                  <th className="text-left font-bold uppercase text-[9px] px-3 py-1.5 w-28">Status</th>
                  <th className="text-right font-bold uppercase text-[9px] px-3 py-1.5 w-36">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {ringkasan.map(r => {
                  const kurang = r.kuota ? Math.max(0, r.kuota - r.ditempatkan) : 0;
                  const label = r.ditempatkan === 0 ? 'Belum diagih'
                    : kurang > 0 ? `Kurang ${kurang}` : 'Selesai';
                  const warna = r.ditempatkan === 0 ? 'bg-slate-100 text-slate-500'
                    : kurang > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800';
                  return (
                    <tr key={r.runId}
                      className={`border-t border-slate-100 ${r.badgeName === badgeName ? 'bg-blue-50/70' : ''}`}>
                      <td className="px-3 py-1.5">
                        <button onClick={() => setBadgeName(r.badgeName)}
                          className="font-bold text-slate-800 hover:text-blue-700 hover:underline underline-offset-2">
                          {r.badgeName}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-center text-slate-500">{r.bilKumpulan}</td>
                      <td className="px-3 py-1.5 text-center text-slate-500">{r.kuota ?? '—'}</td>
                      <td className="px-3 py-1.5 text-center font-bold text-slate-800">{r.ditempatkan}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${warna}`}>{label}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => setBadgeName(r.badgeName)}
                            disabled={r.badgeName === badgeName}
                            className="px-2 py-1 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-40 disabled:hover:bg-transparent">
                            {r.badgeName === badgeName ? 'Dibuka' : 'Lihat'}
                          </button>
                          {/* Hanya bila ada sesuatu untuk dibuang. */}
                          {r.ditempatkan > 0 && (
                            <button onClick={() => kosongkan(r.runId, r.badgeName, r.ditempatkan)}
                              disabled={menjana}
                              className="px-2 py-1 rounded-lg text-[10px] font-bold border border-rose-200 text-rose-700 hover:bg-rose-50 transition disabled:opacity-40">
                              Reset
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className="px-3 py-1.5 font-bold text-slate-700">JUMLAH DIAMBIL DARI KOLAM</td>
                  <td colSpan={2} />
                  <td className="px-3 py-1.5 text-center font-bold text-slate-900">
                    {ringkasan.reduce((n, r) => n + r.ditempatkan, 0)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {!memuat && jadual && (
        <>
          <div className="flex flex-wrap gap-4 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5">
            <span><Users size={12} className="inline -mt-0.5" /> <strong className="text-slate-800">{jumlah}</strong> peserta</span>
            <span><strong className="text-slate-800">{jadual.sekolah.length}</strong> sekolah</span>
            <span><strong className="text-slate-800">{jadual.bilKumpulan}</strong> stesen</span>
            <span>Julat <strong className="text-slate-800">{Math.min(...saiz)}–{Math.max(...saiz)}</strong></span>
            <span className={jurang > 5 ? 'text-amber-700 font-semibold' : ''}>Jurang {jurang}</span>
          </div>

          {paparan === 'peserta' && bahagian.map(([huruf, ls]) => (
            <div key={huruf} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-800 text-white px-4 py-2 flex justify-between items-baseline">
                <span className="font-bold text-sm">BAHAGIAN {huruf}</span>
                <span className="text-xs text-slate-300">
                  {ls.reduce((n, s) => n + s.sekolah.reduce((m, x) => m + x.peserta, 0), 0)} peserta
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-slate-200">
                {ls.map(s => {
                  const bil = s.sekolah.reduce((n, x) => n + x.peserta, 0);
                  return (
                    <div key={s.label} className="bg-white p-3">
                      <div className="flex justify-between items-baseline mb-2 pb-1.5 border-b border-slate-100">
                        <span className="font-bold text-sm text-slate-800">STESEN {s.label}</span>
                        <span className="text-xs font-bold text-blue-700">{bil} peserta</span>
                      </div>
                      <ol className="space-y-1">
                        {s.sekolah.map((x, i) => (
                          <li key={x.schoolId} className="flex items-center gap-2 text-[11px]">
                            <span className="text-slate-400 w-4 shrink-0">{i + 1}</span>
                            <span className="flex-1 text-slate-700 truncate" title={x.sekolah}>{x.sekolah}</span>
                            <span className="font-bold text-slate-800 w-6 text-right">{x.peserta}</span>
                            {/* Sekolah berpindah sebagai satu unit; tiada cara
                                memindahkan separuh daripadanya. */}
                            <select
                              className="text-[10px] border border-slate-200 rounded px-1 py-0.5 bg-slate-50"
                              value={s.label}
                              onChange={e => pindah(x.schoolId, e.target.value)}
                              title={`Pindahkan ${x.sekolah} ke stesen lain`}
                            >
                              {labelStesen(jadual.bilKumpulan).map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                          </li>
                        ))}
                        {s.sekolah.length === 0 && (
                          <li className="text-[11px] text-slate-300 italic">Tiada sekolah</li>
                        )}
                      </ol>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {paparan === 'penguji' && (
            <div className="space-y-4">
              {/* Kolam penguji. Yang digabungkan ialah SENARAI ORANG, bukan
                  stesen: setiap program kekal stesennya sendiri, dan seorang
                  penguji hanya boleh diambil oleh satu jadual dalam siri ini. */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-800">Kolam penguji</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Tanda program lain untuk mengambil pengujinya sekali. Stesen tidak
                      dikongsi &mdash; {badgeName || 'program ini'} kekal stesennya sendiri.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg whitespace-nowrap">
                    {bolehDitempatkan.length} boleh ditempatkan
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  {namaBadge.filter(n => n !== badgeName).map(n => {
                    const aktif = gabung.includes(n);
                    return (
                      <button key={n} onClick={() => togolGabung(n)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                          aktif
                            ? 'bg-violet-600 border-violet-600 text-white'
                            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                        {aktif ? '✓ ' : '+ '}{n}
                      </button>
                    );
                  })}
                </div>

                <p className="text-[11px] text-slate-500 mt-3">
                  {pecahanKolam.map(x => `${x.nama} ${x.bil}`).join('  ·  ')}
                  {' → '}
                  <strong className="text-slate-700">{pengujiLayak.length} orang unik</strong>
                  {pengujiLayak.length !== bolehDitempatkan.length && (
                    <span className="text-amber-700">
                      {`, ${pengujiLayak.length - bolehDitempatkan.length} sudah diambil program lain`}
                    </span>
                  )}
                </p>

                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <label className="text-xs font-bold text-slate-700">Penguji diperlukan</label>
                  <input
                    type="number"
                    min={1}
                    value={kuota}
                    placeholder={String(bolehDitempatkan.length)}
                    onChange={e => setKuota(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
                    onBlur={e => simpanKuota(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
                    className="w-24 text-sm px-2 py-1 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  {kesanKuota && (
                    <span className="text-[11px] text-slate-500">
                      {kesanKuota.bil} orang &middot; {kesanKuota.stesenBil} stesen &middot;{' '}
                      {kesanKuota.lebih === 0
                        ? `${kesanKuota.asas} setiap stesen`
                        : `${kesanKuota.asas}–${kesanKuota.asas + 1} setiap stesen`}
                    </span>
                  )}
                  {kesanKuota && kesanKuota.kurang > 0 && (
                    <span className="text-[11px] font-bold text-amber-700">
                      kurang {kesanKuota.kurang} orang &mdash; kolam hanya ada {bolehDitempatkan.length}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Kosongkan untuk mengambil seluruh kolam. Penguji {badgeName || 'program ini'} dipilih
                  dahulu; program yang digabungkan hanya menampung kekurangan.
                </p>
              </div>

              {penguji.length === 0 && (
                <div className="text-center py-10 text-slate-400 text-sm">
                  Belum ada penguji ditempatkan. Tekan <strong>Agih Penguji</strong>.
                </div>
              )}

              {stesenPenguji.map(st => (
                <div key={st.label} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-slate-100 px-4 py-2 flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-slate-800">STESEN {st.label}</span>
                    {/* Disimpan bila fokus keluar, bukan pada setiap ketukan
                        kekunci — menyimpan setiap huruf menghantar satu
                        permintaan setiap aksara. */}
                    <input
                      className="flex-1 min-w-[180px] text-xs px-2 py-1 border border-slate-200 rounded bg-white"
                      placeholder="Nama ujian, cth UJIAN KESETIAAN"
                      defaultValue={st.nama}
                      onBlur={e => { if (e.target.value !== st.nama) simpanNama(st.label, e.target.value); }}
                    />
                    <span className="text-xs text-slate-500">{st.penguji.length} penguji</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="text-left font-bold uppercase text-[9px] px-3 py-1.5 w-10">Bil</th>
                          <th className="text-left font-bold uppercase text-[9px] px-3 py-1.5">Pemimpin (Penguji)</th>
                          <th className="text-left font-bold uppercase text-[9px] px-3 py-1.5">Sekolah</th>
                          <th className="text-left font-bold uppercase text-[9px] px-3 py-1.5 w-24">Stesen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {st.penguji.map((pg, i) => (
                          <tr key={pg.personIc} className="border-t border-slate-100">
                            <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                            <td className="px-3 py-1.5 text-slate-800">{pg.nama}</td>
                            <td className="px-3 py-1.5 text-slate-500">{pg.sekolah}</td>
                            <td className="px-3 py-1.5">
                              <select
                                className="text-[10px] border border-slate-200 rounded px-1 py-0.5 bg-slate-50"
                                value={st.label}
                                onChange={async e => {
                                  if (!jadual) return;
                                  try {
                                    await pindahPenguji(jadual.runId, pg.personIc, e.target.value);
                                    await muat();
                                  } catch (err: any) {
                                    setRalat(err.message || 'Gagal memindahkan penguji.');
                                  }
                                }}
                              >
                                {labelStesen(jadual.bilKumpulan).map(l => <option key={l} value={l}>{l}</option>)}
                              </select>
                            </td>
                          </tr>
                        ))}
                        {st.penguji.length === 0 && (
                          <tr><td colSpan={4} className="px-3 py-2 text-slate-300 italic text-[11px]">Tiada penguji</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {pengujiLayak.some(x => x.sudahDitempatkan && x.sudahDitempatkan !== badgeName) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-800">
                  <strong>Dikecualikan</strong> kerana sudah ditempatkan dalam jadual program lain bagi siri ini:
                  <ul className="mt-1 space-y-0.5">
                    {pengujiLayak.filter(x => x.sudahDitempatkan && x.sudahDitempatkan !== badgeName)
                      .map(x => <li key={x.personIc}>· {x.nama} — {x.sudahDitempatkan}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
