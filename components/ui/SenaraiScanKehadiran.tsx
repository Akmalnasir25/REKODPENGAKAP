import React, { useMemo, useState } from 'react';
import { CheckCircle, Trash2, Search } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';

/**
 * SEJARAH IMBASAN KEHADIRAN
 *
 * Rujuk docs/rancangan-senarai-scan-semua-tarikh.md.
 *
 * Dahulunya senarai ini menapis keras pada `new Date().toDateString()`, jadi
 * selepas tengah malam imbasan semalam lenyap bersama butang padamnya.
 * Perkhemahan berjalan beberapa hari; silap yang disedari pagi esok adalah
 * perkara biasa, bukan kes tepi.
 *
 * "Hari Ini" kekal mod lalai kerana itulah yang dipandang sepanjang hari di
 * meja pendaftaran. "Semua" ada bila yang diingati hanyalah "ada satu salah
 * semalam".
 *
 * Komponen ini dikongsi oleh Panel Daerah dan Panel Negeri. Sebelum ini blok
 * ini wujud dua kali, hampir baris demi baris, dan setiap pepijat perlu
 * dibetulkan dua kali.
 */

interface SenaraiScanKehadiranProps {
  /** Rekod attendance_verifications bagi skop ini, tahun semasa. */
  records: any[];
  loading: boolean;
  /** Id rekod yang sedang dipadam, untuk keadaan sibuk pada butangnya. */
  padamId: string | null;
  /** Dipanggil selepas pengesahan; induk hanya perlu memadam dan memuat semula. */
  onPadam: (record: any) => void;
  /** Panel Negeri memaparkan kod daerah pada setiap baris. */
  tunjukDaerah?: boolean;
}

type Mod = 'hari' | 'semua';

const kunciTarikh = (nilai: string): string => new Date(nilai).toDateString();

const labelTarikh = (kunci: string, hariIni: string): string => {
  if (kunci === hariIni) return 'Hari Ini';
  const semalam = new Date();
  semalam.setDate(semalam.getDate() - 1);
  if (kunci === semalam.toDateString()) return 'Semalam';
  return new Date(kunci).toLocaleDateString('ms-MY', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
};

export const SenaraiScanKehadiran: React.FC<SenaraiScanKehadiranProps> = ({
  records, loading, padamId, onPadam, tunjukDaerah = false,
}) => {
  const [mod, setMod] = useState<Mod>('hari');
  const [carian, setCarian] = useState('');

  const hariIni = new Date().toDateString();
  const bilHariIni = useMemo(
    () => records.filter((r: any) => kunciTarikh(r.verified_at) === hariIni).length,
    [records, hariIni],
  );

  const ditapis = useMemo(() => {
    const soalan = carian.trim().toLowerCase();
    return records.filter((r: any) => {
      if (mod === 'hari' && kunciTarikh(r.verified_at) !== hariIni) return false;
      if (!soalan) return true;
      return [r.school?.name, r.school?.school_code, r.badge?.name]
        .some(nilai => String(nilai || '').toLowerCase().includes(soalan));
    });
  }, [records, mod, carian, hariIni]);

  // Dikumpulkan mengikut tarikh supaya "semalam" kelihatan sebagai semalam,
  // bukan sekadar cap masa yang perlu dibaca satu per satu. Susunan
  // verified_at menurun daripada pertanyaan dikekalkan.
  const kumpulan = useMemo(() => {
    const map = new Map<string, any[]>();
    ditapis.forEach((r: any) => {
      const kunci = kunciTarikh(r.verified_at);
      const senarai = map.get(kunci);
      if (senarai) senarai.push(r);
      else map.set(kunci, [r]);
    });
    return Array.from(map.entries());
  }, [ditapis]);

  // Pengesahan tinggal di sini dan bukan di setiap panel, supaya ayatnya
  // sama di mana-mana. Ia menyebut tarikh dan siri dengan sengaja: memadam
  // rekod lampau lebih berisiko daripada membatalkan imbasan sepuluh saat
  // lalu, jadi dialognya mesti menyatakan apa sebenarnya yang akan hilang.
  const sahkanPadam = (r: any) => {
    const masa = new Date(r.verified_at);
    const amaran = [
      'Padam pengesahan kehadiran?',
      '',
      `${r.school?.name || 'Sekolah'} — ${r.badge?.name || 'Program'}`
      + `${(r.siri || 1) > 1 ? ` (Siri ${r.siri})` : ''}`,
      `Diimbas: ${labelTarikh(masa.toDateString(), hariIni)}, `
      + `${masa.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}`
      + ` · ${r.participant_count || 0} orang`,
      '',
      'Sekolah ini akan kembali ke "Belum Scan" bagi program tersebut, '
      + 'dan QR-nya boleh discan semula.',
    ].join('\n');
    if (!confirm(amaran)) return;
    onPadam(r);
  };

  const butangMod: { nilai: Mod; label: string }[] = [
    { nilai: 'hari', label: `Hari Ini (${bilHariIni})` },
    { nilai: 'semua', label: `Semua (${records.length})` },
  ];

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <CheckCircle size={16} className="text-green-500" /> Rekod Scan Kehadiran
        </h3>
        <div className="flex gap-2">
          {butangMod.map(b => (
            <button
              key={b.nilai}
              onClick={() => setMod(b.nilai)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${mod === b.nilai
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={carian}
          onChange={(e) => setCarian(e.target.value)}
          placeholder="Cari sekolah, kod atau program..."
          className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      {loading && records.length === 0 ? (
        <p className="text-xs text-slate-400 italic">Memuatkan rekod...</p>
      ) : ditapis.length === 0 ? (
        <p className="text-xs text-slate-400 italic">
          {carian.trim()
            ? 'Tiada rekod sepadan dengan carian ini.'
            : mod === 'hari'
              ? 'Belum ada kehadiran disahkan hari ini.'
              : 'Belum ada kehadiran disahkan tahun ini.'}
        </p>
      ) : (
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {kumpulan.map(([kunci, senarai]) => (
            <div key={kunci}>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 sticky top-0 bg-white py-1">
                {labelTarikh(kunci, hariIni)} · {senarai.length} rekod
              </p>
              <div className="space-y-2">
                {senarai.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2 gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{r.school?.name || '-'}</p>
                      <p className="text-[10px] text-slate-500">
                        {r.badge?.name || '-'}{(r.siri || 1) > 1 ? ` (Siri ${r.siri})` : ''}
                        {tunjukDaerah && <> | {r.school?.daerah?.code || '-'}</>}
                        {' '}| {r.participant_count || 0} peserta
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-green-600 font-mono whitespace-nowrap">
                        {new Date(r.verified_at).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <button
                        onClick={() => sahkanPadam(r)}
                        disabled={padamId === r.id}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-100 rounded p-1 transition disabled:opacity-50"
                        title="Padam pengesahan kehadiran"
                      >
                        {padamId === r.id ? <LoadingSpinner size="sm" color="border-red-500" /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
