import React, { useState, useEffect } from 'react';
import { Users, Search, MapPin, Calendar, Phone, FileText, UserPlus, Loader, User, School as SchoolIcon, RefreshCw, Undo2, Download } from 'lucide-react';
import { getFloatedStudents, pullStudent, unfloatStudent, FloatedStudent } from '../services/supabaseApi';

export interface FloatedStudentsTabProps {
  schoolCode?: string;
  schoolName?: string;
  negeriCode?: string;
  daerahCode?: string;
  isAdmin?: boolean;
  onRefresh?: () => void;
}

export const FloatedStudentsTab: React.FC<FloatedStudentsTabProps> = ({
  schoolCode, schoolName, negeriCode, daerahCode, isAdmin, onRefresh,
}) => {
  const [floatedStudents, setFloatedStudents] = useState<FloatedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'daerah' | 'negeri'>('daerah');
  const [pullingId, setPullingId] = useState<string | null>(null);
  const [unfloatingId, setUnfloatingId] = useState<string | null>(null);
  const [showPullModal, setShowPullModal] = useState<FloatedStudent | null>(null);
  const [newRole, setNewRole] = useState('PESERTA');
  const [newCategory, setNewCategory] = useState('Pengakap Kanak-Kanak');

  const fetchData = async () => {
    setLoading(true);
    const nc = scopeFilter === 'negeri' || scopeFilter === 'all' ? negeriCode : undefined;
    const dc = scopeFilter === 'daerah' ? daerahCode : undefined;
    const data = await getFloatedStudents(nc, dc);
    setFloatedStudents(data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [scopeFilter, negeriCode, daerahCode]);

  const filtered = floatedStudents.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.student_name.toLowerCase().includes(q) ||
      s.ic_number.toLowerCase().includes(q) ||
      s.original_school_code.toLowerCase().includes(q) ||
      (s.school_name || '').toLowerCase().includes(q)
    );
  });

  const handlePull = async () => {
    if (!showPullModal) return;
    if (!confirm(`Tarik murid "${showPullModal.student_name}" masuk ke ${schoolName}?\n\nPeranan: ${newRole}\nKategori: ${newCategory}`)) return;
    setPullingId(showPullModal.id);
    const res = await pullStudent({
      personId: showPullModal.id,
      targetSchoolCode: schoolCode!,
      newRole,
      newCategory,
      pulledBy: schoolCode!,
    });
    setPullingId(null);
    setShowPullModal(null);
    if (res.status === 'success') {
      alert(res.message);
      fetchData();
      onRefresh?.();
    } else {
      alert(res.message || 'Gagal tarik murid.');
    }
  };

  const handleUnfloat = async (student: FloatedStudent) => {
    if (!confirm(`Batal apungkan murid "${student.student_name}"?\n\nMurid ini akan dikembalikan ke sekolah asal: ${student.school_name}.`)) return;
    setUnfloatingId(student.id);
    const res = await unfloatStudent(student.id);
    setUnfloatingId(null);
    if (res.status === 'success') {
      alert(res.message);
      fetchData();
      onRefresh?.();
    } else {
      alert(res.message || 'Gagal batalkan apungan.');
    }
  };

  const reasonLabels: Record<string, string> = {
    pindah_sekolah: 'Pindah Sekolah',
    pindah_daerah: 'Pindah Daerah',
    pindah_negeri: 'Pindah Negeri',
    lain: 'Lain-lain',
  };

  const handleExportExcel = () => {
    if (filtered.length === 0) {
      alert('Tiada data untuk dieksport.');
      return;
    }

    const headers = [
      'Bil', 'Nama', 'No. IC', 'Jantina', 'Peranan', 'Kategori',
      'Sekolah Asal', 'Daerah', 'Negeri', 'Sebab Apung',
      'Catatan', 'Diapungkan Oleh', 'Tarikh Apung',
    ];

    const rows = filtered.map((s, i) => [
      i + 1,
      `"${s.student_name}"`,
      `"${s.ic_number}"`,
      s.gender,
      s.role,
      s.category || '-',
      `"${s.school_name}"`,
      s.daerah_name || '-',
      s.negeri_name || '-',
      reasonLabels[s.float_reason] || s.float_reason || '-',
      `"${s.float_notes || ''}"`,
      `"${s.floated_by || ''}"`,
      s.floated_at ? formatDate(s.floated_at) : '-',
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Murid_Terapung_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (d: string) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="bg-white rounded-xl shadow p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
          <MapPin className="text-amber-500" size={20} /> Murid Diapungkan
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handleExportExcel}
            disabled={filtered.length === 0}
            className="text-emerald-600 hover:bg-emerald-50 p-2 rounded transition disabled:opacity-30"
            title="Export ke Excel"
          >
            <Download size={16} />
          </button>
          <button onClick={fetchData} disabled={loading} className="text-blue-600 hover:bg-blue-50 p-2 rounded transition">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Senarai murid yang telah diapungkan keluar dari sekolah lain. Anda boleh menarik murid ini masuk ke sekolah anda.
      </p>

      {/* Filter scope + search */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-1">
          {[
            { id: 'negeri' as const, label: 'Negeri' },
            { id: 'daerah' as const, label: 'Daerah' },
            { id: 'all' as const, label: 'Semua' },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setScopeFilter(opt.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition ${
                scopeFilter === opt.id
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama, IC, sekolah asal..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="text-xs text-slate-500 font-semibold">
        {filtered.length} murid terapung
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader className="animate-spin text-slate-400" size={32} /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Users size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Tiada murid diapungkan</p>
          <p className="text-xs mt-1">Murid yang diapungkan dari sekolah lain akan dipaparkan di sini.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {filtered.map((s) => (
            <div key={s.id} className="border border-slate-200 rounded-lg p-3 hover:shadow-sm transition">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="p-1.5 bg-amber-50 rounded-lg text-amber-600 shrink-0">
                    <User size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800 text-sm truncate">{s.student_name}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-slate-500">
                      {s.ic_number && <span className="flex items-center gap-1"><FileText size={10} /> {s.ic_number}</span>}
                      <span className="flex items-center gap-1"><SchoolIcon size={10} /> {s.school_name}</span>
                      <span className="flex items-center gap-1"><Calendar size={10} /> {formatDate(s.floated_at)}</span>
                      <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                        {reasonLabels[s.float_reason] || s.float_reason}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{s.role}</span>
                      <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{s.gender}</span>
                      {s.daerah_name && <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">{s.daerah_name}</span>}
                      {s.float_notes && <span className="text-[10px] text-slate-400 italic">- {s.float_notes}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2 shrink-0">
                  {isAdmin ? (
                    <button
                      onClick={() => handleUnfloat(s)}
                      disabled={unfloatingId === s.id}
                      className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded-lg transition disabled:opacity-50 flex items-center gap-1"
                      title="Batalkan apungan dan kembalikan murid ke sekolah asal"
                    >
                      {unfloatingId === s.id ? <Loader size={12} className="animate-spin" /> : <Undo2 size={12} />}
                      Batal Apung
                    </button>
                  ) : schoolCode ? (
                    <button
                      onClick={() => { setShowPullModal(s); setNewRole(s.role || 'PESERTA'); setNewCategory(s.category || 'Pengakap Kanak-Kanak'); }}
                      disabled={pullingId === s.id}
                      className="shrink-0 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition disabled:opacity-50 flex items-center gap-1"
                    >
                      {pullingId === s.id ? <Loader size={12} className="animate-spin" /> : <UserPlus size={12} />}
                      Tarik Masuk
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pull Modal */}
      {showPullModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setShowPullModal(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="bg-emerald-600 px-5 py-4 flex justify-between items-center">
              <h3 className="font-bold text-white flex items-center gap-2"><UserPlus size={16} /> Tarik Masuk Murid</h3>
              <button onClick={() => setShowPullModal(null)} className="text-white/70 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p className="text-sm font-bold text-emerald-800">{showPullModal.student_name}</p>
                <p className="text-xs text-emerald-600 mt-1">
                  Dari: {showPullModal.school_name} ({showPullModal.original_school_code})
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Peranan</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-400 outline-none"
                >
                  <option value="PESERTA">Peserta</option>
                  <option value="PEMIMPIN">Pemimpin</option>
                  <option value="PENOLONG PEMIMPIN">Penolong Pemimpin</option>
                  <option value="PENGUJI">Penguji</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Kategori</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-400 outline-none"
                >
                  <option value="Pengakap Kanak-Kanak">Pengakap Kanak-Kanak</option>
                  <option value="Pengakap Muda">Pengakap Muda</option>
                  <option value="Pengakap Remaja">Pengakap Remaja</option>
                  <option value="Kelana">Kelana</option>
                </select>
              </div>

              <div className="bg-slate-50 rounded-lg p-3 text-[11px] text-slate-500">
                <p><strong>Sekolah Tujuan:</strong> {schoolName}</p>
                <p><strong>IC:</strong> {showPullModal.ic_number || '-'}</p>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setShowPullModal(null)} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
                  Batal
                </button>
                <button onClick={handlePull} disabled={pullingId === showPullModal.id} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold transition disabled:opacity-50 flex items-center justify-center gap-2">
                  {pullingId === showPullModal.id ? <Loader size={14} className="animate-spin" /> : <UserPlus size={14} />}
                  Tarik Masuk
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
