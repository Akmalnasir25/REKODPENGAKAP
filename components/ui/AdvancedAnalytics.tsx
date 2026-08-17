import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, LabelList } from 'recharts';
import { SubmissionData } from '../../types';
import { TrendingUp, Users, Award, School, PieChart as PieIcon, Anchor, Layers, Shapes } from 'lucide-react';
import { safeGetMonth } from '../../utils/dataProcessing';

interface AdvancedAnalyticsProps {
  data: SubmissionData[];
  year?: number;
}

// Palet disahkan dengan validator dataviz pada permukaan putih:
//   #2a78d6 + #e87ba4 — CVD ΔE 13.0, penglihatan biasa ΔE 27.5, kedua-duanya
//   melepasi ambang. Magenta 2.69:1 terhadap putih (bawah 3:1), jadi ia WAJIB
//   membawa label langsung — itulah sebabnya bar jantina berlabel di dalam.
//
// Kebanyakan carta di sini ialah SATU siri kiraan mengikut kategori nominal.
// Satu siri = satu warna. Versi lama mewarnakan setiap bar berlainan daripada
// senarai lapan hue, yang menyandikan panjang bar dua kali dan membakar
// satu-satunya saluran bebas untuk maklumat yang carta itu sudah tunjukkan.
const WARNA = {
  siri1:    '#2a78d6',
  siri2:    '#e87ba4',
  grid:     '#e1e0d9',
  paksi:    '#c3c2b7',
  inkMuted: '#898781',
  inkKedua: '#52514e',
  permukaan: '#ffffff',
};

const gayaTooltip = {
  fontSize: 11,
  borderRadius: 8,
  border: `1px solid ${WARNA.grid}`,
  boxShadow: '0 4px 12px rgba(11,11,11,0.08)',
  padding: '6px 10px',
};

/**
 * Bar mendatar bagi kiraan mengikut kategori nominal.
 *
 * Satu hue, bar nipis, hujung data bulat, grid hairline SOLID (bukan putus —
 * garis putus membaca sebagai unjuran atau ambang, sedangkan ini cuma grid),
 * dan nilai dilabel pada hujung setiap bar. Label itu bermakna setiap nilai
 * boleh dibaca tanpa tooltip.
 */
const CartaBar: React.FC<{
  data: Array<{ name: string; value: number; fullName?: string }>;
  tinggi?: number;
  lebarLabel?: number;
}> = ({ data, tinggi = 220, lebarLabel = 120 }) => (
  <ResponsiveContainer width="100%" height={tinggi}>
    <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }}>
      <CartesianGrid horizontal={false} stroke={WARNA.grid} />
      <XAxis type="number" tick={{ fontSize: 10, fill: WARNA.inkMuted }}
             axisLine={{ stroke: WARNA.paksi }} tickLine={false} />
      <YAxis type="category" dataKey="name" width={lebarLabel}
             tick={{ fontSize: 10, fill: WARNA.inkKedua }}
             axisLine={false} tickLine={false} />
      <Tooltip
        contentStyle={gayaTooltip}
        cursor={{ fill: 'rgba(42,120,214,0.06)' }}
        formatter={(v: any, _n: any, props: any) => [v, props?.payload?.fullName || 'Bilangan']}
      />
      <Bar dataKey="value" fill={WARNA.siri1} radius={[0, 4, 4, 0]} barSize={16} name="Bilangan">
        <LabelList dataKey="value" position="right"
                   style={{ fontSize: 10, fill: WARNA.inkKedua, fontWeight: 600 }} />
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

/** Tajuk kad — satu bentuk, supaya setiap kad kelihatan sekeluarga. */
const TajukKad: React.FC<{ icon: any; warna: string; children: React.ReactNode }> =
  ({ icon: Icon, warna, children }) => (
    <h4 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
      <Icon size={15} className={warna} /> {children}
    </h4>
  );

const KAD = 'bg-white rounded-xl p-5 border border-slate-200 shadow-sm';

export const AdvancedAnalytics: React.FC<AdvancedAnalyticsProps> = ({ data, year = new Date().getFullYear() }) => {
  const yearData = useMemo(() => data, [data]);

  // Badge distribution
  const badgeData = useMemo(() => {
    const counts: Record<string, number> = {};
    yearData.forEach(d => {
      const badge = d.badge || 'Lain-lain';
      counts[badge] = (counts[badge] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [yearData]);

  // Gender distribution
  const genderData = useMemo(() => {
    const counts: Record<string, number> = {};
    yearData.forEach(d => {
      const gender = d.gender || 'Tidak Dinyatakan';
      counts[gender] = (counts[gender] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [yearData]);

  // Category distribution
  // PESERTA sahaja — tajuk kad memang berbunyi "Peserta".
  //
  // Versi lama mengira setiap rekod yang mempunyai kategori, termasuk pegawai
  // yang membawa 'Pengakap Kanak-kanak' basi daripada lalai borang. Baldi
  // Kanak-kanak ditokok oleh pemimpin dan penguji tanpa sesiapa perasan.
  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    yearData.forEach(d => {
      const r = String(d.role || 'PESERTA').toUpperCase();
      if (r !== 'PESERTA' && r !== 'PENERIMA RAMBU') return;
      if (d.category) {
        counts[d.category] = (counts[d.category] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [yearData]);

  // Unit distribution — PESERTA sahaja.
  //
  // Pegawai tiada unit (supabaseApi.ts:469 menetapkannya kosong bagi mereka),
  // jadi memasukkan mereka akan menghasilkan baldi "Tiada Unit" yang lebih
  // besar daripada mana-mana unit sebenar dan menjadikan carta itu separuh
  // tentang unit, separuh tentang peranan. Keputusan U2 dalam
  // docs/rancangan-penapis-unit.md.
  const unitData = useMemo(() => {
    const counts: Record<string, number> = {};
    yearData.forEach(d => {
      const r = String(d.role || 'PESERTA').toUpperCase();
      if (r !== 'PESERTA' && r !== 'PENERIMA RAMBU') return;
      const unit = (d.unit || '').trim();
      if (!unit) return;
      counts[unit] = (counts[unit] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [yearData]);

  // Top 10 schools
  const topSchools = useMemo(() => {
    const counts: Record<string, number> = {};
    yearData.forEach(d => {
      const school = d.school || 'Tidak Dinyatakan';
      counts[school] = (counts[school] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name: name.length > 25 ? name.slice(0, 25) + '...' : name, value, fullName: name }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [yearData]);

  // Monthly trend
  const monthlyTrend = useMemo(() => {
    const months: Record<number, number> = {};
    yearData.forEach(d => {
      const month = safeGetMonth(d.date);
      if (month !== null) {
        months[month] = (months[month] || 0) + 1;
      }
    });
    const monthNames = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
    return monthNames.map((name, i) => ({ name, value: months[i] || 0 }));
  }, [yearData]);

  // Role distribution
  const roleData = useMemo(() => {
    const counts: Record<string, number> = {};
    yearData.forEach(d => {
      const role = (d.role || 'PESERTA').toUpperCase();
      counts[role] = (counts[role] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [yearData]);

  // Lapan hue ialah had keras; hue kesembilan tidak boleh dibezakan di bawah
  // CVD. Ekornya dilipat ke "Lain-lain" dan bukan dikitar semula.
  const programDipapar = useMemo(() => {
    if (badgeData.length <= 8) return badgeData;
    const utama = badgeData.slice(0, 7);
    const baki = badgeData.slice(7).reduce((n, b) => n + b.value, 0);
    return [...utama, { name: 'Lain-lain', value: baki }];
  }, [badgeData]);

  const jantina = useMemo(() => {
    let lelaki = 0, perempuan = 0, lain = 0;
    yearData.forEach(d => {
      const g = (d.gender || '').trim().toUpperCase();
      if (g.startsWith('L') || g.startsWith('M')) lelaki++;
      else if (g.startsWith('P') || g.startsWith('F')) perempuan++;
      else lain++;
    });
    return { lelaki, perempuan, lain, jumlah: lelaki + perempuan + lain };
  }, [yearData]);

  if (yearData.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <PieIcon size={48} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">Tiada data untuk dianalisis</p>
      </div>
    );
  }

  const puncakBulan = monthlyTrend.reduce((a, b) => (b.value > a.value ? b : a), monthlyTrend[0]);

  return (
    <div className="space-y-5">
      {/* Trend bulanan — satu siri, jadi tiada legenda; tajuk sudah
          menamakannya. Titik pada setiap bulan dibuang dan hanya puncak
          dinyatakan. Nombor pada setiap titik ialah kekacauan yang tidak
          dibaca sesiapa. */}
      <div className={KAD}>
        <div className="flex items-baseline justify-between mb-4">
          <TajukKad icon={TrendingUp} warna="text-blue-600">Trend Bulanan {year}</TajukKad>
          <p className="text-[11px] text-slate-400">
            Puncak: <span className="font-bold text-slate-600">{puncakBulan?.name} · {puncakBulan?.value.toLocaleString()}</span>
          </p>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={monthlyTrend} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
            <CartesianGrid vertical={false} stroke={WARNA.grid} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: WARNA.inkMuted }}
                   axisLine={{ stroke: WARNA.paksi }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: WARNA.inkMuted }}
                   axisLine={false} tickLine={false} width={44}
                   tickFormatter={(v: number) => v.toLocaleString()} />
            <Tooltip contentStyle={gayaTooltip} cursor={{ stroke: WARNA.paksi }} />
            <Line type="monotone" dataKey="value" name="Pendaftaran"
                  stroke={WARNA.siri1} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                  dot={false}
                  activeDot={{ r: 5, fill: WARNA.siri1, stroke: WARNA.permukaan, strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>

        {/* Tooltip tidak boleh menjadi satu-satunya jalan membaca nilai. */}
        <details className="mt-3">
          <summary className="text-[11px] text-slate-400 cursor-pointer hover:text-slate-600 select-none">
            Lihat jadual nilai
          </summary>
          <div className="overflow-x-auto mt-2">
            <table className="text-[11px] w-full" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr className="text-slate-400 text-left">
                  {monthlyTrend.map(m => <th key={m.name} className="font-semibold px-1 py-1">{m.name}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr className="text-slate-700 font-semibold">
                  {monthlyTrend.map(m => <td key={m.name} className="px-1 py-1">{m.value.toLocaleString()}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className={KAD}>
          <TajukKad icon={Award} warna="text-amber-600">Pecahan Program</TajukKad>
          {/* Dahulunya pai sepuluh hirisan. Pai membandingkan nilai yang
              hampir sama dengan buruk, dan sepuluh hirisan melebihi had lapan
              hue. Bar disusun menjawab "yang mana terbesar" terus. */}
          <CartaBar data={programDipapar} tinggi={Math.max(180, programDipapar.length * 30)} lebarLabel={130} />
        </div>

        <div className={KAD}>
          <TajukKad icon={School} warna="text-emerald-600">10 Sekolah Teratas</TajukKad>
          <CartaBar data={topSchools} tinggi={Math.max(180, topSchools.length * 30)} lebarLabel={130} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className={KAD}>
          <TajukKad icon={Users} warna="text-blue-600">Pecahan Jantina</TajukKad>
          {/* Pai dua hirisan ialah jubin statistik yang menyamar. Satu bar
              100% menunjukkan nisbah dengan lebih baik dalam ruang lebih
              kecil, dan label di dalam memberi relief kontras yang magenta
              perlukan. Jurang 2px dalam warna permukaan memisahkan segmen,
              bukan garis sempadan. */}
          <div className="flex w-full h-11 rounded-lg overflow-hidden mt-1">
            {jantina.lelaki > 0 && (
              <div className="flex items-center justify-center text-white text-xs font-bold"
                   style={{ width: `${(jantina.lelaki / jantina.jumlah) * 100}%`,
                            background: WARNA.siri1, marginRight: 2 }}>
                {jantina.lelaki >= jantina.jumlah * 0.12 ? jantina.lelaki.toLocaleString() : ''}
              </div>
            )}
            {jantina.perempuan > 0 && (
              <div className="flex items-center justify-center text-xs font-bold"
                   style={{ width: `${(jantina.perempuan / jantina.jumlah) * 100}%`,
                            background: WARNA.siri2, color: '#0b0b0b',
                            marginRight: jantina.lain > 0 ? 2 : 0 }}>
                {jantina.perempuan >= jantina.jumlah * 0.12 ? jantina.perempuan.toLocaleString() : ''}
              </div>
            )}
            {jantina.lain > 0 && (
              <div style={{ width: `${(jantina.lain / jantina.jumlah) * 100}%`, background: WARNA.grid }} />
            )}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
            {[
              { label: 'Lelaki', bil: jantina.lelaki, warna: WARNA.siri1 },
              { label: 'Perempuan', bil: jantina.perempuan, warna: WARNA.siri2 },
              ...(jantina.lain > 0 ? [{ label: 'Tidak dinyatakan', bil: jantina.lain, warna: WARNA.grid }] : []),
            ].map(x => (
              <span key={x.label} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: x.warna }} />
                {x.label}
                <strong className="text-slate-800">{x.bil.toLocaleString()}</strong>
                <span className="text-slate-400">
                  {jantina.jumlah > 0 ? `${Math.round((x.bil / jantina.jumlah) * 100)}%` : '0%'}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className={KAD}>
          <TajukKad icon={Layers} warna="text-violet-600">Pecahan Peranan</TajukKad>
          <CartaBar data={roleData} tinggi={Math.max(170, roleData.length * 34)} lebarLabel={130} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {categoryData.length > 0 && (
          <div className={KAD}>
            <TajukKad icon={Shapes} warna="text-indigo-600">Pecahan Kategori Peserta</TajukKad>
            <CartaBar data={categoryData} tinggi={Math.max(150, categoryData.length * 38)} lebarLabel={140} />
          </div>
        )}

        {unitData.length > 0 && (
          <div className={KAD}>
            <TajukKad icon={Anchor} warna="text-orange-600">Pecahan Unit Peserta</TajukKad>
            <CartaBar data={unitData} tinggi={Math.max(150, unitData.length * 38)} lebarLabel={140} />
          </div>
        )}
      </div>
    </div>
  );
};
