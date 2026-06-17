import React, { useEffect, useMemo, useState } from 'react';
import { Wallet, Shirt, Loader, RefreshCw, Download } from 'lucide-react';
import { SubmissionData } from '../types';
import { getProgramSettings, ProgramSetting } from '../services/supabaseApi';
import { buildProgramSummary, formatRM, SHIRT_SIZES, SchoolSummary } from '../services/programSummary';

interface ProgramSummaryViewProps {
  records: SubmissionData[];
  year: number;
  mode: 'school' | 'admin';
}

export const ProgramSummaryView: React.FC<ProgramSummaryViewProps> = ({ records, year, mode }) => {
  const [settings, setSettings] = useState<ProgramSetting[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSettings = async () => {
    setLoading(true);
    const data = await getProgramSettings(year);
    setSettings(data);
    setLoading(false);
  };

  useEffect(() => { loadSettings(); }, [year]);

  const summary = useMemo(
    () => buildProgramSummary(records, settings, year),
    [records, settings, year],
  );

  // Saiz baju yang aktif (ada digunakan) untuk lajur dinamik
  const activeShirtSizes = useMemo(() => {
    const set = new Set<string>();
    summary.forEach(s => Object.keys(s.shirtTotals).forEach(k => set.add(k)));
    const ordered = [...SHIRT_SIZES.filter(sz => set.has(sz)), ...(set.has('(Belum diisi)') ? ['(Belum diisi)'] : [])];
    return ordered;
  }, [summary]);

  const grandTotalAll = summary.reduce((sum, s) => sum + s.grandTotal, 0);
  const anyPayment = summary.some(s => s.programs.some(p => p.paymentEnabled));
  const anyShirt = summary.some(s => s.programs.some(p => p.shirtEnabled));

  const handleExport = () => {
    const headers = ['Sekolah', 'Program', 'Peserta', 'Pemimpin', 'Penolong', 'Jumlah (RM)', ...activeShirtSizes.map(s => `Baju ${s}`)];
    const rows: string[] = [headers.join(',')];
    summary.forEach(school => {
      school.programs.forEach(p => {
        const shirtCols = activeShirtSizes.map(sz => p.shirtSizes[sz] || 0);
        rows.push([
          `"${school.schoolName}"`, `"${p.badge}"`,
          p.countPeserta, p.countPemimpin, p.countPenolong,
          p.total.toFixed(2), ...shirtCols,
        ].join(','));
      });
    });
    const BOM = '﻿';
    const blob = new Blob([BOM + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Rumusan_Bayaran_Baju_${year}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader className="animate-spin text-slate-400" size={32} /></div>;
  }

  if (summary.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-400">
        <Wallet size={40} className="mx-auto mb-3 opacity-30" />
        <p className="font-semibold text-gray-500">Tiada rumusan untuk tahun {year}</p>
        <p className="text-xs mt-1">Tiada program berbayar atau program dengan saiz baju yang diaktifkan untuk data ini.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="font-bold text-gray-800 flex items-center gap-2 text-lg">
          <Wallet size={20} className="text-emerald-600" /> Rumusan Bayaran &amp; Saiz Baju {year}
        </h2>
        <div className="flex gap-2">
          <button onClick={handleExport} className="flex items-center gap-1 text-emerald-600 hover:bg-emerald-50 px-2 py-1.5 rounded transition text-xs font-bold" title="Export CSV">
            <Download size={14} /> Export
          </button>
          <button onClick={loadSettings} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition" title="Muat semula">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Kad jumlah keseluruhan (jika ada bayaran) */}
      {anyPayment && (
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl p-5 shadow flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider opacity-90">{mode === 'school' ? 'Jumlah Yuran Anda' : 'Jumlah Kutipan Dijangka'}</p>
            <h3 className="text-3xl font-black mt-1">{formatRM(grandTotalAll)}</h3>
          </div>
          <Wallet size={48} className="opacity-30" />
        </div>
      )}

      {/* SCHOOL MODE: papar setiap program secara terperinci */}
      {mode === 'school' && summary.map(school => (
        <div key={school.schoolCode} className="space-y-4">
          {school.programs.map(p => (
            <div key={p.badge} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b flex flex-wrap justify-between items-center gap-2">
                <h3 className="font-bold text-slate-800">{p.badge}</h3>
                <div className="flex gap-2">
                  {p.paymentEnabled && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">BERBAYAR</span>}
                  {p.shirtEnabled && <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">SAIZ BAJU</span>}
                </div>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Bayaran */}
                {p.paymentEnabled && (
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1"><Wallet size={12} /> Bayaran</p>
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-gray-100">
                        {[
                          { label: 'Peserta', count: p.countPeserta, fee: p.feePeserta, sub: p.subtotalPeserta },
                          { label: 'Pemimpin', count: p.countPemimpin, fee: p.feePemimpin, sub: p.subtotalPemimpin },
                          { label: 'Penolong Pemimpin', count: p.countPenolong, fee: p.feePenolong, sub: p.subtotalPenolong },
                        ].filter(r => r.count > 0 || (r.fee !== null && r.fee !== undefined)).map(r => (
                          <tr key={r.label}>
                            <td className="py-1.5 text-gray-600">{r.label}</td>
                            <td className="py-1.5 text-center text-gray-500">{r.count} × {r.fee !== null && r.fee !== undefined ? formatRM(r.fee) : '-'}</td>
                            <td className="py-1.5 text-right font-semibold text-gray-800">{formatRM(r.sub)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-200">
                          <td colSpan={2} className="py-2 text-right font-bold text-gray-700 uppercase text-xs">Jumlah</td>
                          <td className="py-2 text-right font-black text-emerald-600">{formatRM(p.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
                {/* Saiz baju */}
                {p.shirtEnabled && (
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1"><Shirt size={12} /> Saiz Baju</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.keys(p.shirtSizes).length === 0 && <span className="text-xs text-gray-400 italic">Tiada data</span>}
                      {[...SHIRT_SIZES, '(Belum diisi)'].filter(sz => p.shirtSizes[sz]).map(sz => (
                        <div key={sz} className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${sz === '(Belum diisi)' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-indigo-50 text-indigo-700 border-indigo-100'}`}>
                          {sz}: <span className="font-black">{p.shirtSizes[sz]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* ADMIN MODE: jadual ringkas semua sekolah */}
      {mode === 'admin' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 uppercase text-xs text-slate-700 border-b">
              <tr>
                <th className="px-4 py-3">Sekolah</th>
                <th className="px-4 py-3">Program</th>
                <th className="px-4 py-3 text-center">Peserta</th>
                <th className="px-4 py-3 text-center">Pemimpin</th>
                <th className="px-4 py-3 text-center">Penolong</th>
                {anyPayment && <th className="px-4 py-3 text-right">Jumlah</th>}
                {anyShirt && activeShirtSizes.map(sz => <th key={sz} className="px-3 py-3 text-center">{sz}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summary.map(school =>
                school.programs.map((p, idx) => (
                  <tr key={`${school.schoolCode}-${p.badge}`} className="hover:bg-slate-50">
                    {idx === 0 && (
                      <td className="px-4 py-2 font-medium text-gray-700 align-top" rowSpan={school.programs.length}>
                        {school.schoolName}
                        {anyPayment && <div className="text-xs text-emerald-600 font-bold mt-0.5">{formatRM(school.grandTotal)}</div>}
                      </td>
                    )}
                    <td className="px-4 py-2 text-gray-600">{p.badge}</td>
                    <td className="px-4 py-2 text-center">{p.countPeserta}</td>
                    <td className="px-4 py-2 text-center">{p.countPemimpin}</td>
                    <td className="px-4 py-2 text-center">{p.countPenolong}</td>
                    {anyPayment && <td className="px-4 py-2 text-right font-semibold text-emerald-700">{p.paymentEnabled ? formatRM(p.total) : '-'}</td>}
                    {anyShirt && activeShirtSizes.map(sz => <td key={sz} className="px-3 py-2 text-center text-gray-600">{p.shirtSizes[sz] || ''}</td>)}
                  </tr>
                )),
              )}
            </tbody>
            {anyPayment && (
              <tfoot className="bg-gray-800 text-white font-bold">
                <tr>
                  <td className="px-4 py-3 uppercase text-xs" colSpan={5}>Jumlah Kutipan Dijangka</td>
                  <td className="px-4 py-3 text-right text-yellow-400">{formatRM(grandTotalAll)}</td>
                  {anyShirt && activeShirtSizes.map(sz => {
                    const tot = summary.reduce((s, sc) => s + (sc.shirtTotals[sz] || 0), 0);
                    return <td key={sz} className="px-3 py-3 text-center">{tot || ''}</td>;
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
};
