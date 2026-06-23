

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, RefreshCw, Medal, ToggleLeft, ToggleRight, Calendar, Pencil, Check, X, Wallet, Shirt } from 'lucide-react';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { addBadgeType, deleteBadgeType, toggleRegistration, updateBadgeDeadline, updateBadgeName, updateBadgeRequiresDaerahApproval, getProgramSettings, upsertProgramSetting, ProgramSetting } from '../services/supabaseApi';
import { Badge } from '../types';

interface AdminBadgesProps {
  badges: Badge[];
  scriptUrl: string;
  onRefresh: () => void;
  // Context: bila non-empty, filter dan tag badge baru ke scope ni
  scopeContext?: {
    type: 'negeri' | 'daerah';
    negeriCode?: string;
    daerahCode?: string;
    label?: string; // Cth: "Negeri Perak" atau "Daerah Kinta Utara"
  };
}

export const AdminBadges: React.FC<AdminBadgesProps> = ({ badges = [], scriptUrl, onRefresh, scopeContext }) => {
  const [newBadge, setNewBadge] = useState('');
  const [loading, setLoading] = useState(false);
  const [togglingBadge, setTogglingBadge] = useState<string | null>(null);
  const [updatingDate, setUpdatingDate] = useState<string | null>(null);
  const [editingBadge, setEditingBadge] = useState<string | null>(null);
  const [editBadgeValue, setEditBadgeValue] = useState('');
  const [savingBadgeName, setSavingBadgeName] = useState<string | null>(null);
  const [updatingDaerahApproval, setUpdatingDaerahApproval] = useState<string | null>(null);

  // Tetapan Yuran & Saiz Baju per program
  const currentYear = new Date().getFullYear();
  const [allSettings, setAllSettings] = useState<ProgramSetting[]>([]);
  const [settingsModalBadge, setSettingsModalBadge] = useState<Badge | null>(null);
  const [settingsYear, setSettingsYear] = useState(currentYear);
  const [formPaymentEnabled, setFormPaymentEnabled] = useState(false);
  const [formFeePeserta, setFormFeePeserta] = useState('');
  const [formFeePemimpin, setFormFeePemimpin] = useState('');
  const [formFeePenolong, setFormFeePenolong] = useState('');
  const [formShirtEnabled, setFormShirtEnabled] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const loadSettings = async () => {
    const data = await getProgramSettings();
    setAllSettings(data);
  };
  useEffect(() => { loadSettings(); }, []);

  const scopeOf = (b: Badge) => b.scope || scopeContext?.type || 'daerah';
  const negeriOf = (b: Badge) => b.negeriCode || scopeContext?.negeriCode;
  const daerahOf = (b: Badge) => b.daerahCode || scopeContext?.daerahCode;

  const findSetting = (b: Badge, year: number): ProgramSetting | undefined =>
    allSettings.find(s =>
      s.badgeName === b.name && s.year === year &&
      ((s.scope === 'negeri' && s.negeriCode === negeriOf(b)) ||
       (s.scope === 'daerah' && s.daerahCode === daerahOf(b))));

  const openSettingsModal = (b: Badge, year: number) => {
    const s = findSetting(b, year);
    setSettingsModalBadge(b);
    setSettingsYear(year);
    setFormPaymentEnabled(s?.paymentEnabled || false);
    setFormFeePeserta(s?.feePeserta != null ? String(s.feePeserta) : '');
    setFormFeePemimpin(s?.feePemimpin != null ? String(s.feePemimpin) : '');
    setFormFeePenolong(s?.feePenolong != null ? String(s.feePenolong) : '');
    setFormShirtEnabled(s?.shirtEnabled || false);
  };

  const handleSaveSettings = async () => {
    if (!settingsModalBadge) return;
    const b = settingsModalBadge;
    setSavingSettings(true);
    try {
      const res = await upsertProgramSetting({
        badgeName: b.name,
        year: settingsYear,
        scope: scopeOf(b),
        negeriCode: negeriOf(b),
        daerahCode: daerahOf(b),
        paymentEnabled: formPaymentEnabled,
        feePeserta: formFeePeserta.trim() ? Number(formFeePeserta) : null,
        feePemimpin: formFeePemimpin.trim() ? Number(formFeePemimpin) : null,
        feePenolong: formFeePenolong.trim() ? Number(formFeePenolong) : null,
        shirtEnabled: formShirtEnabled,
      });
      if (res.status === 'success') {
        await loadSettings();
        setSettingsModalBadge(null);
      } else {
        alert('Gagal: ' + res.message);
      }
    } catch (e) {
      alert('Ralat sambungan server.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleDaerahApproval = async (badge: Badge) => {
    setUpdatingDaerahApproval(badge.name);
    try {
      const res = await updateBadgeRequiresDaerahApproval(badge.name, !badge.requiresDaerahApproval);
      if (res.status === 'success') onRefresh();
      else alert('Gagal: ' + res.message);
    } catch (e) {
      alert('Ralat sambungan.');
    } finally {
      setUpdatingDaerahApproval(null);
    }
  };

  // Ensure badges is always an array
  const allBadges = Array.isArray(badges) ? badges : [];

  // Apply scope filter: kalau ada scopeContext, hanya papar badge yang berkaitan
  const safeBadges = scopeContext
    ? allBadges.filter(b => {
        const bScope = b.scope || 'daerah';
        if (scopeContext.type === 'negeri') {
          // Admin negeri nampak badge negeri yang milik negeri ni (atau tiada negeri set)
          if (bScope !== 'negeri') return false;
          if (b.negeriCode && b.negeriCode !== scopeContext.negeriCode) return false;
          return true;
        }
        // Admin daerah nampak badge daerah yang milik daerah ni (atau tiada daerah set)
        if (bScope !== 'daerah') return false;
        if (b.daerahCode && b.daerahCode !== scopeContext.daerahCode) return false;
        return true;
      })
    : allBadges;

  const handleAdd = async () => {
    if (!newBadge.trim()) return;

    if (safeBadges.some(b => b.name === newBadge.trim())) {
      alert("Program ini sudah wujud.");
      return;
    }

    setLoading(true);
    try {
        const response = await addBadgeType(scriptUrl, newBadge, undefined, scopeContext ? {
          scope: scopeContext.type,
          negeriCode: scopeContext.type === 'negeri' ? scopeContext.negeriCode : undefined,
          daerahCode: scopeContext.type === 'daerah' ? scopeContext.daerahCode : undefined,
        } : undefined);
        
        if (response.status === 'success') {
            alert(`Program '${newBadge}' berjaya ditambah.`);
            setNewBadge('');
            // Immediate refresh
            onRefresh(); 
        } else {
            alert(`Gagal menambah: ${response.message || 'Ralat tidak diketahui'}`);
        }
    } catch (error) {
        console.error(error);
        alert("Ralat komunikasi dengan server. Sila semak sambungan internet atau URL Script.");
    } finally {
        setLoading(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Padam program/kategori: ${name}?`)) return;
    setLoading(true);
    try {
        const response = await deleteBadgeType(scriptUrl, name);
        if (response.status === 'success') {
            alert("Berjaya dipadam.");
            onRefresh();
        } else {
            alert("Gagal memadam: " + response.message);
        }
    } catch (e) {
        alert("Gagal memadam.");
    } finally {
        setLoading(false);
    }
  };

  const handleToggle = async (badge: Badge) => {
    setTogglingBadge(badge.name);
    try {
        const newStatus = !badge.isOpen;
        await toggleRegistration(scriptUrl, newStatus, badge.name);
        onRefresh();
    } catch (e) {
        alert("Gagal menukar status program.");
    } finally {
        setTogglingBadge(null);
    }
  };

  const handleDateChange = async (badgeName: string, date: string) => {
      setUpdatingDate(badgeName);
      try {
          await updateBadgeDeadline(scriptUrl, badgeName, date);
          onRefresh();
      } catch (e) {
          alert("Gagal mengemaskini tarikh.");
      } finally {
          setUpdatingDate(null);
      }
  };

  const handleEditBadgeName = (badge: Badge) => {
    setEditingBadge(badge.name);
    setEditBadgeValue(badge.name);
  };

  const handleSaveBadgeName = async (oldName: string) => {
    const newName = editBadgeValue.trim();
    if (!newName) { alert('Nama program tidak boleh kosong.'); return; }
    if (newName === oldName) { setEditingBadge(null); return; }
    if (safeBadges.some(b => b.name === newName)) { alert('Nama program ini sudah wujud.'); return; }
    setSavingBadgeName(oldName);
    try {
      const res = await updateBadgeName(scriptUrl, oldName, newName);
      if (res.status === 'success') {
        setEditingBadge(null);
        setEditBadgeValue('');
        onRefresh();
      } else {
        alert('Gagal: ' + res.message);
      }
    } catch (e) {
      alert('Ralat sambungan server.');
    } finally {
      setSavingBadgeName(null);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow animate-[fadeIn_0.2s_ease-out]">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <Medal size={20} className="text-purple-600"/> Senarai Program / Kategori ({safeBadges.length})
            {scopeContext?.label && (
              <span className="ml-2 text-xs font-semibold bg-purple-100 text-purple-700 px-2 py-1 rounded">
                {scopeContext.type === 'negeri' ? 'Peringkat Negeri' : 'Peringkat Daerah'}: {scopeContext.label}
              </span>
            )}
        </h2>
        <button onClick={onRefresh} className="text-blue-600 hover:bg-blue-50 p-2 rounded transition">
          <RefreshCw size={20} />
        </button>
      </div>

      {scopeContext && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
          <strong>Skop:</strong> {scopeContext.type === 'negeri'
            ? `Hanya program peringkat negeri yang anda uruskan dipaparkan. Program baru akan ditugaskan kepada ${scopeContext.label}.`
            : `Hanya program peringkat daerah yang anda uruskan dipaparkan. Program baru akan ditugaskan kepada ${scopeContext.label}.`
          }
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm font-medium"
          placeholder="Nama Program Baru (Cth: Keris Gangsa)"
          value={newBadge}
          onChange={e => setNewBadge(e.target.value)}
        />
        <button 
          onClick={handleAdd} 
          disabled={!newBadge || loading} 
          className="px-6 py-2.5 rounded-lg font-bold text-white flex items-center justify-center gap-2 transition bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? <LoadingSpinner size="sm" color="border-white" /> : <Plus size={20} />}
          Tambah
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto border rounded-lg bg-gray-50 p-2">
        {safeBadges.map((b, i) => (
          <div key={i} className="p-3 border-b last:border-0 bg-white rounded mb-1 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 group hover:bg-purple-50 transition">
            <div className="flex items-center gap-3">
                {(() => {
                  // Tamat tempoh: masih BUKA tetapi tarikh akhir sudah lepas (pendaftaran dibenarkan pada hari deadline)
                  let expired = false;
                  if (b.isOpen && b.deadline) {
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const d = new Date(b.deadline); d.setHours(0, 0, 0, 0);
                    expired = !isNaN(d.getTime()) && d < today;
                  }
                  const cls = !b.isOpen
                    ? 'bg-red-100 text-red-700'
                    : expired
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-green-100 text-green-700';
                  const label = !b.isOpen ? 'TUTUP' : expired ? 'TAMAT TEMPOH' : 'BUKA';
                  return (
                    <span className={`px-2 py-1 rounded text-xs font-bold ${cls}`} title={expired ? `Tarikh akhir (${b.deadline}) sudah lepas — pendaftaran ditutup automatik` : undefined}>
                      {label}
                    </span>
                  );
                })()}
                {editingBadge === b.name ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={editBadgeValue}
                      onChange={(e) => setEditBadgeValue(e.target.value)}
                      className="border border-purple-300 rounded px-2 py-1 text-sm font-medium w-48 focus:ring-1 focus:ring-purple-500 outline-none"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveBadgeName(b.name);
                        if (e.key === 'Escape') setEditingBadge(null);
                      }}
                    />
                    <button
                      onClick={() => handleSaveBadgeName(b.name)}
                      disabled={savingBadgeName === b.name}
                      className="p-1 text-green-600 hover:bg-green-100 rounded transition"
                      title="Simpan"
                    >
                      {savingBadgeName === b.name ? <LoadingSpinner size="sm" color="border-green-600" /> : <Check size={16} />}
                    </button>
                    <button
                      onClick={() => setEditingBadge(null)}
                      className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                      title="Batal"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${b.isOpen ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{b.name}</span>
                    <button
                      onClick={() => handleEditBadgeName(b)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-purple-600 hover:bg-purple-100 rounded transition"
                      title="Edit Nama"
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                )}
            </div>
            
            <div className="flex items-center gap-4">
                {scopeContext?.type === 'negeri' && (
                    <label className="flex items-center gap-2 bg-amber-50 px-2 py-1 rounded border border-amber-200 cursor-pointer hover:bg-amber-100" title="Jika dipilih, daerah perlu sahkan dahulu sebelum negeri sahkan">
                        <input
                            type="checkbox"
                            checked={!!b.requiresDaerahApproval}
                            onChange={() => handleToggleDaerahApproval(b)}
                            disabled={updatingDaerahApproval === b.name}
                            className="rounded"
                        />
                        <span className="text-xs font-semibold text-amber-800">
                            {updatingDaerahApproval === b.name ? '...' : 'Sahkan Daerah Dahulu'}
                        </span>
                    </label>
                )}
                <div className="flex items-center gap-2 bg-gray-50 p-1 rounded border border-gray-200">
                    <Calendar size={14} className="text-gray-400 ml-1"/>
                    <input 
                        type="date" 
                        className="text-xs bg-transparent outline-none text-gray-600 w-32"
                        value={b.deadline || ''}
                        onChange={(e) => handleDateChange(b.name, e.target.value)}
                        title="Tetapkan Tarikh Tutup"
                    />
                    {updatingDate === b.name && <LoadingSpinner size="sm" />}
                </div>

                <div className="flex items-center gap-2">
                    {(() => {
                        const s = findSetting(b, currentYear);
                        const active = s && (s.paymentEnabled || s.shirtEnabled);
                        return (
                            <button
                                onClick={() => openSettingsModal(b, currentYear)}
                                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-bold border transition ${active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
                                title="Tetapan yuran & saiz baju"
                            >
                                <Wallet size={12} /> Yuran & Baju
                                {s?.paymentEnabled && <span className="bg-emerald-200 text-emerald-800 px-1 rounded">RM</span>}
                                {s?.shirtEnabled && <Shirt size={11} />}
                            </button>
                        );
                    })()}
                    <button
                        onClick={() => handleToggle(b)}
                        disabled={togglingBadge === b.name}
                        className={`p-1 rounded hover:bg-gray-200 transition ${b.isOpen ? 'text-green-600' : 'text-gray-400'}`}
                        title={b.isOpen ? "Tutup Pendaftaran Program Ini" : "Buka Pendaftaran Program Ini"}
                    >
                        {togglingBadge === b.name ? <LoadingSpinner size="sm" color="border-purple-600"/> : (b.isOpen ? <ToggleRight size={24}/> : <ToggleLeft size={24}/>)}
                    </button>
                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <button 
                    onClick={() => handleDelete(b.name)} 
                    className="text-gray-300 hover:text-red-500 transition p-1"
                    title="Padam Program"
                    >
                    <Trash2 size={16} />
                    </button>
                </div>
            </div>
          </div>
        ))}
        {safeBadges.length === 0 && <p className="text-center text-gray-400 p-4">Tiada program dalam database.</p>}
      </div>

      {/* Modal Tetapan Yuran & Saiz Baju */}
      {settingsModalBadge && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setSettingsModalBadge(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-emerald-600 px-5 py-4 flex justify-between items-center">
              <h3 className="font-bold text-white flex items-center gap-2"><Wallet size={16} /> Yuran &amp; Saiz Baju</h3>
              <button onClick={() => setSettingsModalBadge(null)} className="text-white/70 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p className="text-sm font-bold text-emerald-800">{settingsModalBadge.name}</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  Skop: {scopeOf(settingsModalBadge) === 'negeri' ? 'Negeri' : 'Daerah'} {negeriOf(settingsModalBadge) || daerahOf(settingsModalBadge) || ''}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tahun</label>
                <select
                  value={settingsYear}
                  onChange={(e) => openSettingsModal(settingsModalBadge, Number(e.target.value))}
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-400 outline-none"
                >
                  {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              {/* BAYARAN */}
              <div className="border rounded-lg p-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-bold text-gray-700 flex items-center gap-2"><Wallet size={16} className="text-emerald-600" /> Kenakan Bayaran</span>
                  <input type="checkbox" checked={formPaymentEnabled} onChange={(e) => setFormPaymentEnabled(e.target.checked)} className="w-5 h-5 accent-emerald-600" />
                </label>
                {formPaymentEnabled && (
                  <div className="mt-3 space-y-2">
                    {[
                      { label: 'Yuran Peserta (RM)', val: formFeePeserta, set: setFormFeePeserta, ph: 'Cth: 65' },
                      { label: 'Yuran Pemimpin (RM) — kosong = tak caj', val: formFeePemimpin, set: setFormFeePemimpin, ph: 'Kosongkan jika percuma' },
                      { label: 'Yuran Penolong Pemimpin (RM) — kosong = tak caj', val: formFeePenolong, set: setFormFeePenolong, ph: 'Kosongkan jika percuma' },
                    ].map(f => (
                      <div key={f.label}>
                        <label className="block text-[11px] font-semibold text-gray-500 mb-0.5">{f.label}</label>
                        <input
                          type="number" min="0" step="0.01"
                          value={f.val}
                          onChange={(e) => f.set(e.target.value)}
                          placeholder={f.ph}
                          className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-400 outline-none"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SAIZ BAJU */}
              <div className="border rounded-lg p-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-bold text-gray-700 flex items-center gap-2"><Shirt size={16} className="text-indigo-600" /> Perlukan Saiz Baju</span>
                  <input type="checkbox" checked={formShirtEnabled} onChange={(e) => setFormShirtEnabled(e.target.checked)} className="w-5 h-5 accent-indigo-600" />
                </label>
                <p className="text-[11px] text-gray-400 mt-1">Jika aktif, medan saiz baju (XS–4XL) muncul dalam borang pendaftaran untuk peserta, pemimpin & penolong pemimpin.</p>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setSettingsModalBadge(null)} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">Batal</button>
                <button onClick={handleSaveSettings} disabled={savingSettings} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold transition disabled:opacity-50 flex items-center justify-center gap-2">
                  {savingSettings ? <LoadingSpinner size="sm" color="border-white" /> : <Check size={16} />} Simpan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};