import React, { useEffect, useMemo, useState } from 'react';
import { Wallet, Shirt, Loader, RefreshCw, Download } from 'lucide-react';
import { SubmissionData } from '../types';
import { getProgramSettings, getProgramFeeOverrides, ProgramSetting, ProgramFeeOverride } from '../services/supabaseApi';
import { buildProgramSummary, formatRM, SHIRT_SIZES, SHIRT_TYPES, SchoolSummary } from '../services/programSummary';

interface ProgramSummaryViewProps {
  records: SubmissionData[];
  year: number;
  mode: 'school' | 'admin';
}

// Susun saiz ikut urutan standard (budak dulu, kemudian dewasa), label lain di hujung
const orderSizes = (sizes: string[]): string[] => {
  const known = SHIRT_SIZES.filter(s => sizes.includes(s));
  const others = sizes.filter(s => !SHIRT_SIZES.includes(s as any)).sort();
  return [...known, ...others];
};
const orderTypes = (types: string[]): string[] => {
  const known = SHIRT_TYPES.filter(t => types.includes(t));
  const others = types.filter(t => !SHIRT_TYPES.includes(t as any)).sort();
  return [...known, ...others];
};

export const ProgramSummaryView: React.FC<ProgramSummaryViewProps> = ({ records, year, mode }) => {
  const [settings, setSettings] = useState<ProgramSetting[]>([]);
  const [feeOverrides, setFeeOverrides] = useState<ProgramFeeOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'bayaran' | 'baju'>('bayaran');

  const loadSettings = async () => {
    setLoading(true);
    const [data, overrides] = await Promise.all([
      getProgramSettings(year),
      getProgramFeeOverrides(),
    ]);
    setSettings(data);
    setFeeOverrides(overrides);
    setLoading(false);
  };

  useEffect(() => { loadSettings(); }, [year]);

  const summary = useMemo(
    () => buildProgramSummary(records, settings, year, feeOverrides),
    [records, settings, year, feeOverrides],
  );

  // Rumusan kini dipecah per program x siri kerana yuran boleh berbeza antara
  // siri. Untuk program tanpa siri semuanya Siri 1, jadi label disembunyikan.
  const labelSiri = (siri: number) => (siri > 1 ? ` · Siri ${siri}` : '');

  const grandTotalAll = summary.reduce((sum, s) => sum + s.grandTotal, 0);
  const anyPayment = summary.some(s => s.programs.some(p => p.paymentEnabled));
  const anyShirt = summary.some(s => s.programs.some(p => p.shirtEnabled));

  // Default tab: jika tiada bayaran tapi ada baju, mula di tab Baju
  useEffect(() => {
    if (!anyPayment && anyShirt) setTab('baju');
    else if (anyPayment) setTab('bayaran');
  }, [anyPayment, anyShirt]);

  // Agregat saiz baju seluruh skop: jenis -> saiz -> jumlah
  const aggShirt = useMemo(() => {
    const agg: Record<string, Record<string, number>> = {};
    summary.forEach(s => {
      Object.entries(s.shirtByType).forEach(([type, sizes]) => {
        if (!agg[type]) agg[type] = {};
        Object.entries(sizes).forEach(([size, n]) => { agg[type][size] = (agg[type][size] || 0) + n; });
      });
    });
    return agg;
  }, [summary]);

  const aggSizeCols = useMemo(() => {
    const set = new Set<string>();
    Object.values(aggShirt).forEach(sizes => Object.keys(sizes).forEach(s => set.add(s)));
    return orderSizes([...set]);
  }, [aggShirt]);
  const aggTypeRows = orderTypes(Object.keys(aggShirt));

  const handleExport = () => {
    const headers = ['Sekolah', 'Program', 'Peserta', 'Pemimpin', 'Penolong', 'Pembantu', 'Jumlah (RM)', 'Jenis Baju', 'Saiz', 'Bilangan'];
    const rows: string[] = [headers.join(',')];
    summary.forEach(school => {
      school.programs.forEach(p => {
        const typeEntries = Object.entries(p.shirtByType);
        if (typeEntries.length === 0) {
          rows.push([`"${school.schoolName}"`, `"${p.badge}${labelSiri(p.siri)}"`, p.countPeserta, p.countPemimpin, p.countPenolong, p.countPembantu, p.total.toFixed(2), '', '', ''].join(','));
        } else {
          typeEntries.forEach(([type, sizes]) => {
            Object.entries(sizes).forEach(([size, n]) => {
              rows.push([`"${school.schoolName}"`, `"${p.badge}${labelSiri(p.siri)}"`, p.countPeserta, p.countPemimpin, p.countPenolong, p.countPembantu, p.total.toFixed(2), `"${type}"`, `"${size}"`, n].join(','));
            });
          });
        }
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

  const ShirtByTypeBlock = ({ byType }: { byType: Record<string, Record<string, number>> }) => (
    <div className="space-y-2">
      {orderTypes(Object.keys(byType)).map(type => (
        <div key={type}>
          <p className="text-xs font-bold text-indigo-700">{type}</p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {orderSizes(Object.keys(byType[type])).map(size => (
              <span key={size} className={`px-2 py-1 rounded text-xs font-semibold border ${size.includes('belum') ? 'bg-red-50 text-red-600 border-red-200' : 'bg-indigo-50 text-indigo-700 border-indigo-100'}`}>
                {size}: <span className="font-black">{byType[type][size]}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

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

      {/* Tab Bayaran / Baju */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setTab('bayaran')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-2 -mb-px transition ${tab === 'bayaran' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          <Wallet size={16} /> Bayaran
        </button>
        <button
          onClick={() => setTab('baju')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-2 -mb-px transition ${tab === 'baju' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          <Shirt size={16} /> Saiz Baju
        </button>
      </div>

      {/* ============ TAB BAYARAN ============ */}
      {tab === 'bayaran' && !anyPayment && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center text-gray-400">
          <Wallet size={36} className="mx-auto mb-2 opacity-30" /><p className="italic">Tiada program berbayar untuk tahun ini.</p>
        </div>
      )}

      {tab === 'bayaran' && anyPayment && (
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl p-5 shadow flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider opacity-90">{mode === 'school' ? 'Jumlah Yuran Anda' : 'Jumlah Kutipan Dijangka'}</p>
            <h3 className="text-3xl font-black mt-1">{formatRM(grandTotalAll)}</h3>
          </div>
          <Wallet size={48} className="opacity-30" />
        </div>
      )}

      {/* TAB BAYARAN — SCHOOL MODE */}
      {tab === 'bayaran' && mode === 'school' && summary.map(school => (
        <div key={school.schoolCode} className="space-y-4">
          {school.programs.filter(p => p.paymentEnabled).map(p => (
            <div key={`${p.badge}-${p.siri}`} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b">
                <h3 className="font-bold text-slate-800">{p.badge}{labelSiri(p.siri)}</h3>
              </div>
              <div className="p-4">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {[
                      { label: 'Peserta', count: p.countPeserta, fee: p.feePeserta, sub: p.subtotalPeserta },
                      { label: 'Pemimpin', count: p.countPemimpin, fee: p.feePemimpin, sub: p.subtotalPemimpin },
                      { label: 'Penolong Pemimpin', count: p.countPenolong, fee: p.feePenolong, sub: p.subtotalPenolong },
                      { label: 'Pembantu', count: p.countPembantu, fee: p.feePembantu, sub: p.subtotalPembantu },
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
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* TAB BAYARAN — ADMIN MODE */}
      {tab === 'bayaran' && anyPayment && mode === 'admin' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 uppercase text-xs text-slate-700 border-b">
              <tr>
                <th className="px-4 py-3">Sekolah</th>
                <th className="px-4 py-3">Program</th>
                <th className="px-4 py-3 text-center">Peserta</th>
                <th className="px-4 py-3 text-center">Pemimpin</th>
                <th className="px-4 py-3 text-center">Penolong</th>
                <th className="px-4 py-3 text-center">Pembantu</th>
                <th className="px-4 py-3 text-right">Jumlah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summary.filter(s => s.programs.some(p => p.paymentEnabled)).map(school => {
                const payPrograms = school.programs.filter(p => p.paymentEnabled);
                return payPrograms.map((p, idx) => (
                  <tr key={`${school.schoolCode}-${p.badge}-${p.siri}`} className="hover:bg-slate-50">
                    {idx === 0 && (
                      <td className="px-4 py-2 font-medium text-gray-700 align-top" rowSpan={payPrograms.length}>
                        {school.schoolName}
                        <div className="text-xs text-emerald-600 font-bold mt-0.5">{formatRM(school.grandTotal)}</div>
                      </td>
                    )}
                    <td className="px-4 py-2 text-gray-600">{p.badge}{labelSiri(p.siri)}</td>
                    <td className="px-4 py-2 text-center">{p.countPeserta}</td>
                    <td className="px-4 py-2 text-center">{p.countPemimpin}</td>
                    <td className="px-4 py-2 text-center">{p.countPenolong}</td>
                    <td className="px-4 py-2 text-center">{p.countPembantu}</td>
                    <td className="px-4 py-2 text-right font-semibold text-emerald-700">{formatRM(p.total)}</td>
                  </tr>
                ));
              })}
            </tbody>
            <tfoot className="bg-gray-800 text-white font-bold">
              <tr>
                <td className="px-4 py-3 uppercase text-xs" colSpan={6}>Jumlah Kutipan Dijangka</td>
                <td className="px-4 py-3 text-right text-yellow-400">{formatRM(grandTotalAll)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ============ TAB BAJU ============ */}
      {tab === 'baju' && !anyShirt && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center text-gray-400">
          <Shirt size={36} className="mx-auto mb-2 opacity-30" /><p className="italic">Tiada program dengan saiz baju untuk tahun ini.</p>
        </div>
      )}

      {/* TAB BAJU — SCHOOL MODE */}
      {tab === 'baju' && mode === 'school' && summary.map(school => (
        <div key={school.schoolCode} className="space-y-4">
          {school.programs.filter(p => p.shirtEnabled).map(p => (
            <div key={`${p.badge}-${p.siri}`} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b flex justify-between items-center">
                <h3 className="font-bold text-slate-800">{p.badge}{labelSiri(p.siri)}</h3>
                <span className="text-xs text-indigo-600 font-bold">{p.shirtCount} baju</span>
              </div>
              <div className="p-4">
                {Object.keys(p.shirtByType).length === 0
                  ? <span className="text-xs text-gray-400 italic">Tiada data</span>
                  : <ShirtByTypeBlock byType={p.shirtByType} />}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* TAB BAJU — ADMIN MODE: agregat jenis × saiz */}
      {tab === 'baju' && anyShirt && mode === 'admin' && aggTypeRows.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <div className="px-4 py-3 border-b bg-indigo-50 font-bold text-indigo-800 flex items-center gap-2"><Shirt size={16} /> Agregat Saiz Baju (untuk tempahan)</div>
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 uppercase text-xs text-slate-700 border-b">
              <tr>
                <th className="px-4 py-3">Jenis Baju</th>
                {aggSizeCols.map(sz => <th key={sz} className="px-3 py-3 text-center">{sz}</th>)}
                <th className="px-3 py-3 text-center bg-indigo-100">Jumlah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {aggTypeRows.map(type => {
                const rowTotal = Object.values(aggShirt[type]).reduce((a, b) => a + b, 0);
                return (
                  <tr key={type} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-gray-700">{type}</td>
                    {aggSizeCols.map(sz => <td key={sz} className="px-3 py-2 text-center text-gray-600">{aggShirt[type][sz] || ''}</td>)}
                    <td className="px-3 py-2 text-center font-bold bg-indigo-50 text-indigo-700">{rowTotal}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-800 text-white font-bold">
              <tr>
                <td className="px-4 py-3 uppercase text-xs">Jumlah</td>
                {aggSizeCols.map(sz => {
                  const tot = aggTypeRows.reduce((s, t) => s + (aggShirt[t][sz] || 0), 0);
                  return <td key={sz} className="px-3 py-3 text-center">{tot || ''}</td>;
                })}
                <td className="px-3 py-3 text-center text-yellow-400">{aggTypeRows.reduce((s, t) => s + Object.values(aggShirt[t]).reduce((a, b) => a + b, 0), 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};
