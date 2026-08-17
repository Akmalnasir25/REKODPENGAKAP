

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, RefreshCw, ToggleLeft, ToggleRight, Settings2, Lock, X, CheckCircle, Clock, Users, Shield, GraduationCap, HeartHandshake, School as SchoolIcon, Layers, Medal, Search, MapPin } from 'lucide-react';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { addSchoolBatch, deleteSchool, updateSchoolPermission, toggleSchoolEditBatch, unlockSchoolBadge, approveSchoolBadge, toggleBadgeEditPermissionBatch, updateSchoolCode, updateSchoolType, getProgramSettings, ProgramSetting } from '../services/supabaseApi';
import { resetSchoolClaim } from '../services/supabaseAuth';
import { School, Badge, Daerah, SchoolType } from '../types';
import { parseBadgeStatusKey } from '../utils/dataProcessing';

interface AdminSchoolsProps {
  schools: School[];
  badges?: Badge[];
  scriptUrl: string;
  negeriCode?: string;
  daerahCode?: string;
  daerahList?: Daerah[];
  onRefresh: () => void;
  enableResetClaim?: boolean;
}

export const AdminSchools: React.FC<AdminSchoolsProps> = ({ schools = [], badges = [], scriptUrl, negeriCode, daerahCode, daerahList = [], onRefresh, enableResetClaim = false }) => {
  const [newSchoolName, setNewSchoolName] = useState('');
  // Jenis sekolah ditetapkan semasa pendaftaran — ia menentukan kadar yuran.
  const [newSchoolType, setNewSchoolType] = useState<SchoolType>('rendah');
  const [savingType, setSavingType] = useState<string | null>(null);
  const [selectedDaerahForAdd, setSelectedDaerahForAdd] = useState(daerahCode || '');
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<{name: string, type: string} | null>(null);
  const [batchToggling, setBatchToggling] = useState<string | null>(null);
  const [badgePermissionLoading, setBadgePermissionLoading] = useState<string | null>(null);

  // Tetapan program diperlukan untuk satu sebab sahaja: mengetahui peranan mana
  // yang DICAJ. Peranan yang dicaj mengambil tempat (Keputusan #10), jadi ia
  // tidak boleh dibuka selepas pengesahan — tempat akan digunakan tanpa bil.
  const [programSettings, setProgramSettings] = useState<ProgramSetting[]>([]);
  useEffect(() => { getProgramSettings(new Date().getFullYear()).then(setProgramSettings).catch(() => {}); }, []);

  // Konservatif dengan sengaja: kalau MANA-MANA tetapan bagi program ini
  // mengecaj pemimpin atau penolong, peranan itu dikira dicaj. Arah kegagalan
  // yang betul ialah membiarkan butang terkunci, bukan membuka peranan berbayar.
  const pegawaiDicaj = (badgeName: string) => programSettings.some(ps =>
    ps.badgeName === badgeName && (ps.feePemimpin != null || ps.feePenolong != null));
  // Pembantu mempunyai lajur yuran sendiri sejak migrasi 051, jadi ia disemak
  // berasingan. Menggabungkannya dengan pegawaiDicaj akan mengunci Pembantu
  // hanya kerana Pemimpin dicaj, dan sebaliknya.
  const pembantuDicaj = (badgeName: string) => programSettings.some(ps =>
    ps.badgeName === badgeName && ps.feePembantu != null);
  const [unlockingBadge, setUnlockingBadge] = useState<string | null>(null); 
  const [approvingBadge, setApprovingBadge] = useState<string | null>(null); 
  const [resettingClaim, setResettingClaim] = useState<string | null>(null);
  const [schoolSearch, setSchoolSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState<'all' | 'registered' | 'unregistered'>('all');
  const [editingSchoolCode, setEditingSchoolCode] = useState<string | null>(null);
  const [editSchoolCodeValue, setEditSchoolCodeValue] = useState('');
  const [savingSchoolCode, setSavingSchoolCode] = useState<string | null>(null);

  const registeredAccountCount = schools.filter(s => s.isClaimed).length;
  const unregisteredAccountCount = schools.length - registeredAccountCount;

  const filteredSchools = schools.filter(s => {
    if (accountFilter === 'registered' && !s.isClaimed) return false;
    if (accountFilter === 'unregistered' && s.isClaimed) return false;
    const query = schoolSearch.trim().toLowerCase();
    if (!query) return true;
    return [s.name, s.schoolCode, s.negeriCode, s.daerahCode]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(query));
  });

  // Batch toggle check
  const allStudentsAllowed = schools.length > 0 && schools.every(s => s.allowStudents);
  const allAssistantsAllowed = schools.length > 0 && schools.every(s => s.allowAssistants);
  const allExaminersAllowed = schools.length > 0 && schools.every(s => s.allowExaminers);
  const allAllowed = schools.length > 0 && schools.every(s => s.allowStudents && s.allowAssistants && s.allowExaminers);

  const handleChangeType = async (school: School, jenis: SchoolType) => {
    if (!school.schoolCode) { alert('Sekolah ini tiada kod — tidak boleh dikemas kini.'); return; }
    setSavingType(school.schoolCode);
    try {
      const res = await updateSchoolType(school.schoolCode, jenis);
      if (res.status === 'success') onRefresh();
      else alert('Gagal: ' + res.message);
    } catch { alert('Ralat sambungan.'); }
    finally { setSavingType(null); }
  };

  const handleAdd = async () => {
    // 1. Split and Normalize Input — format: NAMA SEKOLAH | KOD SEKOLAH
    const rawLines = newSchoolName.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (rawLines.length === 0) return;

    // Parse each line: "NAMA SEKOLAH | KOD SEKOLAH"
    const parsedSchools: { name: string; schoolCode: string }[] = [];
    const invalidLines: string[] = [];

    rawLines.forEach(line => {
      const parts = line.split('|').map(p => p.trim().toUpperCase());
      if (parts.length >= 2 && parts[0] && parts[1]) {
        parsedSchools.push({ name: parts[0], schoolCode: parts[1] });
      } else if (parts.length === 1 && parts[0]) {
        // Fallback: jika tiada separator, guna nama sebagai kod juga (backward compat)
        parsedSchools.push({ name: parts[0], schoolCode: parts[0] });
      } else {
        invalidLines.push(line);
      }
    });

    if (invalidLines.length > 0) {
      alert(`Format tidak sah pada baris berikut:\n${invalidLines.join('\n')}\n\nFormat betul: NAMA SEKOLAH | KOD SEKOLAH`);
      return;
    }

    if (parsedSchools.length === 0) return;

    // 2. Remove Internal Duplicates (by name)
    const seen = new Set<string>();
    const uniqueSchools: { name: string; schoolCode: string }[] = [];
    parsedSchools.forEach(s => {
      if (!seen.has(s.name)) {
        seen.add(s.name);
        uniqueSchools.push(s);
      }
    });

    const existingSchoolNames = schools.map(s => s.name.toUpperCase().trim());
    const schoolsToSend: { name: string; schoolCode: string }[] = [];
    const duplicateSchools: string[] = [];

    // 3. Filter against Database
    uniqueSchools.forEach(s => {
      if (existingSchoolNames.includes(s.name)) {
        duplicateSchools.push(s.name);
      } else {
        schoolsToSend.push(s);
      }
    });

    if (schoolsToSend.length === 0) {
      alert(`Semua nama yang dimasukkan sudah wujud:\n${duplicateSchools.join(', ')}`);
      setNewSchoolName('');
      return;
    }

    setLoading(true);
    try {
        const effectiveDaerah = selectedDaerahForAdd || daerahCode;
        await addSchoolBatch(scriptUrl, schoolsToSend, negeriCode, effectiveDaerah, undefined, newSchoolType);
        
        let finalMessage = `${schoolsToSend.length} sekolah berjaya dihantar.`;
        if (duplicateSchools.length > 0) {
            finalMessage += ` (${duplicateSchools.length} diabaikan kerana duplikasi.)`;
        }
        alert(finalMessage);
        setNewSchoolName('');
        onRefresh(); 
    } catch (error) {
        alert("Ralat menambah sekolah.");
    } finally {
        setLoading(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Padam sekolah: ${name}?`)) return;
    setLoading(true);
    try {
        const response = await deleteSchool(scriptUrl, name);
        if (response.status === 'success') {
             alert("Berjaya dipadam.");
             onRefresh();
        } else {
             alert("Gagal memadam.");
        }
    } catch (e) {
        alert("Gagal memadam. Sila cuba lagi.");
    } finally {
        setLoading(false);
    }
  };

  const handleEditSchoolCode = (school: School) => {
    setEditingSchoolCode(school.name);
    setEditSchoolCodeValue(school.schoolCode || '');
  };

  const handleSaveSchoolCode = async (schoolName: string) => {
    const newCode = editSchoolCodeValue.trim().toUpperCase();
    if (!newCode) {
      alert('Kod sekolah tidak boleh kosong.');
      return;
    }
    setSavingSchoolCode(schoolName);
    try {
      const result = await updateSchoolCode(schoolName, newCode);
      if (result.status === 'success') {
        setEditingSchoolCode(null);
        setEditSchoolCodeValue('');
        onRefresh();
      } else {
        alert('Gagal kemaskini: ' + result.message);
      }
    } catch (e) {
      alert('Ralat sambungan server.');
    } finally {
      setSavingSchoolCode(null);
    }
  };

  const handleCancelEditSchoolCode = () => {
    setEditingSchoolCode(null);
    setEditSchoolCodeValue('');
  };

  const handleResetClaim = async (school: School) => {
    if (!school.schoolCode) {
      alert('Kod sekolah tidak dijumpai untuk sekolah ini. Sila semak data sekolah.');
      return;
    }

    const confirmed = confirm(
      `Reset akaun sekolah: ${school.name}?\n\n` +
      `Email/user lama akan dipadam daripada Supabase Auth dan sekolah boleh daftar semula menggunakan kod sekolah yang sama.\n\n` +
      `Teruskan?`
    );
    if (!confirmed) return;

    setResettingClaim(school.name);
    try {
      const response = await resetSchoolClaim({ schoolCode: school.schoolCode });
      if (response.status === 'success') {
        alert(response.message || 'Akaun sekolah berjaya direset.');
        onRefresh();
      } else {
        alert('Gagal reset akaun sekolah: ' + (response.message || 'Ralat tidak diketahui.'));
      }
    } catch (e) {
      alert('Ralat sambungan. Gagal reset akaun sekolah.');
    } finally {
      setResettingClaim(null);
    }
  };

  const handleToggle = async (school: School, type: 'students' | 'assistants' | 'examiners' | 'all') => {
    setToggling({ name: school.name, type });
    try {
        let newStatus = false;
        if (type === 'students') newStatus = !school.allowStudents;
        else if (type === 'assistants') newStatus = !school.allowAssistants;
        else if (type === 'examiners') newStatus = !school.allowExaminers;
        else if (type === 'all') {
            const anyFalse = !school.allowStudents || !school.allowAssistants || !school.allowExaminers;
            newStatus = anyFalse;
        }

        await updateSchoolPermission(scriptUrl, school.name, type, newStatus);
        onRefresh();
    } catch (e) {
        alert("Ralat sambungan.");
    } finally {
        setToggling(null);
    }
  };

  const handleBatchToggle = async (type: 'students' | 'assistants' | 'examiners' | 'all') => {
      let currentStatus = false;
      let label = "";

      if (type === 'students') { currentStatus = allStudentsAllowed; label = "PESERTA"; }
      else if (type === 'assistants') { currentStatus = allAssistantsAllowed; label = "PENOLONG/PEMIMPIN"; }
      else if (type === 'examiners') { currentStatus = allExaminersAllowed; label = "PENGUJI"; }
      else { currentStatus = allAllowed; label = "SEMUA KATEGORI"; }

      const newStatus = !currentStatus;
      const actionText = newStatus ? "MEMBENARKAN" : "MENGHALANG";
      
      if (!confirm(`TINDAKAN PUKAL (${label}):\n\nAdakah anda pasti mahu ${actionText} akses ini untuk SEMUA sekolah?`)) return;
      
      setBatchToggling(type);
      try {
          const res = await toggleSchoolEditBatch(scriptUrl, newStatus, type);
          if (res.status === 'success') {
              alert(`Berjaya! Akses ${label} kini ${newStatus ? 'dibenarkan' : 'dihalang'} untuk semua.`);
              onRefresh();
          } else {
              alert("Gagal melakukan kemaskini pukal.");
          }
      } catch (e) {
          alert("Ralat sambungan.");
      } finally {
          setBatchToggling(null);
      }
  };

  const handleBadgeEditPermission = async (badgeName: string, type: 'students' | 'assistants' | 'examiners' | 'helpers' | 'all', allow: boolean, fasa: 'sebelum' | 'selepas' = 'sebelum') => {
    const label = type === 'students' ? 'PESERTA' : type === 'assistants' ? 'PEMIMPIN & PENOLONG PEMIMPIN' : type === 'examiners' ? 'PENGUJI' : 'SEMUA KATEGORI';
    const actionText = allow ? 'MEMBENARKAN EDIT' : 'MENUTUP EDIT';
    const fasaText = fasa === 'selepas'
      ? '\n\nIni terpakai SELEPAS pendaftaran dihantar atau disahkan. Sekolah akan boleh tambah, edit dan buang peranan ini walaupun pendaftaran sudah masuk statistik.'
      : '';
    if (!confirm(`KAWALAN EDIT PROGRAM:\n\nAdakah anda pasti mahu ${actionText} ${label} untuk program '${badgeName}' bagi SEMUA sekolah?${fasaText}\n\nProgram lain tidak akan terkesan.`)) return;

    const loadingKey = `${badgeName}-${type}-${fasa}`;
    setBadgePermissionLoading(loadingKey);
    try {
      const res = await toggleBadgeEditPermissionBatch(scriptUrl, badgeName, type, allow, undefined, undefined, fasa);
      if (res.status === 'success') {
        alert(res.message || `Berjaya dikemaskini.`);
        onRefresh();
      } else {
        alert('Gagal: ' + res.message);
      }
    } catch (e) {
      alert('Ralat sambungan.');
    } finally {
      setBadgePermissionLoading(null);
    }
  };

  const handleApproveBadge = async (schoolName: string, badgeName: string) => {
    const displayBadge = badgeName.includes('_') ? `${badgeName.split('_')[0]} (${badgeName.split('_')[1]})` : badgeName;
    if(!confirm(`Terima pendaftaran '${displayBadge}' untuk ${schoolName}?\n\nData ini akan dimasukkan ke dalam statistik rasmi.`)) return;

    setApprovingBadge(`${schoolName}-${badgeName}`);
    try {
        const res = await approveSchoolBadge(scriptUrl, schoolName, badgeName);
        if(res.status === 'success') {
            onRefresh();
        } else {
            alert("Ralat: " + res.message);
        }
    } catch(e) {
        alert("Ralat sambungan.");
    } finally {
        setApprovingBadge(null);
    }
  };

  const handleUnlockBadge = async (schoolName: string, badgeName: string) => {
      const displayBadge = badgeName.includes('_') ? `${badgeName.split('_')[0]} (${badgeName.split('_')[1]})` : badgeName;
      if (!confirm(`Buka semula pendaftaran '${displayBadge}' untuk ${schoolName}?\n\nSekolah ini akan boleh mengedit semula data peserta bagi program ini.`)) return;
      
      setUnlockingBadge(`${schoolName}-${badgeName}`);
      try {
          const res = await unlockSchoolBadge(scriptUrl, schoolName, badgeName);
          if (res.status === 'success') {
              onRefresh();
          } else {
              alert("Gagal membuka semula: " + res.message);
          }
      } catch (e) {
          alert("Ralat sambungan.");
      } finally {
          setUnlockingBadge(null);
      }
  };

  const PermissionToggle = ({ 
      label, 
      active, 
      onClick, 
      loading, 
      icon: Icon, 
      colorClass 
  }: { label: string, active: boolean, onClick: () => void, loading: boolean, icon: any, colorClass: string }) => (
      <button 
          onClick={onClick}
          disabled={loading}
          className={`
              flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition border
              ${active 
                  ? `bg-white ${colorClass} border-current shadow-sm` 
                  : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200'}
          `}
          title={active ? `Klik untuk Halang ${label}` : `Klik untuk Benarkan ${label}`}
      >
          {loading ? <LoadingSpinner size="sm" color={active ? `border-current` : 'border-gray-500'}/> : <Icon size={14}/>}
          {label}: {active ? 'YA' : 'TIDAK'}
      </button>
  );

  const BatchButton = ({ type, label, allowed, icon: Icon, colorClass }: { type: string, label: string, allowed: boolean, icon: any, colorClass: string }) => (
      <button
          onClick={() => handleBatchToggle(type as any)}
          disabled={batchToggling !== null}
          className={`
              flex-1 flex flex-col items-center justify-center p-3 rounded-lg border transition shadow-sm
              ${allowed ? `bg-white ${colorClass} border-current` : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200'}
          `}
          title={`Klik untuk tukar status ${label} bagi SEMUA sekolah`}
      >
          <div className="flex items-center gap-2 mb-1">
              <Icon size={16} />
              <span className="font-bold text-xs">{label}</span>
          </div>
          <div className="flex items-center gap-1.5">
              {batchToggling === type ? <LoadingSpinner size="sm" color={allowed ? "border-current" : "border-gray-500"}/> : (allowed ? <ToggleRight size={20}/> : <ToggleLeft size={20}/>)}
              <span className="text-[10px] font-semibold">{allowed ? 'SEMUA DIBUKA' : 'SEMUA DITUTUP'}</span>
          </div>
      </button>
  );

  return (
    <div className="bg-white p-6 rounded-xl shadow animate-[fadeIn_0.2s_ease-out]">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-bold text-gray-800">Senarai Sekolah ({schools.length})</h2>
        <button onClick={onRefresh} className="text-blue-600 hover:bg-blue-50 p-2 rounded transition">
          <RefreshCw size={20} />
        </button>
      </div>

      <div className="space-y-3 mb-6">
        <div>
          <textarea
            className="w-full p-3 border rounded-lg uppercase h-28 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium font-mono"
            placeholder={"NAMA SEKOLAH | KOD SEKOLAH\nContoh:\nSK TAMAN MELAWATI | ABA1234\nSMK SERI PUTERI | ABA5678"}
            value={newSchoolName}
            onChange={e => setNewSchoolName(e.target.value)}
          ></textarea>
          <p className="text-[11px] text-gray-500 mt-1.5">
            Format: <span className="font-bold text-gray-700">NAMA SEKOLAH | KOD SEKOLAH</span> (satu setiap baris). Kod sekolah akan digunakan oleh guru untuk mendaftar akaun.
          </p>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Kategori Sekolah</label>
          <select
            value={newSchoolType}
            onChange={(e) => setNewSchoolType(e.target.value as SchoolType)}
            className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white font-semibold text-teal-800"
          >
            <option value="rendah">Sekolah Rendah (SR)</option>
            <option value="menengah">Sekolah Menengah (SM)</option>
            <option value="lain">Lain-lain</option>
          </select>
          <p className="text-[10px] text-gray-400 mt-1">Terpakai kepada semua sekolah dalam senarai di atas. Kategori menentukan kadar yuran yang dikenakan.</p>
        </div>
        {daerahList.length > 0 && (
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1 flex items-center gap-1">
              <MapPin size={12} /> Daerah <span className="text-gray-400 font-normal">(opsyenal)</span>
            </label>
            <select
              value={selectedDaerahForAdd}
              onChange={(e) => setSelectedDaerahForAdd(e.target.value)}
              className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              <option value="">— Tiada daerah (semua negeri) —</option>
              {daerahList.map((d) => (
                <option key={d.code} value={d.code}>{d.name} ({d.code})</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">Pilih daerah untuk assign sekolah baru ke daerah tertentu.</p>
          </div>
        )}
        <button 
          onClick={handleAdd} 
          disabled={!newSchoolName || loading} 
          className="w-full py-2.5 rounded-lg font-bold text-white flex items-center justify-center gap-2 transition bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? <LoadingSpinner size="sm" color="border-white" /> : <Plus size={20} />}
          {loading ? 'Memproses...' : 'Tambah Senarai Sekolah'}
        </button>
      </div>

      {/* NEW BATCH TOGGLE PANEL */}
      <div className="mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
          <div className="flex items-center gap-2 mb-3">
              <Settings2 size={18} className="text-gray-500"/>
              <span className="text-sm font-bold text-gray-700 uppercase">Kawalan Pukal (Batch Actions)</span>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <BatchButton 
                  type="students" 
                  label="PESERTA" 
                  allowed={allStudentsAllowed} 
                  icon={Users} 
                  colorClass="text-blue-700 border-blue-200 bg-blue-50"
              />
              <BatchButton 
                  type="assistants" 
                  label="PENOLONG" 
                  allowed={allAssistantsAllowed} 
                  icon={Shield} 
                  colorClass="text-indigo-700 border-indigo-200 bg-indigo-50"
              />
              <BatchButton 
                  type="examiners" 
                  label="PENGUJI" 
                  allowed={allExaminersAllowed} 
                  icon={GraduationCap} 
                  colorClass="text-green-700 border-green-200 bg-green-50"
              />
              <BatchButton 
                  type="all" 
                  label="MASTER" 
                  allowed={allAllowed} 
                  icon={Layers} 
                  colorClass="text-purple-700 border-purple-200 bg-purple-50"
              />
          </div>
      </div>

      {/* PER-BADGE EDIT PERMISSION PANEL */}
      {badges.length > 0 && (
        <div className="mb-6 bg-amber-50 p-4 rounded-xl border border-amber-200">
          <div className="flex items-center gap-2 mb-3">
            <Settings2 size={18} className="text-amber-600"/>
            <span className="text-sm font-bold text-amber-800 uppercase">Kawalan Edit Pukal Mengikut Program</span>
          </div>
          <p className="text-xs text-amber-600 mb-3">
            Baris atas terpakai <strong>sebelum</strong> pendaftaran dihantar. Baris "Selepas Hantar / Sah"
            terpakai selepas — sekolah boleh tambah, edit dan buang pegawai walaupun pendaftaran sudah
            masuk statistik. Peserta tiada pada baris kedua: ia kekal terkunci selepas dihantar.
            Peranan yang <strong>dicaj</strong> juga tidak boleh dibuka, kerana ia mengambil tempat.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {badges.map(badge => {
              // Kunci kebenaran kini mengandungi siri (migrasi 027), dan satu
              // sekolah boleh ada beberapa siri untuk program yang sama. Kawalan
              // ini dikenakan pada semua siri, jadi paparannya menyemak semua
              // kunci yang sepadan dengan program + tahun ini.
              const yearNow = new Date().getFullYear();
              const permsForBadge = (s: School) =>
                Object.entries(s.badgeEditPermissions || {})
                  .filter(([k]) => {
                    const parsed = parseBadgeStatusKey(k);
                    return parsed.badge === badge.name && parsed.year === yearNow;
                  })
                  .map(([, v]) => v as any);
              // `every` pada senarai kosong = true, mengekalkan tingkah laku asal
              // untuk sekolah yang belum ada baris status langsung.
              const allStudentsEdit = schools.length > 0 && schools.every(s => permsForBadge(s).every(p => p?.students !== false));
              const allAssistantsEdit = schools.length > 0 && schools.every(s => permsForBadge(s).every(p => p?.assistants !== false));
              const allExaminersEdit = schools.length > 0 && schools.every(s => permsForBadge(s).every(p => p?.examiners !== false));
              // Pembantu lalainya TUTUP pada kedua-dua baris (`=== true`), tidak
              // seperti tiga yang lain pada baris pertama. Medan `helpers` baharu;
              // sebelum ini Pembantu mengikut `assistants`. Lalai buka akan
              // membuka Pembantu pada setiap program serentak (keputusan P1).
              const allHelpersEdit = schools.length > 0 && schools.some(s => permsForBadge(s).length > 0)
                && schools.every(s => permsForBadge(s).every(p => p?.helpers === true));
              // Fasa kedua: kebenaran yang terpakai SELEPAS dihantar/disahkan.
              // Lalai di sini ialah TUTUP (`=== true`), bertentangan dengan baris
              // pertama yang lalainya buka (`!== false`). Pendaftaran yang sudah
              // disahkan tidak sepatutnya terbuka semata-mata kerana tiada
              // sesiapa pernah menetapkan apa-apa.
              const permsSelepas = (s: School) =>
                Object.entries(s.badgeEditPermissionsSelepas || {})
                  .filter(([k]) => {
                    const parsed = parseBadgeStatusKey(k);
                    return parsed.badge === badge.name && parsed.year === yearNow;
                  })
                  .map(([, v]) => v as any);
              const adaBaris = schools.some(s => permsSelepas(s).length > 0);
              const allAssistantsSelepas = adaBaris && schools.every(s => permsSelepas(s).every(p => p?.assistants === true));
              const allExaminersSelepas = adaBaris && schools.every(s => permsSelepas(s).every(p => p?.examiners === true));
              const allHelpersSelepas = adaBaris && schools.every(s => permsSelepas(s).every(p => p?.helpers === true));
              const dicaj = pegawaiDicaj(badge.name);
              const dicajPembantu = pembantuDicaj(badge.name);

              const PermissionButton = ({ type, active, icon: Icon, fasa = 'sebelum' as 'sebelum' | 'selepas', lumpuh = false, sebabLumpuh = '' }: { type: 'students' | 'assistants' | 'examiners' | 'helpers', active: boolean, icon: any, fasa?: 'sebelum' | 'selepas', lumpuh?: boolean, sebabLumpuh?: string }) => {
                const loadingKey = `${badge.name}-${type}-${fasa}`;
                const label = type === 'students' ? 'Peserta'
                  : type === 'assistants' ? 'Pemimpin'
                  : type === 'helpers' ? 'Pembantu' : 'Penguji';
                const warna = lumpuh
                  ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                  : active ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-100 text-red-700 border-red-300';
                return (
                  <button
                    onClick={() => { if (!lumpuh) handleBadgeEditPermission(badge.name, type, !active, fasa); }}
                    disabled={lumpuh || badgePermissionLoading === loadingKey}
                    className={`flex items-center justify-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold transition ${warna}`}
                    title={lumpuh ? sebabLumpuh : `${active ? 'Klik untuk tutup edit' : 'Klik untuk benarkan edit'} ${label} bagi ${badge.name}`}
                  >
                    {badgePermissionLoading === loadingKey ? <LoadingSpinner size="sm" /> : <Icon size={12} />}
                    {label}: {lumpuh ? 'DICAJ' : active ? 'ON' : 'OFF'}
                  </button>
                );
              };
              return (
                <div key={badge.name} className="p-3 rounded-lg border bg-white border-slate-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Medal size={14} className="text-amber-600" />
                    <span className="text-xs font-bold text-slate-700">{badge.name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <PermissionButton type="students" active={allStudentsEdit} icon={Users} />
                    <PermissionButton type="assistants" active={allAssistantsEdit} icon={Shield} />
                    <PermissionButton type="helpers" active={allHelpersEdit} icon={HeartHandshake} />
                    <PermissionButton type="examiners" active={allExaminersEdit} icon={GraduationCap} />
                  </div>

                  {/* Baris kedua: selepas hantar/sah. Peserta sengaja tiada. */}
                  <p className="text-[9px] font-bold text-slate-400 uppercase mt-2 mb-1">Selepas Hantar / Sah</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <PermissionButton
                      type="assistants" active={allAssistantsSelepas} icon={Shield} fasa="selepas"
                      lumpuh={dicaj}
                      sebabLumpuh={`Pemimpin dan Penolong DICAJ bagi ${badge.name}. Peranan berbayar mengambil tempat, jadi ia tidak boleh dibuka selepas pengesahan — tempat akan digunakan tanpa bil.`}
                    />
                    <PermissionButton
                      type="helpers" active={allHelpersSelepas} icon={HeartHandshake} fasa="selepas"
                      lumpuh={dicajPembantu}
                      sebabLumpuh={`Pembantu DICAJ bagi ${badge.name}. Peranan berbayar mengambil tempat, jadi ia tidak boleh dibuka selepas pengesahan — tempat akan digunakan tanpa bil.`}
                    />
                    <PermissionButton
                      type="examiners" active={allExaminersSelepas} icon={GraduationCap} fasa="selepas"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <button
          onClick={() => setAccountFilter('all')}
          className={`text-left p-4 rounded-xl border transition ${accountFilter === 'all' ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-100' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
        >
          <p className="text-xs font-bold text-gray-500 uppercase">Jumlah Sekolah</p>
          <p className="text-2xl font-black text-gray-800 mt-1">{schools.length}</p>
          <p className="text-[10px] text-gray-400 font-semibold mt-1">Semua sekolah dalam akses admin</p>
        </button>
        <button
          onClick={() => setAccountFilter('registered')}
          className={`text-left p-4 rounded-xl border transition ${accountFilter === 'registered' ? 'bg-green-50 border-green-300 ring-2 ring-green-100' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
        >
          <p className="text-xs font-bold text-green-700 uppercase flex items-center gap-1"><CheckCircle size={14} /> Sudah Daftar Akaun</p>
          <p className="text-2xl font-black text-green-700 mt-1">{registeredAccountCount}</p>
          <p className="text-[10px] text-green-600 font-semibold mt-1">Sekolah sudah claim/daftar akaun</p>
        </button>
        <button
          onClick={() => setAccountFilter('unregistered')}
          className={`text-left p-4 rounded-xl border transition ${accountFilter === 'unregistered' ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-100' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
        >
          <p className="text-xs font-bold text-amber-700 uppercase flex items-center gap-1"><Clock size={14} /> Belum Daftar Akaun</p>
          <p className="text-2xl font-black text-amber-700 mt-1">{unregisteredAccountCount}</p>
          <p className="text-[10px] text-amber-600 font-semibold mt-1">Sekolah belum claim/daftar akaun</p>
        </button>
      </div>

      <div className="mb-3 bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={schoolSearch}
            onChange={e => setSchoolSearch(e.target.value)}
            placeholder="Cari nama / kod sekolah..."
            className="w-full pl-9 pr-10 py-2 border border-gray-200 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {schoolSearch && (
            <button
              onClick={() => setSchoolSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              title="Kosongkan carian"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <p className="text-[10px] text-gray-400 mt-2 font-semibold">
          Paparan: {filteredSchools.length} / {schools.length} sekolah
        </p>
      </div>

      <div className="max-h-[600px] overflow-y-auto border rounded-lg bg-gray-50 p-2">
        {filteredSchools.map((s, i) => {
            const isLoadingThis = toggling?.name === s.name;
            const isAllEnabled = s.allowStudents && s.allowAssistants && s.allowExaminers;

            return (
                <div key={i} className="p-3 border-b last:border-0 bg-white rounded mb-2 shadow-sm flex flex-col gap-3 group">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                                <SchoolIcon size={20}/>
                            </div>
                            <div>
                                <span className="font-bold text-gray-800 block">{s.name}</span>
                                {/* Kod Sekolah - Inline Edit */}
                                {editingSchoolCode === s.name ? (
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <input
                                      type="text"
                                      value={editSchoolCodeValue}
                                      onChange={(e) => setEditSchoolCodeValue(e.target.value.toUpperCase())}
                                      className="border border-blue-300 rounded px-2 py-0.5 text-[11px] font-mono uppercase w-32 focus:ring-1 focus:ring-blue-500 outline-none"
                                      placeholder="KOD SEKOLAH"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveSchoolCode(s.name);
                                        if (e.key === 'Escape') handleCancelEditSchoolCode();
                                      }}
                                    />
                                    <button
                                      onClick={() => handleSaveSchoolCode(s.name)}
                                      disabled={savingSchoolCode === s.name}
                                      className="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-700 disabled:bg-gray-300"
                                    >
                                      {savingSchoolCode === s.name ? '...' : 'Simpan'}
                                    </button>
                                    <button
                                      onClick={handleCancelEditSchoolCode}
                                      className="text-[10px] font-bold text-gray-500 hover:text-red-600 px-1"
                                    >
                                      Batal
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                      Kod: {s.schoolCode || <span className="text-red-400 italic">TIADA</span>}
                                    </span>
                                    <button
                                      onClick={() => handleEditSchoolCode(s)}
                                      className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline font-semibold"
                                      title="Edit Kod Sekolah"
                                    >
                                      Edit
                                    </button>
                                  </div>
                                )}
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isAllEnabled ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                                    {isAllEnabled ? 'AKSES PENUH' : 'AKSES TERHAD'}
                                </span>
                                <span className={`ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.isClaimed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`} title={s.claimedEmail ? `Email: ${s.claimedEmail}` : undefined}>
                                    {s.isClaimed ? 'SUDAH DAFTAR AKAUN' : 'BELUM DAFTAR AKAUN'}
                                </span>
                                {s.isClaimed && s.claimedEmail && (
                                    <p className="text-[10px] text-gray-400 mt-1 font-semibold">Akaun: {s.claimedEmail}</p>
                                )}
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            {/* MASTER TOGGLE FOR THIS SCHOOL */}
                            <button 
                                onClick={() => handleToggle(s, 'all')}
                                disabled={isLoadingThis}
                                className={`p-1 rounded hover:bg-gray-100 transition ${isAllEnabled ? 'text-green-600' : 'text-gray-400'}`}
                                title="Toggle Semua Kategori untuk sekolah ini"
                            >
                                {isLoadingThis && toggling?.type === 'all' ? <LoadingSpinner size="sm" /> : (isAllEnabled ? <ToggleRight size={24}/> : <ToggleLeft size={24}/>)}
                            </button>
                            <div className="w-px h-4 bg-gray-300 mx-1"></div>
                            {enableResetClaim && (
                                <button
                                    onClick={() => handleResetClaim(s)}
                                    disabled={resettingClaim === s.name}
                                    className="text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition p-1 rounded"
                                    title="Reset Akaun Sekolah Supabase"
                                >
                                    {resettingClaim === s.name ? <LoadingSpinner size="sm" color="border-amber-600" /> : <RefreshCw size={16} />}
                                </button>
                            )}
                            <button 
                                onClick={() => handleDelete(s.name)} 
                                className="text-gray-300 hover:text-red-500 transition p-1"
                                title="Padam Sekolah"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>

                    {/* KATEGORI SEKOLAH — menentukan kadar yuran */}
                    <div className="flex items-center gap-2 pl-12 mb-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Kategori:</span>
                        <select
                            value={s.schoolType || 'lain'}
                            onChange={(e) => handleChangeType(s, e.target.value as SchoolType)}
                            disabled={savingType === s.schoolCode}
                            className={`text-[11px] font-bold rounded-full px-2.5 py-1 border outline-none transition disabled:opacity-50
                                ${s.schoolType === 'menengah' ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                  : s.schoolType === 'rendah' ? 'bg-teal-50 border-teal-200 text-teal-700'
                                  : 'bg-amber-50 border-amber-300 text-amber-700'}`}
                            title="Kategori menentukan kadar yuran yang dikenakan"
                        >
                            <option value="rendah">SR — Sekolah Rendah</option>
                            <option value="menengah">SM — Sekolah Menengah</option>
                            <option value="lain">Belum ditetapkan</option>
                        </select>
                    </div>

                    {/* GRANULAR PERMISSIONS */}
                    <div className="flex flex-wrap gap-2 pl-12">
                        <PermissionToggle 
                            label="Peserta" 
                            active={s.allowStudents} 
                            onClick={() => handleToggle(s, 'students')} 
                            loading={isLoadingThis && toggling?.type === 'students'}
                            icon={Users}
                            colorClass="text-blue-600 border-blue-200 bg-blue-50"
                        />
                        <PermissionToggle 
                            label="Penolong" 
                            active={s.allowAssistants} 
                            onClick={() => handleToggle(s, 'assistants')} 
                            loading={isLoadingThis && toggling?.type === 'assistants'}
                            icon={Shield}
                            colorClass="text-indigo-600 border-indigo-200 bg-indigo-50"
                        />
                        <PermissionToggle 
                            label="Penguji" 
                            active={s.allowExaminers} 
                            onClick={() => handleToggle(s, 'examiners')} 
                            loading={isLoadingThis && toggling?.type === 'examiners'}
                            icon={GraduationCap}
                            colorClass="text-green-600 border-green-200 bg-green-50"
                        />
                    </div>

                    {/* Submitted/Approved Badges Display */}
                    {(() => {
                        const statusBadges = Array.from(new Set([...(s.lockedBadges || []), ...(s.approvedBadges || [])]));
                        if (statusBadges.length === 0) return null;
                        return (
                        <div className="bg-gray-50 border border-gray-100 p-2 rounded-lg mt-1 ml-12">
                            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Status Pendaftaran:</p>
                            <div className="flex flex-wrap gap-2">
                                {statusBadges.map(badgeKey => {
                                    const isApproved = s.approvedBadges && s.approvedBadges.includes(badgeKey);
                                    // Kunci kini "<program>_<tahun>_<siri>" (migrasi 027).
                                    const kb = parseBadgeStatusKey(badgeKey);
                                    const displayBadge = badgeKey.includes('_')
                                        ? `${kb.badge} (${kb.year}${kb.siri > 1 ? ` · Siri ${kb.siri}` : ''})`
                                        : badgeKey;

                                    return (
                                        <div 
                                            key={badgeKey} 
                                            className={`
                                                text-[10px] px-2 py-1 rounded-full flex items-center gap-2 font-semibold animate-[fadeIn_0.3s_ease-out] border
                                                ${isApproved ? 'bg-green-50 border-green-200 text-green-700' : 'bg-yellow-50 border-yellow-200 text-yellow-700'}
                                            `}
                                        >
                                            {isApproved ? <CheckCircle size={10} /> : <Clock size={10} className="animate-pulse"/>}
                                            {displayBadge}
                                            
                                            <div className="h-3 w-px bg-current opacity-30 mx-0.5"></div>
                                            
                                            {isApproved ? (
                                                <button 
                                                    onClick={() => handleUnlockBadge(s.name, badgeKey)}
                                                    disabled={unlockingBadge === `${s.name}-${badgeKey}`}
                                                    className="text-green-500 hover:text-red-600 hover:bg-red-50 rounded-full p-0.5 transition"
                                                    title="Buka Semula (Unlock) untuk edit"
                                                >
                                                    {unlockingBadge === `${s.name}-${badgeKey}` ? <LoadingSpinner size="sm" color="border-red-500"/> : <X size={10}/>}
                                                </button>
                                            ) : (
                                                <div className="flex items-center gap-1">
                                                    <button 
                                                        onClick={() => handleApproveBadge(s.name, badgeKey)}
                                                        disabled={approvingBadge === `${s.name}-${badgeKey}`}
                                                        className="text-yellow-600 hover:text-green-600 hover:bg-green-100 rounded-full p-0.5 transition font-bold"
                                                        title="Sahkan Pendaftaran (Terima)"
                                                    >
                                                        {approvingBadge === `${s.name}-${badgeKey}` ? <LoadingSpinner size="sm" color="border-green-500"/> : "TERIMA"}
                                                    </button>
                                                    <button 
                                                        onClick={() => handleUnlockBadge(s.name, badgeKey)}
                                                        disabled={unlockingBadge === `${s.name}-${badgeKey}`}
                                                        className="text-red-400 hover:text-red-600 hover:bg-red-100 rounded-full p-0.5 transition"
                                                        title="Tolak / Buka Semula"
                                                    >
                                                        <X size={12}/>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        );
                    })()}
                </div>
            )
        })}
        {filteredSchools.length === 0 && (
          <p className="text-center text-gray-400 p-4">
            {schoolSearch ? 'Tiada sekolah sepadan dengan carian.' : 'Tiada sekolah dalam database.'}
          </p>
        )}
      </div>
    </div>
  );
};
