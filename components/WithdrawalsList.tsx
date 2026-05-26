import React, { useMemo, useState } from 'react';
import { UserMinus, RotateCcw, Search, Calendar, Clock, FileText, Download } from 'lucide-react';
import { SubmissionData } from '../types';
import { unwithdrawParticipant } from '../services/supabaseApi';
import { LoadingSpinner } from './ui/LoadingSpinner';
import * as XLSX from 'xlsx';

interface WithdrawalsListProps {
  data: SubmissionData[];
  onRefresh: () => void;
  // Show "Batal Penarikan" button (admin only)
  allowUnwithdraw?: boolean;
  // Filter scope label
  scopeLabel?: string;
}

export const WithdrawalsList: React.FC<WithdrawalsListProps> = ({ data, onRefresh, allowUnwithdraw = false, scopeLabel }) => {
  const [search, setSearch] = useState('');
  const [filterReason, setFilterReason] = useState('');
  const [filterSchool, setFilterSchool] = useState('');
  const [unwithdrawing, setUnwithdrawing] = useState<string | null>(null);

  // Only withdrawn participants
  const withdrawn = useMemo(() => data.filter(d => (d as any).isWithdrawn), [data]);

  const reasons = useMemo(() => Array.from(new Set(withdrawn.map(d => (d as any).withdrawalReason).filter(Boolean))).sort(), [withdrawn]);
  const schools = useMemo(() => Array.from(new Set(withdrawn.map(d => d.school).filter(Boolean))).sort(), [withdrawn]);

  const filtered = useMemo(() => {
    let list = withdrawn;
    if (filterReason) list = list.filter(d => (d as any).withdrawalReason === filterReason);
    if (filterSchool) list = list.filter(d => d.school === filterSchool);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        (d.student || '').toLowerCase().includes(q) ||
        (d.icNumber || '').toLowerCase().includes(q) ||
        (d.school || '').toLowerCase().includes(q) ||
        (d.badge || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => {
      const aTime = (a as any).withdrawnAt || '';
      const bTime = (b as any).withdrawnAt || '';
      return bTime.localeCompare(aTime);
    });
  }, [withdrawn, filterReason, filterSchool, search]);

  // Statistics
  const reasonStats = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of withdrawn) {
      const r = (d as any).withdrawalReason || 'Tidak Dinyatakan';
      m[r] = (m[r] || 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [withdrawn]);

  const schoolStats = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of withdrawn) {
      const s = d.school || 'Tidak Dinyatakan';
      m[s] = (m[s] || 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [withdrawn]);

  const handleUnwithdraw = async (item: SubmissionData) => {
    if (!confirm(`Batalkan status tarik diri untuk ${item.student}? Peserta akan dikembalikan ke senarai aktif.`)) return;
    const pid = (item as any).participantId;
    if (!pid) { alert('ID peserta tidak ditemui.'); return; }
    setUnwithdrawing(pid);
    try {
      const res = await unwithdrawParticipant(pid);
      if (res.status === 'success') onRefresh();
      else alert('Gagal: ' + res.message);
    } catch (e: any) {
      alert('Ralat: ' + (e?.message || ''));
    } finally {
      setUnwithdrawing(null);
    }
  };

  const handleExport = () => {
    if (filtered.length === 0) { alert('Tiada rekod untuk dieksport.'); return; }
    const rows = filtered.map((d, i) => ({
      No: i + 1,
      Nama: d.student,
      'No. KP': d.icNumber || '',
      Sekolah: d.school || '',
      'Kod Sekolah': d.schoolCode || '',
      Daerah: d.daerahCode || '',
      Program: d.badge,
      Peranan: d.role || 'PESERTA',
      Tarikh: (d as any).withdrawnAt ? new Date((d as any).withdrawnAt).toLocaleDateString('ms-MY') : '',
      Masa: (d as any).withdrawnAt ? new Date((d as any).withdrawnAt).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' }) : '',
      Sebab: (d as any).withdrawalReason || '',
      Nota: (d as any).withdrawalNotes || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Status Peserta');
    XLSX.writeFile(wb, `Status_Peserta_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            <UserMinus size={20} className="text-red-600" /> Status Peserta
            {scopeLabel && <span className="text-xs font-normal bg-slate-100 px-2 py-1 rounded">{scopeLabel}</span>}
          </h2>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="flex items-center gap-1 bg-green-600 text-white px-3 py-2 text-xs font-bold rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <Download size={14} /> Excel
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-red-700">{withdrawn.length}</p>
            <p className="text-[10px] text-red-600 font-bold uppercase">Jumlah Penarikan</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-amber-700">{schoolStats.length}</p>
            <p className="text-[10px] text-amber-600 font-bold uppercase">Sekolah Terlibat</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-purple-700">{reasonStats.length}</p>
            <p className="text-[10px] text-purple-600 font-bold uppercase">Jenis Sebab</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-700">{filtered.length}</p>
            <p className="text-[10px] text-blue-600 font-bold uppercase">Dipaparkan</p>
          </div>
        </div>

        {/* Pecahan ikut sebab */}
        {reasonStats.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold text-gray-700 uppercase mb-2">Pecahan Ikut Sebab</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {reasonStats.map(([reason, count]) => (
                <div key={reason} className="bg-purple-50 border border-purple-200 rounded px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-900">{reason}</span>
                  <span className="text-xs font-bold bg-purple-600 text-white px-2 py-0.5 rounded">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pecahan ikut sekolah */}
        {schoolStats.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold text-gray-700 uppercase mb-2">Pecahan Ikut Sekolah</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {schoolStats.map(([school, count]) => (
                <div key={school} className="bg-amber-50 border border-amber-200 rounded px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900 truncate">{school}</span>
                  <span className="text-xs font-bold bg-amber-600 text-white px-2 py-0.5 rounded ml-2">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Senarai penuh */}
      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex flex-col md:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari nama, IC, sekolah, program..."
              className="w-full pl-9 p-2 border rounded-lg text-sm"
            />
          </div>
          <select value={filterReason} onChange={e => setFilterReason(e.target.value)} className="p-2 border rounded-lg text-sm">
            <option value="">Semua Sebab</option>
            {reasons.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={filterSchool} onChange={e => setFilterSchool(e.target.value)} className="p-2 border rounded-lg text-sm">
            <option value="">Semua Sekolah</option>
            {schools.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-600 uppercase font-bold">
              <tr>
                <th className="px-3 py-2">No.</th>
                <th className="px-3 py-2">Nama</th>
                <th className="px-3 py-2">No. KP</th>
                <th className="px-3 py-2">Sekolah</th>
                <th className="px-3 py-2">Program</th>
                <th className="px-3 py-2">Tarikh</th>
                <th className="px-3 py-2">Masa</th>
                <th className="px-3 py-2">Sebab</th>
                <th className="px-3 py-2">Nota</th>
                {allowUnwithdraw && <th className="px-3 py-2 text-right">Tindakan</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => {
                const wAt = (item as any).withdrawnAt;
                const date = wAt ? new Date(wAt) : null;
                const pid = (item as any).participantId;
                return (
                  <tr key={pid || i} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2 font-bold uppercase">{item.student}</td>
                    <td className="px-3 py-2 font-mono">{item.icNumber || '-'}</td>
                    <td className="px-3 py-2">
                      <div>{item.school}</div>
                      {item.schoolCode && <div className="text-[10px] text-gray-500 font-mono">{item.schoolCode}</div>}
                    </td>
                    <td className="px-3 py-2">{item.badge}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{date ? date.toLocaleDateString('ms-MY') : '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-[10px]">{date ? date.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                    <td className="px-3 py-2"><span className="bg-red-100 text-red-700 px-2 py-0.5 rounded font-semibold">{(item as any).withdrawalReason || '-'}</span></td>
                    <td className="px-3 py-2 text-gray-600">{(item as any).withdrawalNotes || '-'}</td>
                    {allowUnwithdraw && (
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => handleUnwithdraw(item)}
                          disabled={unwithdrawing === pid}
                          className="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition disabled:opacity-50"
                          title="Batal Penarikan"
                        >
                          {unwithdrawing === pid ? <LoadingSpinner size="sm" /> : <RotateCcw size={14} />}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={allowUnwithdraw ? 10 : 9} className="text-center py-8 text-gray-400 italic">
                    Tiada rekod tarik diri.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
