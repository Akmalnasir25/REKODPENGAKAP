import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Grid3x3, RefreshCw, Download, AlertTriangle, Users } from 'lucide-react';
import { Badge } from '../types';
import { LoadingSpinner } from './ui/LoadingSpinner';
import {
  labelStesen, bahagikanSekolah, ambilSekolahLayak,
  simpanJadual, ambilJadual, pindahSekolah, JadualStesen,
  ambilPengujiLayak, bahagikanPenguji, simpanPenguji, ambilPenguji,
  pindahPenguji, ambilNamaStesen, simpanNamaStesen,
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
      if (j) {
        const [pg, nm] = await Promise.all([ambilPenguji(j.runId), ambilNamaStesen(j.runId)]);
        setPenguji(pg); setNamaStesen(nm);
      } else { setPenguji([]); setNamaStesen({}); }
    } catch (e: any) {
      setRalat(e.message || 'Gagal memuat jadual.');
      setJadual(null); setPenguji([]); setNamaStesen({});
    } finally { setMemuat(false); }
  }, [badgeName, year, siri]);

  useEffect(() => { muat(); }, [muat]);

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
      const layak = await ambilPengujiLayak(badgeName, year, siri);
      setPengujiLayak(layak);
      // Yang sudah diambil oleh jadual program LAIN dikecualikan — kekangan
      // pangkalan data akan menolaknya, jadi lebih baik tidak mencuba.
      const boleh = layak.filter(p => !p.sudahDitempatkan || p.sudahDitempatkan === badgeName);
      if (boleh.length === 0) {
        setRalat('Tiada penguji yang boleh ditempatkan untuk program ini.');
        return;
      }
      const agih = bahagikanPenguji(boleh, jadual.bilKumpulan);
      const ikutIc = new Map(boleh.map(p => [p.personIc, p]));
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
