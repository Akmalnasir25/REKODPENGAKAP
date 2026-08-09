import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw, Wallet, Download, Search } from 'lucide-react';
import { getRumusanBayaran, BarisRumusanBayaran } from '../services/paymentService';
import { formatRM } from '../services/programSummary';
import { tarikhPendek } from '../utils/tarikh';
import { LoadingSpinner } from './ui/LoadingSpinner';

// ============================================================
// Rumusan Bayaran — apa yang sebenarnya masuk, dari siapa.
//
// Tab Pengesahan menunjukkan bayaran yang memerlukan TINDAKAN. Tab ini
// menunjukkan keseluruhan gambar: setiap bayaran, setiap siri, setiap kaedah.
// Keduanya diperlukan, dan mencampurkannya akan menjadikan barisan tindakan
// mustahil dibaca sebaik kutipan bertambah.
//
// Tiada penapisan skop di sini. RLS pada `payments` sudah mengehadkan admin
// daerah kepada daerahnya sendiri.
// ============================================================

const namaKaedah = (m: string) =>
  m === 'toyyibpay' ? 'FPX / Online'
  : m === 'bank_transfer' ? 'Pindahan Bank'
  : m === 'cheque' ? 'Cek'
  : m === 'cash' ? 'Tunai'
  : m;

const LENCANA_STATUS: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  pending_review: 'bg-blue-100 text-blue-800 border-blue-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

const namaStatus: Record<string, string> = {
  paid: 'Dibayar',
  pending: 'Menunggu',
  pending_review: 'Semakan',
  failed: 'Gagal',
  rejected: 'Ditolak',
  cancelled: 'Dibatalkan',
};

export const AdminPaymentsTab: React.FC = () => {
  const tahunKini = new Date().getFullYear();
  const [baris, setBaris] = useState<BarisRumusanBayaran[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [tahun, setTahun] = useState(tahunKini);
  const [fProgram, setFProgram] = useState('');
  const [fSiri, setFSiri] = useState('');
  const [fStatus, setFStatus] = useState('paid');
  const [fKaedah, setFKaedah] = useState('');
  const [fJenis, setFJenis] = useState('');
  const [carian, setCarian] = useState('');

  const muat = useCallback(async () => {
    setMemuat(true);
    setBaris(await getRumusanBayaran(tahun));
    setMemuat(false);
  }, [tahun]);
  useEffect(() => { muat(); }, [muat]);

  const programList = useMemo(
    () => Array.from(new Set(baris.map(r => r.badgeName))).sort(),
    [baris]);
  const siriList = useMemo(
    () => Array.from(new Set(baris.map(r => r.siri))).sort((a, b) => a - b),
    [baris]);

  const ditapis = useMemo(() => baris.filter(r => {
    if (fProgram && r.badgeName !== fProgram) return false;
    if (fSiri && r.siri !== Number(fSiri)) return false;
    if (fStatus && r.status !== fStatus) return false;
    if (fKaedah && r.method !== fKaedah) return false;
    if (fJenis && (r.schoolType || 'lain') !== fJenis) return false;
    if (carian.trim()) {
      const c = carian.trim().toLowerCase();
      const padan = `${r.schoolName} ${r.schoolCode ?? ''} ${r.referenceNumber ?? ''} ${r.billCode ?? ''}`.toLowerCase();
      if (!padan.includes(c)) return false;
    }
    return true;
  }), [baris, fProgram, fSiri, fStatus, fKaedah, fJenis, carian]);

  // Ringkasan dikira daripada baris DITAPIS, bukan keseluruhan set — angka
  // mesti sepadan dengan jadual di bawahnya, jika tidak ia mengelirukan.
  const ringkasan = useMemo(() => {
    const jumlahYuran = ditapis.reduce((n, r) => n + r.amount, 0);
    const jumlahDibayar = ditapis.reduce((n, r) => n + r.totalAmount, 0);
    const caj = ditapis.reduce((n, r) => n + r.transactionFee, 0);
    const sekolah = new Set(ditapis.map(r => r.schoolName)).size;
    const orang = ditapis.reduce((n, r) => n + r.bilPeserta + r.bilPemimpin + r.bilPenolong, 0);
    const ikutKaedah = ditapis.reduce((acc: Record<string, { bil: number; jumlah: number }>, r) => {
      const k = r.method;
      acc[k] = acc[k] || { bil: 0, jumlah: 0 };
      acc[k].bil++;
      acc[k].jumlah += r.totalAmount;
      return acc;
    }, {});
    return { jumlahYuran, jumlahDibayar, caj, sekolah, orang, ikutKaedah };
  }, [ditapis]);

  const muatTurunCSV = () => {
    const tajuk = ['Sekolah', 'Kod', 'Jenis', 'Daerah', 'Program', 'Siri', 'Peserta', 'Pemimpin',
      'Penolong', 'Yuran (RM)', 'Caj (RM)', 'Jumlah (RM)', 'Kaedah', 'Status', 'Rujukan', 'Kod Bil', 'Tarikh Bayar'];
    const sel = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const isi = ditapis.map(r => [
      r.schoolName, r.schoolCode, r.schoolType, r.daerahName, r.badgeName, r.siri,
      r.bilPeserta, r.bilPemimpin, r.bilPenolong,
      r.amount.toFixed(2), r.transactionFee.toFixed(2), r.totalAmount.toFixed(2),
      namaKaedah(r.method), namaStatus[r.status] || r.status,
      r.referenceNumber, r.billCode, r.paidAt ? tarikhPendek(r.paidAt) : '',
    ].map(sel).join(','));
    // BOM supaya Excel membaca aksara Melayu dengan betul.
    const blob = new Blob(['﻿' + [tajuk.map(sel).join(','), ...isi].join('\n')],
      { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Rumusan_Bayaran_${tahun}${fProgram ? '_' + fProgram.replace(/\s+/g, '_') : ''}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const kelasPilih = 'border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:ring-2 focus:ring-emerald-400 outline-none';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Wallet size={18} className="text-emerald-600" /> Rumusan Bayaran
        </h3>
        <div className="flex gap-2">
          <button onClick={muat} disabled={memuat}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={13} className={memuat ? 'animate-spin' : ''} /> Muat Semula
          </button>
          <button onClick={muatTurunCSV} disabled={ditapis.length === 0}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">
            <Download size={13} /> CSV
          </button>
        </div>
      </div>

      {/* PENAPIS */}
      <div className="flex flex-wrap gap-2 items-center">
        <select className={kelasPilih} value={tahun} onChange={e => setTahun(Number(e.target.value))}>
          {[tahunKini, tahunKini - 1, tahunKini - 2].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className={kelasPilih} value={fProgram} onChange={e => setFProgram(e.target.value)}>
          <option value="">Semua program</option>
          {programList.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className={kelasPilih} value={fSiri} onChange={e => setFSiri(e.target.value)}>
          <option value="">Semua siri</option>
          {siriList.map(s => <option key={s} value={s}>Siri {s}</option>)}
        </select>
        <select className={kelasPilih} value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="paid">Dibayar sahaja</option>
          <option value="">Semua status</option>
          <option value="pending_review">Menunggu semakan</option>
          <option value="pending">Menunggu bayaran</option>
          <option value="failed">Gagal</option>
          <option value="cancelled">Dibatalkan</option>
        </select>
        <select className={kelasPilih} value={fKaedah} onChange={e => setFKaedah(e.target.value)}>
          <option value="">Semua kaedah</option>
          <option value="toyyibpay">FPX / Online</option>
          <option value="bank_transfer">Pindahan Bank</option>
          <option value="cheque">Cek</option>
        </select>
        <select className={kelasPilih} value={fJenis} onChange={e => setFJenis(e.target.value)}>
          <option value="">SR &amp; SM</option>
          <option value="rendah">SR</option>
          <option value="menengah">SM</option>
        </select>
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={`${kelasPilih} pl-7 w-44`} placeholder="Sekolah / rujukan"
            value={carian} onChange={e => setCarian(e.target.value)} />
        </div>
      </div>

      {/* RINGKASAN */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          { label: 'Jumlah Diterima', nilai: formatRM(ringkasan.jumlahDibayar), warna: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
          { label: 'Yuran (tanpa caj)', nilai: formatRM(ringkasan.jumlahYuran), warna: 'text-slate-700 bg-white border-slate-200' },
          { label: 'Sekolah', nilai: String(ringkasan.sekolah), warna: 'text-slate-700 bg-white border-slate-200' },
          { label: 'Orang Dibil', nilai: String(ringkasan.orang), warna: 'text-slate-700 bg-white border-slate-200' },
        ].map(k => (
          <div key={k.label} className={`rounded-xl border p-3 ${k.warna}`}>
            <p className="text-[10px] font-bold uppercase opacity-70">{k.label}</p>
            <p className="text-lg font-bold mt-0.5">{k.nilai}</p>
          </div>
        ))}
      </div>

      {Object.keys(ringkasan.ikutKaedah).length > 1 && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          {Object.entries(ringkasan.ikutKaedah).map(([k, v]) => (
            <span key={k} className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
              <strong>{namaKaedah(k)}</strong> · {v.bil} bayaran · {formatRM(v.jumlah)}
            </span>
          ))}
        </div>
      )}

      {/* JADUAL */}
      {memuat ? <LoadingSpinner /> : ditapis.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10 border border-dashed rounded-xl">
          Tiada bayaran sepadan dengan penapis ini.
        </p>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {['Sekolah', 'Program', 'Siri', 'Orang', 'Yuran', 'Caj', 'Jumlah', 'Kaedah', 'Status', 'Tarikh', 'Rujukan'].map(h => (
                  <th key={h} className="text-left font-bold uppercase text-[9px] px-2.5 py-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ditapis.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-2.5 py-2">
                    <span className="font-semibold text-slate-800">{r.schoolName}</span>
                    {r.schoolType && (
                      <span className="ml-1.5 text-[9px] font-bold text-slate-400">
                        {r.schoolType === 'menengah' ? 'SM' : r.schoolType === 'rendah' ? 'SR' : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-2.5 py-2 whitespace-nowrap">{r.badgeName}</td>
                  <td className="px-2.5 py-2 text-center">{r.siri}</td>
                  <td className="px-2.5 py-2 text-center whitespace-nowrap" title="Peserta / Pemimpin / Penolong">
                    {r.bilPeserta}{(r.bilPemimpin || r.bilPenolong) ? ` · ${r.bilPemimpin} · ${r.bilPenolong}` : ''}
                  </td>
                  <td className="px-2.5 py-2 whitespace-nowrap">{formatRM(r.amount)}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap text-slate-400">
                    {r.transactionFee > 0 ? formatRM(r.transactionFee) : '–'}
                  </td>
                  <td className="px-2.5 py-2 whitespace-nowrap font-bold text-emerald-700">{formatRM(r.totalAmount)}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap">{namaKaedah(r.method)}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap">
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${LENCANA_STATUS[r.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {namaStatus[r.status] || r.status}
                    </span>
                    {r.seatStatus === 'no_seat' && (
                      <span className="ml-1 px-1.5 py-0.5 rounded border text-[10px] font-bold bg-red-100 text-red-700 border-red-200">
                        TIADA TEMPAT
                      </span>
                    )}
                  </td>
                  <td className="px-2.5 py-2 whitespace-nowrap text-slate-500">
                    {r.paidAt ? tarikhPendek(r.paidAt) : '–'}
                  </td>
                  <td className="px-2.5 py-2 whitespace-nowrap font-mono text-[10px] text-slate-500">
                    {r.referenceNumber || r.billCode || '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
