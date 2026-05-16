import React, { useMemo, useState } from 'react';
import { MapPin, Award, Users, BarChart3, TrendingUp, Calendar, FileSpreadsheet, ChevronDown, ChevronUp, Activity } from 'lucide-react';
import { SubmissionData, School, Badge } from '../types';

interface DaerahProgramAnalysisProps {
  data: SubmissionData[];
  schools: School[];
  badges: Badge[];
  daerahList: { code: string; name: string; negeriCode?: string }[];
  negeriName?: string;
  /** Daerah yang dipilih dari header. 'ALL' untuk paparkan semua. */
  selectedDaerah?: string;
}

const safeYear = (value: unknown): number | null => {
  if (!value) return null;
  const d = new Date(value as string);
  return isNaN(d.getTime()) ? null : d.getFullYear();
};

const isPesertaRecord = (item: SubmissionData) => {
  const role = (item.role || 'PESERTA').toUpperCase();
  return role !== 'PEMIMPIN' && !role.includes('PENOLONG') && role !== 'PENGUJI';
};

export const DaerahProgramAnalysis: React.FC<DaerahProgramAnalysisProps> = ({
  data,
  schools,
  badges,
  daerahList,
  negeriName,
  selectedDaerah = 'ALL',
}) => {
  const currentYear = new Date().getFullYear();
  const [yearFilter, setYearFilter] = useState<'ALL' | number>(currentYear);
  const [expandedDaerah, setExpandedDaerah] = useState<string | null>(null);

  // Bersihkan data: keluarkan system markers, hanya rekod sah
  const cleanData = useMemo(() => {
    const seen = new Set<string>();
    return data.filter(d => {
      if (d.school === '__SYSTEM_YEAR_MARKER__') return false;
      if (!d.student || !String(d.student).trim()) return false;
      const y = safeYear(d.date);
      if (y === null) return false;
      const ic = d.icNumber ? String(d.icNumber).trim() : '';
      const key = ic && ic.length > 4
        ? `${ic}_${d.badge}_${y}`
        : `${String(d.student).trim().toUpperCase()}_${d.school}_${d.badge}_${y}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [data]);

  // Senarai tahun yang ada data
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    cleanData.forEach(d => {
      const y = safeYear(d.date);
      if (y !== null) years.add(y);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [cleanData]);

  // Apply year filter
  const yearFilteredData = useMemo(() => {
    if (yearFilter === 'ALL') return cleanData;
    return cleanData.filter(d => safeYear(d.date) === yearFilter);
  }, [cleanData, yearFilter]);

  // Senarai daerah untuk dianalisis (jika selectedDaerah !== ALL, hanya daerah itu)
  const targetDaerah = useMemo(() => {
    if (selectedDaerah && selectedDaerah !== 'ALL') {
      return daerahList.filter(d => d.code === selectedDaerah);
    }
    return daerahList;
  }, [daerahList, selectedDaerah]);

  // Senarai program unik (dari data yang ada + dari badge list)
  const allPrograms = useMemo(() => {
    const set = new Set<string>();
    yearFilteredData.forEach(d => { if (d.badge) set.add(d.badge); });
    return Array.from(set).sort();
  }, [yearFilteredData]);

  // Pengiraan utama: Matrix daerah x program
  const matrix = useMemo(() => {
    return targetDaerah.map(daerah => {
      const daerahRecords = yearFilteredData.filter(r => r.daerahCode === daerah.code);
      const peserta = daerahRecords.filter(isPesertaRecord);
      const pemimpin = daerahRecords.filter(r => (r.role || '').toUpperCase() === 'PEMIMPIN');
      const penolong = daerahRecords.filter(r => (r.role || '').toUpperCase().includes('PENOLONG'));
      const penguji = daerahRecords.filter(r => (r.role || '').toUpperCase() === 'PENGUJI');
      const daerahSchools = schools.filter(s => s.daerahCode === daerah.code);

      // Program breakdown untuk daerah ini
      const programBreakdown: Record<string, {
        total: number;
        peserta: number;
        pemimpin: number;
        penolong: number;
        penguji: number;
        sekolahTerlibat: Set<string>;
        tahunDijalankan: Set<number>;
      }> = {};

      daerahRecords.forEach(r => {
        if (!r.badge) return;
        if (!programBreakdown[r.badge]) {
          programBreakdown[r.badge] = {
            total: 0,
            peserta: 0,
            pemimpin: 0,
            penolong: 0,
            penguji: 0,
            sekolahTerlibat: new Set(),
            tahunDijalankan: new Set(),
          };
        }
        const p = programBreakdown[r.badge];
        p.total++;
        const role = (r.role || 'PESERTA').toUpperCase();
        if (role === 'PEMIMPIN') p.pemimpin++;
        else if (role.includes('PENOLONG')) p.penolong++;
        else if (role === 'PENGUJI') p.penguji++;
        else p.peserta++;
        if (r.school) p.sekolahTerlibat.add(r.school);
        const y = safeYear(r.date);
        if (y !== null) p.tahunDijalankan.add(y);
      });

      const programList = Object.entries(programBreakdown)
        .map(([name, stats]) => ({
          name,
          ...stats,
          sekolahCount: stats.sekolahTerlibat.size,
          tahunList: Array.from(stats.tahunDijalankan).sort((a, b) => b - a),
        }))
        .sort((a, b) => b.peserta - a.peserta);

      // Sekolah paling aktif dalam daerah ini
      const schoolStats: Record<string, number> = {};
      peserta.forEach(p => {
        if (p.school) schoolStats[p.school] = (schoolStats[p.school] || 0) + 1;
      });
      const topSchools = Object.entries(schoolStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      return {
        code: daerah.code,
        name: daerah.name,
        schoolCount: daerahSchools.length,
        registeredCount: daerahSchools.filter(s => s.isClaimed).length,
        totalRecords: daerahRecords.length,
        pesertaCount: peserta.length,
        pemimpinCount: pemimpin.length,
        penolongCount: penolong.length,
        pengujiCount: penguji.length,
        programCount: programList.length,
        programList,
        topSchools,
      };
    }).sort((a, b) => b.pesertaCount - a.pesertaCount);
  }, [targetDaerah, yearFilteredData, schools]);

  // Total agregat untuk header summary
  const totals = useMemo(() => {
    return matrix.reduce((acc, m) => ({
      schools: acc.schools + m.schoolCount,
      peserta: acc.peserta + m.pesertaCount,
      pemimpin: acc.pemimpin + m.pemimpinCount,
      penolong: acc.penolong + m.penolongCount,
      penguji: acc.penguji + m.pengujiCount,
      records: acc.records + m.totalRecords,
    }), { schools: 0, peserta: 0, pemimpin: 0, penolong: 0, penguji: 0, records: 0 });
  }, [matrix]);

  // Ringkasan per program (rentas semua daerah dalam scope)
  const programSummary = useMemo(() => {
    const summary: Record<string, { peserta: number; daerahCount: Set<string>; sekolahCount: Set<string>; }> = {};
    yearFilteredData.forEach(r => {
      if (!r.badge) return;
      if (selectedDaerah !== 'ALL' && r.daerahCode !== selectedDaerah) return;
      if (!summary[r.badge]) summary[r.badge] = { peserta: 0, daerahCount: new Set(), sekolahCount: new Set() };
      if (isPesertaRecord(r)) summary[r.badge].peserta++;
      if (r.daerahCode) summary[r.badge].daerahCount.add(r.daerahCode);
      if (r.school) summary[r.badge].sekolahCount.add(r.school);
    });
    return Object.entries(summary)
      .map(([name, s]) => ({
        name,
        peserta: s.peserta,
        daerahTerlibat: s.daerahCount.size,
        sekolahTerlibat: s.sekolahCount.size,
      }))
      .sort((a, b) => b.peserta - a.peserta);
  }, [yearFilteredData, selectedDaerah]);

  const handleExportMatrix = () => {
    const XLSX = (window as any).XLSX;
    if (!XLSX) {
      alert('Library Excel sedang dimuatkan. Sila cuba sebentar lagi.');
      return;
    }

    // Sheet 1: Ringkasan Daerah
    const sheet1 = matrix.map(m => ({
      Daerah: m.name,
      Kod: m.code,
      'Bil. Sekolah': m.schoolCount,
      'Sekolah Aktif': m.registeredCount,
      'Bil. Peserta': m.pesertaCount,
      'Bil. Pemimpin': m.pemimpinCount,
      'Bil. Penolong': m.penolongCount,
      'Bil. Penguji': m.pengujiCount,
      'Bil. Program': m.programCount,
      'Jumlah Rekod': m.totalRecords,
    }));

    // Sheet 2: Matrix Daerah x Program
    const matrixSheet: any[] = [];
    matrix.forEach(m => {
      const row: any = { Daerah: m.name, Kod: m.code };
      allPrograms.forEach(p => {
        const found = m.programList.find(x => x.name === p);
        row[p] = found ? found.peserta : 0;
      });
      row['JUMLAH'] = m.pesertaCount;
      matrixSheet.push(row);
    });

    // Sheet 3: Detail per program per daerah
    const detailSheet: any[] = [];
    matrix.forEach(m => {
      m.programList.forEach(p => {
        detailSheet.push({
          Daerah: m.name,
          Program: p.name,
          'Bil. Peserta': p.peserta,
          'Bil. Pemimpin': p.pemimpin,
          'Bil. Penolong': p.penolong,
          'Bil. Penguji': p.penguji,
          'Sekolah Terlibat': p.sekolahCount,
          'Tahun Dijalankan': p.tahunList.join(', '),
          'Jumlah Rekod': p.total,
        });
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet1), 'Ringkasan Daerah');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matrixSheet), 'Matrix Daerah x Program');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailSheet), 'Detail Program');

    const stamp = new Date().toISOString().split('T')[0];
    const yLabel = yearFilter === 'ALL' ? 'SEMUA' : yearFilter;
    const dLabel = selectedDaerah === 'ALL' ? 'SEMUA-DAERAH' : selectedDaerah;
    XLSX.writeFile(wb, `Analisis_Daerah_Program_${dLabel}_${yLabel}_${stamp}.xlsx`);
  };

  // Warna progress bar berdasarkan rank
  const getRankColor = (idx: number) => {
    if (idx === 0) return 'bg-amber-500';
    if (idx === 1) return 'bg-slate-400';
    if (idx === 2) return 'bg-orange-400';
    return 'bg-blue-500';
  };

  const maxPesertaInDaerah = Math.max(...matrix.map(m => m.pesertaCount), 1);
  const maxPesertaInProgram = Math.max(...programSummary.map(p => p.peserta), 1);

  return (
    <div className="space-y-6">
      {/* Header & Filter */}
      <div className="bg-white rounded-xl shadow border border-gray-200 p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg">
              <Activity size={20} className="text-emerald-600" />
              Analisis Daerah & Program {negeriName ? `· ${negeriName}` : ''}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {selectedDaerah === 'ALL'
                ? `Memaparkan ${matrix.length} daerah dengan ${allPrograms.length} program`
                : `Skop: ${matrix[0]?.name || selectedDaerah} sahaja`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full pl-3 pr-1.5 py-1">
              <Calendar size={14} className="text-emerald-700" />
              <span className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider">Tahun</span>
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                className="bg-white border border-emerald-200 rounded-full px-3 py-1.5 text-xs font-bold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <option value="ALL">Semua Tahun</option>
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button
              onClick={handleExportMatrix}
              disabled={matrix.length === 0}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-xs font-bold px-3 py-2 rounded-lg transition"
              title="Eksport ke Excel (3 sheet)"
            >
              <FileSpreadsheet size={14} /> Eksport Excel
            </button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-5">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">Daerah</div>
            <div className="text-2xl font-bold text-blue-900 mt-1">{matrix.length}</div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-purple-600 tracking-wider">Sekolah</div>
            <div className="text-2xl font-bold text-purple-900 mt-1">{totals.schools}</div>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Peserta</div>
            <div className="text-2xl font-bold text-emerald-900 mt-1">{totals.peserta}</div>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-amber-600 tracking-wider">Pemimpin</div>
            <div className="text-2xl font-bold text-amber-900 mt-1">{totals.pemimpin}</div>
          </div>
          <div className="bg-gradient-to-br from-rose-50 to-rose-100 border border-rose-200 rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-rose-600 tracking-wider">Penguji</div>
            <div className="text-2xl font-bold text-rose-900 mt-1">{totals.penguji}</div>
          </div>
          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-indigo-600 tracking-wider">Program</div>
            <div className="text-2xl font-bold text-indigo-900 mt-1">{allPrograms.length}</div>
          </div>
        </div>
      </div>

      {/* Ringkasan Per Program */}
      <div className="bg-white rounded-xl shadow border border-gray-200 p-5">
        <h3 className="font-bold text-gray-800 flex items-center gap-2 text-base mb-4">
          <Award size={18} className="text-purple-600" />
          Ringkasan Per Program
        </h3>
        {programSummary.length === 0 ? (
          <p className="text-sm text-gray-400 italic text-center py-6">Tiada rekod program untuk skop yang dipilih.</p>
        ) : (
          <div className="space-y-2">
            {programSummary.map((p, idx) => (
              <div key={p.name} className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50 transition">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ${getRankColor(idx)}`}>
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm text-gray-800 truncate">{p.name}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {p.daerahTerlibat} daerah · {p.sekolahTerlibat} sekolah terlibat
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-purple-700">{p.peserta}</div>
                    <div className="text-[10px] text-gray-500">peserta</div>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-purple-600 h-1.5 rounded-full transition-all"
                    style={{ width: `${(p.peserta / maxPesertaInProgram) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Per Daerah - Expandable */}
      <div className="bg-white rounded-xl shadow border border-gray-200 p-5">
        <h3 className="font-bold text-gray-800 flex items-center gap-2 text-base mb-4">
          <MapPin size={18} className="text-blue-600" />
          Pecahan Per Daerah
          <span className="ml-auto text-[11px] font-normal text-gray-500">Klik daerah untuk lihat program & sekolah terlibat</span>
        </h3>

        {matrix.length === 0 ? (
          <p className="text-sm text-gray-400 italic text-center py-6">Tiada daerah dalam skop ini.</p>
        ) : (
          <div className="space-y-3">
            {matrix.map((d, idx) => {
              const isExpanded = expandedDaerah === d.code;
              return (
                <div key={d.code} className={`border rounded-lg transition ${isExpanded ? 'border-blue-300 shadow-md bg-blue-50/30' : 'border-gray-200 hover:border-blue-200'}`}>
                  <button
                    onClick={() => setExpandedDaerah(isExpanded ? null : d.code)}
                    className="w-full text-left p-4"
                  >
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${getRankColor(idx)}`}>
                          {idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-gray-800 truncate">{d.name}</div>
                          <div className="text-[11px] text-gray-500 font-mono uppercase">{d.code}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right hidden sm:block">
                          <div className="text-[9px] uppercase text-gray-400 font-bold">Sekolah</div>
                          <div className="text-sm font-bold text-gray-700">{d.schoolCount}</div>
                        </div>
                        <div className="text-right hidden sm:block">
                          <div className="text-[9px] uppercase text-gray-400 font-bold">Program</div>
                          <div className="text-sm font-bold text-indigo-700">{d.programCount}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] uppercase text-gray-400 font-bold">Peserta</div>
                          <div className="text-lg font-bold text-emerald-700">{d.pesertaCount}</div>
                        </div>
                        {isExpanded
                          ? <ChevronUp size={18} className="text-blue-600" />
                          : <ChevronDown size={18} className="text-gray-400" />}
                      </div>
                    </div>

                    {/* Progress bar bandingkan dengan daerah teratas */}
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all ${getRankColor(idx)}`}
                        style={{ width: `${(d.pesertaCount / maxPesertaInDaerah) * 100}%` }}
                      />
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-blue-200 mt-2 pt-4 space-y-4 animate-[fadeIn_0.2s_ease-out]">
                      {/* Stats peranan */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        <div className="bg-white border border-gray-200 rounded-lg p-2 text-center">
                          <div className="text-[9px] uppercase font-bold text-gray-400">Peserta</div>
                          <div className="text-base font-bold text-emerald-700">{d.pesertaCount}</div>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-lg p-2 text-center">
                          <div className="text-[9px] uppercase font-bold text-gray-400">Pemimpin</div>
                          <div className="text-base font-bold text-amber-700">{d.pemimpinCount}</div>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-lg p-2 text-center">
                          <div className="text-[9px] uppercase font-bold text-gray-400">Penolong</div>
                          <div className="text-base font-bold text-orange-700">{d.penolongCount}</div>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-lg p-2 text-center">
                          <div className="text-[9px] uppercase font-bold text-gray-400">Penguji</div>
                          <div className="text-base font-bold text-rose-700">{d.pengujiCount}</div>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-lg p-2 text-center">
                          <div className="text-[9px] uppercase font-bold text-gray-400">Sekolah Aktif</div>
                          <div className="text-base font-bold text-purple-700">{d.registeredCount}/{d.schoolCount}</div>
                        </div>
                      </div>

                      {/* Program yang dijalankan */}
                      <div>
                        <h4 className="font-bold text-xs text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Award size={12} className="text-purple-600" />
                          Program Dijalankan ({d.programList.length})
                        </h4>
                        {d.programList.length === 0 ? (
                          <p className="text-xs text-gray-400 italic px-2">Belum ada program dijalankan untuk daerah ini.</p>
                        ) : (
                          <div className="overflow-x-auto border rounded-lg">
                            <table className="w-full text-xs">
                              <thead className="bg-slate-50 border-b">
                                <tr>
                                  <th className="text-left px-3 py-2 font-bold text-slate-700">Program</th>
                                  <th className="text-center px-3 py-2 font-bold text-slate-700">Peserta</th>
                                  <th className="text-center px-3 py-2 font-bold text-slate-700">Pemimpin</th>
                                  <th className="text-center px-3 py-2 font-bold text-slate-700">Penolong</th>
                                  <th className="text-center px-3 py-2 font-bold text-slate-700">Penguji</th>
                                  <th className="text-center px-3 py-2 font-bold text-slate-700">Sekolah</th>
                                  <th className="text-center px-3 py-2 font-bold text-slate-700">Tahun</th>
                                </tr>
                              </thead>
                              <tbody>
                                {d.programList.map((p, i) => (
                                  <tr key={p.name} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                    <td className="px-3 py-2 font-medium text-gray-800">{p.name}</td>
                                    <td className="px-3 py-2 text-center font-bold text-emerald-700">{p.peserta}</td>
                                    <td className="px-3 py-2 text-center text-amber-700">{p.pemimpin}</td>
                                    <td className="px-3 py-2 text-center text-orange-700">{p.penolong}</td>
                                    <td className="px-3 py-2 text-center text-rose-700">{p.penguji}</td>
                                    <td className="px-3 py-2 text-center text-purple-700">{p.sekolahCount}</td>
                                    <td className="px-3 py-2 text-center text-gray-600 text-[10px]">
                                      {p.tahunList.join(', ')}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-blue-50 border-t-2 border-blue-200 font-bold">
                                  <td className="px-3 py-2 text-blue-900">JUMLAH</td>
                                  <td className="px-3 py-2 text-center text-emerald-800">{d.pesertaCount}</td>
                                  <td className="px-3 py-2 text-center text-amber-800">{d.pemimpinCount}</td>
                                  <td className="px-3 py-2 text-center text-orange-800">{d.penolongCount}</td>
                                  <td className="px-3 py-2 text-center text-rose-800">{d.pengujiCount}</td>
                                  <td className="px-3 py-2 text-center text-purple-800">—</td>
                                  <td className="px-3 py-2 text-center text-gray-700">—</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Top 5 sekolah */}
                      {d.topSchools.length > 0 && (
                        <div>
                          <h4 className="font-bold text-xs text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <TrendingUp size={12} className="text-orange-600" />
                            5 Sekolah Paling Aktif
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {d.topSchools.map(([name, count], si) => (
                              <div key={name} className="flex items-center justify-between gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${getRankColor(si)}`}>
                                    {si + 1}
                                  </span>
                                  <span className="text-xs font-medium text-gray-700 truncate">{name}</span>
                                </div>
                                <span className="text-xs font-bold text-emerald-700 shrink-0">{count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Matrix Daerah x Program */}
      {selectedDaerah === 'ALL' && matrix.length > 0 && allPrograms.length > 0 && (
        <div className="bg-white rounded-xl shadow border border-gray-200 p-5">
          <h3 className="font-bold text-gray-800 flex items-center gap-2 text-base mb-4">
            <BarChart3 size={18} className="text-indigo-600" />
            Matrix Daerah × Program
            <span className="ml-auto text-[11px] font-normal text-gray-500">Bilangan peserta setiap program di setiap daerah</span>
          </h3>
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-bold text-slate-700 sticky left-0 bg-slate-100 z-10 border-r">Daerah</th>
                  {allPrograms.map(p => (
                    <th key={p} className="text-center px-3 py-2 font-bold text-slate-700 min-w-[110px]" title={p}>
                      <div className="truncate max-w-[140px]">{p}</div>
                    </th>
                  ))}
                  <th className="text-center px-3 py-2 font-bold text-blue-900 bg-blue-100 border-l">JUMLAH</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((d, i) => (
                  <tr key={d.code} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="px-3 py-2 font-bold text-gray-800 sticky left-0 z-10 border-r" style={{ background: i % 2 === 0 ? 'white' : 'rgb(248 250 252 / 0.5)' }}>
                      {d.name}
                      <div className="text-[9px] font-mono text-gray-500 font-normal">{d.code}</div>
                    </td>
                    {allPrograms.map(p => {
                      const found = d.programList.find(x => x.name === p);
                      const value = found?.peserta || 0;
                      return (
                        <td key={p} className="px-3 py-2 text-center">
                          {value > 0 ? (
                            <span className="inline-block bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">
                              {value}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center font-bold text-blue-900 bg-blue-50 border-l">
                      {d.pesertaCount}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-blue-100 border-t-2 border-blue-300 font-bold">
                  <td className="px-3 py-2 text-blue-900 sticky left-0 bg-blue-100 z-10 border-r">JUMLAH</td>
                  {allPrograms.map(p => {
                    const total = matrix.reduce((sum, d) => {
                      const found = d.programList.find(x => x.name === p);
                      return sum + (found?.peserta || 0);
                    }, 0);
                    return (
                      <td key={p} className="px-3 py-2 text-center text-blue-900">{total}</td>
                    );
                  })}
                  <td className="px-3 py-2 text-center text-blue-900 bg-blue-200 border-l">
                    {totals.peserta}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DaerahProgramAnalysis;
