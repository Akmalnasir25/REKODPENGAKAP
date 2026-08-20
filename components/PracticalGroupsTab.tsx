import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Link2, RefreshCw, Download, AlertTriangle, Users, Plus, X, Columns3 } from 'lucide-react';
import { Badge } from '../types';
import { LoadingSpinner } from './ui/LoadingSpinner';
import {
  SAIZ_LALAI, LAJUR_LALAI, MAKS_LAJUR, bahagikanPeserta, ambilPesertaLayak,
  simpanJadualAmali, ambilJadualAmali, pindahPeserta, simpanLajurBorang,
  bersihkanLajur, isPpki, JadualAmali,
} from '../services/practicalGroupService';
import { muatTurunPdfAmali, susunKumpulan } from '../services/practicalGroupPdf';

interface Props {
  badges: Badge[];
  daerahName?: string;
}

// Berbeza daripada Kumpulan Stesen: di sini unit agihan ialah ORANG, bukan
// sekolah. Sekolah 20 orang dipecahkan kepada 8 + 8 + baki 4, dan baki itu
// bergabung dengan baki sekolah lain menjadi kumpulan CAMPUR.
// Rujuk docs/rancangan-kumpulan-amali.md.
export const PracticalGroupsTab: React.FC<Props> = ({ badges, daerahName }) => {
  const tahunKini = new Date().getFullYear();
  const [badgeName, setBadgeName] = useState('');
  const [year, setYear] = useState(tahunKini);
  const [siri, setSiri] = useState(1);
  const [saiz, setSaiz] = useState(SAIZ_LALAI);
  const [asingPpki, setAsingPpki] = useState(true);
  // Kepala lajur tanda pada borang. Disimpan bersama larian supaya ia kekal
  // selepas muat semula dan sama untuk setiap admin.
  const [lajur, setLajur] = useState<string[]>([...LAJUR_LALAI]);
  const [gunaCatatan, setGunaCatatan] = useState(true);
  const [simpanLajur, setSimpanLajur] = useState(false);

  const [jadual, setJadual] = useState<JadualAmali | null>(null);
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
      const j = await ambilJadualAmali(badgeName, year, siri);
      setJadual(j);
      // Tetapan diselaraskan dengan jadual yang WUJUD, supaya kotak input
      // tidak mendakwa sesuatu yang berbeza daripada apa yang dipaparkan.
      if (j) {
        setSaiz(j.saizKumpulan); setAsingPpki(j.asingPpki);
        setLajur(j.lajurTanda?.length ? j.lajurTanda : [...LAJUR_LALAI]);
        setGunaCatatan(j.gunaCatatan !== false);
      }
    } catch (e: any) {
      setRalat(e.message || 'Gagal memuat jadual.');
      setJadual(null);
    } finally { setMemuat(false); }
  }, [badgeName, year, siri]);

  useEffect(() => { muat(); }, [muat]);

  const jana = async () => {
    if (!badgeName) return;
    if (jadual && !confirm(
      `Jadual kumpulan ikatan bagi ${badgeName} Siri ${siri} ${year} sudah wujud.\n\n`
      + 'Menjana semula MEMADAM jadual sedia ada, termasuk sebarang pelarasan '
      + 'manual yang kau buat. Borang yang sudah dicetak akan menjadi lapuk.\n\nTeruskan?'
    )) return;

    setMenjana(true); setRalat('');
    try {
      const peserta = await ambilPesertaLayak(badgeName, year, siri);
      if (peserta.length === 0) {
        setRalat(`Tiada peserta diluluskan untuk ${badgeName} Siri ${siri} ${year}.`);
        return;
      }
      const kumpulan = bahagikanPeserta(peserta, saiz, asingPpki);
      await simpanJadualAmali(badgeName, year, siri, saiz, asingPpki, kumpulan,
                              lajur, gunaCatatan);
      await muat();
    } catch (e: any) {
      setRalat(e.message || 'Gagal menjana kumpulan.');
    } finally { setMenjana(false); }
  };

  const pindah = async (personId: string, kumpulanBaharu: number) => {
    if (!jadual) return;
    try {
      await pindahPeserta(jadual.runId, personId, kumpulanBaharu);
      await muat();
    } catch (e: any) { setRalat(e.message || 'Gagal memindahkan peserta.'); }
  };

  // Disimpan tanpa menjana semula: menukar kepala lajur tidak menyentuh siapa
  // berada dalam kumpulan mana, jadi memaksa jana semula untuk membetulkan satu
  // ejaan akan memusnahkan setiap pelarasan manual yang sudah dibuat.
  const simpanBorang = async (baharu: string[], catatan: boolean) => {
    setLajur(baharu); setGunaCatatan(catatan);
    if (!jadual) return;
    setSimpanLajur(true); setRalat('');
    try {
      await simpanLajurBorang(jadual.runId, baharu, catatan);
      await muat();
    } catch (e: any) {
      setRalat(e.message || 'Gagal menyimpan lajur borang.');
    } finally { setSimpanLajur(false); }
  };

  const ubahLajur = (i: number, nilai: string) =>
    setLajur(p => p.map((x, k) => (k === i ? nilai : x)));
  const buangLajur = (i: number) => {
    const baharu = lajur.filter((_, k) => k !== i);
    simpanBorang(baharu.length ? baharu : [...LAJUR_LALAI], gunaCatatan);
  };
  const tambahLajur = () => {
    if (lajur.length >= MAKS_LAJUR) return;
    setLajur(p => [...p, '']);
  };

  const kumpulan = useMemo(() => susunKumpulan(jadual), [jadual]);

  const ringkasan = useMemo(() => {
    const jum = kumpulan.reduce((n, k) => n + k.ahli.length, 0);
    const campur = kumpulan.filter(k => k.tajuk.startsWith('CAMPUR')).length;
    const ppki = kumpulan.filter(k => k.ahli.length > 0 && k.ahli.every(a => isPpki(a.unit))).length;
    const sekolah = new Set(kumpulan.flatMap(k => k.ahli.map(a => a.sekolah))).size;
    return { jum, campur, ppki, sekolah };
  }, [kumpulan]);

  const kelasPilih = 'p-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none';

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <h3 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
          <Link2 size={16} className="text-emerald-600" /> Kumpulan Ujian Amali (Ikatan)
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
            <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Seorang Kumpulan</span>
            <input type="number" min="2" max="20" className={`${kelasPilih} w-24`} value={saiz}
                   onChange={e => setSaiz(Math.min(20, Math.max(2, Number(e.target.value) || SAIZ_LALAI)))} />
          </label>

          <label className="flex items-center gap-2 pb-2 cursor-pointer">
            <input type="checkbox" checked={asingPpki} className="w-4 h-4 accent-emerald-600"
                   onChange={e => setAsingPpki(e.target.checked)} />
            <span className="text-xs font-semibold text-slate-600">Asingkan PPKI</span>
          </label>

          <button onClick={jana} disabled={menjana || !badgeName}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50">
            {menjana ? <LoadingSpinner size="sm" /> : <RefreshCw size={15} />}
            {jadual ? 'Jana Semula' : 'Jana Kumpulan'}
          </button>

          {jadual && (
            <button onClick={() => muatTurunPdfAmali(jadual, kumpulan, daerahName)}
              className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-900 transition">
              <Download size={15} /> Borang PDF
            </button>
          )}
        </div>

        {/* Lajur borang. Diletakkan di sini dan bukan dalam modal supaya admin
            nampak apa yang akan dicetak sebelum menekan Jana, bukan selepas. */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
              <Columns3 size={13} /> Lajur Borang ({lajur.length}/{MAKS_LAJUR})
            </span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={gunaCatatan} className="w-3.5 h-3.5 accent-emerald-600"
                     onChange={e => simpanBorang(lajur, e.target.checked)} />
              <span className="text-[11px] font-semibold text-slate-600">Lajur CATATAN</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-slate-400 font-mono px-2 py-1.5 bg-slate-50 rounded border border-slate-200">
              BIL · NAMA PESERTA
            </span>
            {lajur.map((x, i) => (
              <div key={i} className="relative">
                <input
                  value={x}
                  placeholder="nama lajur"
                  maxLength={20}
                  onChange={e => ubahLajur(i, e.target.value.toUpperCase())}
                  onBlur={() => simpanBorang(lajur, gunaCatatan)}
                  className="w-32 pl-2 pr-6 py-1.5 border border-slate-300 rounded text-xs font-bold uppercase bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                {/* Lajur terakhir tidak boleh dibuang — borang tanpa petak
                    tanda tiada guna untuk penguji. */}
                {lajur.length > 1 && (
                  <button onClick={() => buangLajur(i)} title="Buang lajur"
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-300 hover:text-rose-600 transition">
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
            {lajur.length < MAKS_LAJUR && (
              <button onClick={tambahLajur}
                className="flex items-center gap-1 px-2 py-1.5 border border-dashed border-slate-300 rounded text-[11px] font-bold text-slate-500 hover:border-emerald-500 hover:text-emerald-600 transition">
                <Plus size={13} /> Lajur
              </button>
            )}
            {gunaCatatan && (
              <span className="text-[10px] text-slate-400 font-mono px-2 py-1.5 bg-slate-50 rounded border border-slate-200">
                CATATAN
              </span>
            )}
            {simpanLajur && <LoadingSpinner size="sm" />}
          </div>

          <p className="text-[11px] text-slate-400 mt-2">
            Petak lajur ini dicetak <strong>kosong</strong> untuk penguji tanda di padang.
            {jadual
              ? ' Perubahan disimpan terus — tidak perlu jana semula.'
              : ' Ia akan disimpan bersama jadual bila kau tekan Jana Kumpulan.'}
          </p>
        </div>

        <p className="text-[11px] text-slate-400 mt-3">
          Peserta <strong>diluluskan</strong> sahaja; pegawai tidak dimasukkan. Satu sekolah
          memberi seberapa banyak kumpulan penuh yang boleh, dan bakinya bergabung dengan
          baki sekolah lain menjadi kumpulan <strong>CAMPUR</strong>.
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
          <Link2 size={44} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Belum ada jadual ikatan untuk {badgeName} Siri {siri} {year}.</p>
          <p className="text-xs mt-1">Tekan Jana Kumpulan untuk membinanya.</p>
        </div>
      )}

      {!memuat && jadual && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Peserta', nilai: ringkasan.jum },
              { label: 'Kumpulan', nilai: kumpulan.length },
              { label: 'Kumpulan CAMPUR', nilai: ringkasan.campur },
              { label: 'Sekolah', nilai: ringkasan.sekolah },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                <div className="text-[10px] font-bold uppercase text-slate-400">{k.label}</div>
                <div className="text-2xl font-extrabold text-slate-800">{k.nilai}</div>
              </div>
            ))}
          </div>

          {ringkasan.ppki > 0 && (
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <Users size={13} /> {ringkasan.ppki} kumpulan PPKI diasingkan daripada kumpulan biasa.
            </p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {kumpulan.map(k => {
              const campur = k.tajuk.startsWith('CAMPUR');
              // Saiz di luar sasaran ditandakan, bukan disekat — pelarasan
              // manual selalunya disengajakan (adik-beradik, pengangkutan).
              const luar = k.ahli.length !== jadual.saizKumpulan;
              return (
                <div key={k.nombor} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className={`px-3 py-2 flex items-center justify-between gap-2 ${
                    campur ? 'bg-amber-50 border-b border-amber-200' : 'bg-slate-100 border-b border-slate-200'}`}>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Kumpulan {k.nombor}</div>
                      <div className="text-xs font-bold text-slate-800 truncate" title={k.tajuk}>{k.tajuk}</div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      luar ? 'bg-amber-200 text-amber-900' : 'bg-emerald-100 text-emerald-700'}`}>
                      {k.ahli.length} org
                    </span>
                  </div>

                  <ul className="divide-y divide-slate-100">
                    {k.ahli.map((a, i) => (
                      <li key={a.personId} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                        <span className="text-slate-300 w-4 shrink-0">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-slate-700" title={a.nama}>{a.nama}</div>
                          {campur && (
                            <div className="truncate text-[10px] text-slate-400" title={a.sekolah}>{a.sekolah}</div>
                          )}
                        </div>
                        <select
                          className="text-[10px] border border-slate-200 rounded px-1 py-0.5 bg-white text-slate-500 shrink-0"
                          value={k.nombor}
                          onChange={e => pindah(a.personId, Number(e.target.value))}
                          title="Pindah ke kumpulan lain">
                          {kumpulan.map(x => <option key={x.nombor} value={x.nombor}>{x.nombor}</option>)}
                        </select>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
