

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, RefreshCw, Medal, ToggleLeft, ToggleRight, Calendar, Pencil, Check, X, Wallet, Shirt, Layers } from 'lucide-react';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { GatewaySettingsCard } from './GatewaySettingsCard';
import { addBadgeType, deleteBadgeType, toggleRegistration, updateBadgeDeadline, updateBadgeName, updateBadgeRequiresDaerahApproval, getProgramSettings, upsertProgramSetting, ProgramSetting, getProgramFeeOverrides, saveProgramFeeOverrides, ProgramFeeOverride } from '../services/supabaseApi';
import { Badge , SchoolType } from '../types';

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

type BarisOverride = { siri: number | null; schoolType: SchoolType | null; peserta: string; pemimpin: string; penolong: string };

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
  const [formOnlineRequired, setFormOnlineRequired] = useState(false);
  const [formFeePeserta, setFormFeePeserta] = useState('');
  const [formFeePemimpin, setFormFeePemimpin] = useState('');
  const [formFeePenolong, setFormFeePenolong] = useState('');
  // Override yuran: kadar berbeza ikut siri dan/atau jenis sekolah (migrasi 031).
  // Yuran asas di atas menentukan SIAPA dicaj; baris di sini hanya BERAPA.
  const [formOverrides, setFormOverrides] = useState<BarisOverride[]>([]);
  const [allOverrides, setAllOverrides] = useState<ProgramFeeOverride[]>([]);
  // Tab jenis sekolah yang sedang disunting dalam grid kadar. null = semua jenis.
  const [overrideType, setOverrideType] = useState<SchoolType | null>(null);
  const [formShirtEnabled, setFormShirtEnabled] = useState(false);
  const [formSiriEnabled, setFormSiriEnabled] = useState(false);
  const [formMaxSiri, setFormMaxSiri] = useState(5);
  const [savingSettings, setSavingSettings] = useState(false);

  const loadSettings = async () => {
    const [data, overrides] = await Promise.all([getProgramSettings(), getProgramFeeOverrides()]);
    setAllSettings(data);
    setAllOverrides(overrides);
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
    setFormOnlineRequired(s?.paymentOnlineRequired || false);
    setFormFeePeserta(s?.feePeserta != null ? String(s.feePeserta) : '');
    setFormFeePemimpin(s?.feePemimpin != null ? String(s.feePemimpin) : '');
    setFormFeePenolong(s?.feePenolong != null ? String(s.feePenolong) : '');
    setFormShirtEnabled(s?.shirtEnabled || false);
    setFormSiriEnabled(s?.siriEnabled || false);
    setFormMaxSiri(s?.maxSiri || 5);
    setOverrideType(null);
    setFormOverrides(
      allOverrides
        .filter(o => s && o.programSettingId === s.id)
        .map(o => ({
          siri: o.siri,
          schoolType: o.schoolType,
          peserta: o.feePeserta != null ? String(o.feePeserta) : '',
          pemimpin: o.feePemimpin != null ? String(o.feePemimpin) : '',
          penolong: o.feePenolong != null ? String(o.feePenolong) : '',
        })),
    );
  };

  // Baris grid: satu per siri bila siri aktif, satu baris "semua" bila tidak.
  const barisSiri: (number | null)[] = formSiriEnabled
    ? Array.from({ length: formMaxSiri }, (_, i) => i + 1)
    : [null];

  const cariBaris = (siri: number | null) =>
    formOverrides.find(r => r.siri === siri && r.schoolType === overrideType);

  const bacaSel = (siri: number | null, peranan: 'peserta' | 'pemimpin' | 'penolong') =>
    cariBaris(siri)?.[peranan] ?? '';

  const tulisSel = (siri: number | null, peranan: 'peserta' | 'pemimpin' | 'penolong', nilai: string) => {
    const sedia = cariBaris(siri);
    if (sedia) {
      setFormOverrides(formOverrides.map(r => (r === sedia ? { ...r, [peranan]: nilai } : r)));
    } else {
      setFormOverrides([
        ...formOverrides,
        { siri, schoolType: overrideType, peserta: '', pemimpin: '', penolong: '', [peranan]: nilai } as BarisOverride,
      ]);
    }
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
        paymentOnlineRequired: formOnlineRequired,
        feePeserta: formFeePeserta.trim() ? Number(formFeePeserta) : null,
        feePemimpin: formFeePemimpin.trim() ? Number(formFeePemimpin) : null,
        feePenolong: formFeePenolong.trim() ? Number(formFeePenolong) : null,
        shirtEnabled: formShirtEnabled,
        siriEnabled: formSiriEnabled,
        maxSiri: formMaxSiri,
      });
      if (res.status === 'success') {
        // Override memerlukan id tetapan, jadi ia hanya boleh disimpan selepas
        // baris asas wujud. upsertProgramSetting memulangkan id untuk itu.
        const settingId = (res as any).settingId || findSetting(b, settingsYear)?.id;
        if (settingId) {
          await saveProgramFeeOverrides(settingId, formOverrides.map(r => ({
            siri: r.siri,
            schoolType: r.schoolType,
            feePeserta:  r.peserta.trim()  ? Number(r.peserta)  : null,
            feePemimpin: r.pemimpin.trim() ? Number(r.pemimpin) : null,
            feePenolong: r.penolong.trim() ? Number(r.penolong) : null,
          })));
        }
        await loadSettings();
        setAllOverrides(await getProgramFeeOverrides());
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
    <>
      {/* Akaun pembayaran bagi skop ini. Hanya relevan bila skop diketahui. */}
      {scopeContext?.type && (scopeContext.negeriCode || scopeContext.daerahCode) && (
        <GatewaySettingsCard
          scope={scopeContext.type}
          code={(scopeContext.type === 'negeri' ? scopeContext.negeriCode : scopeContext.daerahCode) as string}
          label={scopeContext.label || ''}
        />
      )}
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
                        const active = s && (s.paymentEnabled || s.shirtEnabled || s.siriEnabled);
                        return (
                            <button
                                onClick={() => openSettingsModal(b, currentYear)}
                                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-bold border transition ${active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
                                title="Tetapan yuran, saiz baju & siri"
                            >
                                <Wallet size={12} /> Yuran / Baju / Siri
                                {s?.paymentEnabled && <span className="bg-emerald-200 text-emerald-800 px-1 rounded">RM</span>}
                                {s?.shirtEnabled && <Shirt size={11} />}
                                {s?.siriEnabled && <span className="bg-purple-200 text-purple-800 px-1 rounded flex items-center gap-0.5"><Layers size={10} /> Siri</span>}
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
              <h3 className="font-bold text-white flex items-center gap-2"><Wallet size={16} /> Yuran, Saiz Baju &amp; Siri</h3>
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
                    {/* Kadar asas TIDAK lagi mempunyai kotaknya sendiri di sini.
                        Ia kini baris pertama jadual di bawah, supaya tiada dua
                        tempat memasukkan yuran yang sama. */}

                    {/* PINTU BAYARAN — togol yang menghidupkan aliran sebenar */}
                    <label className="flex items-start justify-between gap-3 mt-3 pt-3 border-t border-dashed border-gray-200 cursor-pointer">
                      <span>
                        <span className="block font-bold text-sm text-red-700">Wajib Bayar Sebelum Hantar</span>
                        <span className="block text-[10px] text-gray-500 mt-0.5">
                          Sekolah mesti membayar atau memuat naik bukti sebelum pendaftaran masuk
                          giliran pengesahan. Biarkan mati untuk kekalkan yuran sebagai paparan sahaja.
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        checked={formOnlineRequired}
                        onChange={(e) => setFormOnlineRequired(e.target.checked)}
                        className="w-5 h-5 accent-red-600 shrink-0 mt-0.5"
                      />
                    </label>
                    {formOnlineRequired && (
                      <p className="text-[10px] text-red-600 font-semibold bg-red-50 border border-red-200 rounded p-2">
                        Aktif: sekolah TIDAK boleh menghantar pendaftaran program ini tanpa menyelesaikan bayaran.
                      </p>
                    )}

                    {/* KADAR IKUT SIRI & JENIS SEKOLAH */}
                    <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-teal-700 uppercase">
                          Kadar Yuran
                        </span>
                        <div className="flex gap-1">
                          {([[null, 'Semua'], ['rendah', 'SR'], ['menengah', 'SM']] as [SchoolType | null, string][]).map(([jenis, label]) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => setOverrideType(jenis)}
                              className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition ${
                                overrideType === jenis
                                  ? 'bg-teal-600 text-white border-teal-600'
                                  : 'bg-white text-teal-700 border-teal-200 hover:bg-teal-50'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-400 mb-2">
                        Baris <strong>Asas</strong> menetapkan siapa dicaj dan berapa. Siri yang dibiar
                        kosong mengikut baris itu — termasuk siri yang dibuka kemudian. Lajur yang
                        Asas-nya kosong tidak dicaj langsung.
                        {overrideType !== null && ' Asas dikongsi semua jenis sekolah, jadi ia diedit pada tab “Semua”.'}
                      </p>

                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-gray-400">
                            <th className="text-left font-bold uppercase text-[9px] pb-1">Kadar</th>
                            <th className="font-bold uppercase text-[9px] pb-1">Peserta</th>
                            <th className="font-bold uppercase text-[9px] pb-1">Pemimpin</th>
                            <th className="font-bold uppercase text-[9px] pb-1">Penolong</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* BARIS ASAS — dahulunya tiga kotak berasingan di atas.
                              Memisahkannya bermakna admin melihat "70" di satu
                              tempat dan "70" lagi di tempat lain, tanpa apa-apa
                              yang menjelaskan hubungan keduanya. */}
                          <tr className="border-b border-teal-100">
                            <td className="pr-2 py-0.5 font-bold text-emerald-800 whitespace-nowrap">Asas</td>
                            {(['peserta', 'pemimpin', 'penolong'] as const).map(peranan => {
                              const nilai = peranan === 'peserta' ? formFeePeserta
                                : peranan === 'pemimpin' ? formFeePemimpin : formFeePenolong;
                              const tetap = peranan === 'peserta' ? setFormFeePeserta
                                : peranan === 'pemimpin' ? setFormFeePemimpin : setFormFeePenolong;
                              // Asas tidak bergantung pada jenis sekolah, jadi ia
                              // hanya boleh diedit pada tab "Semua".
                              const kunci = overrideType !== null;
                              return (
                                <td key={peranan} className="px-0.5 py-0.5">
                                  <input
                                    type="number" min="0" step="0.01"
                                    value={nilai}
                                    disabled={kunci}
                                    onChange={(e) => tetap(e.target.value)}
                                    placeholder="–"
                                    title={kunci
                                      ? 'Kadar asas dikongsi semua jenis sekolah — edit pada tab “Semua”'
                                      : 'Kosong = peranan ini tidak dicaj langsung'}
                                    className="w-full p-1.5 border border-emerald-300 rounded text-center font-bold bg-emerald-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:font-normal focus:ring-2 focus:ring-emerald-400 outline-none"
                                  />
                                </td>
                              );
                            })}
                          </tr>
                          {/* Bila siri tidak aktif, satu-satunya baris di bawah ialah
                              kadar khas jenis sekolah. Pada tab "Semua" ia hanya akan
                              mengulang baris Asas, jadi ia disembunyikan di situ. */}
                          {(formSiriEnabled || overrideType !== null) && barisSiri.map(siri => (
                            <tr key={String(siri)}>
                              <td className="pr-2 py-0.5 font-bold text-teal-800 whitespace-nowrap">
                                {siri === null ? 'Kadar khas' : `Siri ${siri}`}
                              </td>
                              {(['peserta', 'pemimpin', 'penolong'] as const).map(peranan => {
                                const asas = peranan === 'peserta' ? formFeePeserta
                                  : peranan === 'pemimpin' ? formFeePemimpin : formFeePenolong;
                                const mati = !asas.trim();
                                return (
                                  <td key={peranan} className="px-0.5 py-0.5">
                                    <input
                                      type="number" min="0" step="0.01"
                                      value={bacaSel(siri, peranan)}
                                      disabled={mati}
                                      onChange={(e) => tulisSel(siri, peranan, e.target.value)}
                                      placeholder={mati ? '-' : asas}
                                      title={mati ? 'Peranan ini tiada yuran asas, jadi ia tidak dicaj langsung' : `Kosong = ikut kadar asas (RM${asas})`}
                                      className="w-full p-1.5 border border-teal-200 rounded text-center bg-white disabled:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed focus:ring-2 focus:ring-teal-400 outline-none"
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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

              {/* SIRI */}
              <div className="border rounded-lg p-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-bold text-gray-700 flex items-center gap-2"><Layers size={16} className="text-purple-600" /> Aktifkan Siri</span>
                  <input type="checkbox" checked={formSiriEnabled} onChange={(e) => setFormSiriEnabled(e.target.checked)} className="w-5 h-5 accent-purple-600" />
                </label>
                <p className="text-[11px] text-gray-400 mt-1">Jika aktif, sekolah boleh tandakan peserta ikut siri (Siri 1, Siri 2, dst) — program ini dijalankan berperingkat. Program tetap sama, siri hanya mengasingkan paparan &amp; statistik.</p>
                {formSiriEnabled && (
                  <div className="mt-3">
                    <label className="block text-[11px] font-semibold text-gray-500 mb-0.5">Bilangan Siri Maksimum (cth: 3 = Siri 1, 2, 3 sahaja)</label>
                    <input
                      type="number" min="1" max="20" step="1"
                      value={formMaxSiri}
                      onChange={(e) => setFormMaxSiri(Math.min(Math.max(Number(e.target.value) || 1, 1), 20))}
                      className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 outline-none"
                    />
                  </div>
                )}
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
    </>
  );
};