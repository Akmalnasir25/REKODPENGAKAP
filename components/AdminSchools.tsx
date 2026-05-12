

import React, { useState } from 'react';
import { Plus, Trash2, RefreshCw, ToggleLeft, ToggleRight, Settings2, Lock, X, CheckCircle, Clock, Users, Shield, GraduationCap, School as SchoolIcon, Layers } from 'lucide-react';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { addSchoolBatch, deleteSchool, updateSchoolPermission, toggleSchoolEditBatch, unlockSchoolBadge, approveSchoolBadge, batchLockBadgeAllSchools } from '../services/supabaseApi';
import { resetSchoolClaim } from '../services/supabaseAuth';
import { School, Badge } from '../types';

interface AdminSchoolsProps {
  schools: School[];
  badges?: Badge[];
  scriptUrl: string;
  negeriCode?: string;
  daerahCode?: string;
  onRefresh: () => void;
  enableResetClaim?: boolean;
}

export const AdminSchools: React.FC<AdminSchoolsProps> = ({ schools = [], badges = [], scriptUrl, negeriCode, daerahCode, onRefresh, enableResetClaim = false }) => {
  const [newSchoolName, setNewSchoolName] = useState('');
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<{name: string, type: string} | null>(null);
  const [batchToggling, setBatchToggling] = useState<string | null>(null);
  const [badgeLocking, setBadgeLocking] = useState<string | null>(null);
  const [unlockingBadge, setUnlockingBadge] = useState<string | null>(null); 
  const [approvingBadge, setApprovingBadge] = useState<string | null>(null); 
  const [resettingClaim, setResettingClaim] = useState<string | null>(null);

  // Batch toggle check
  const allStudentsAllowed = schools.length > 0 && schools.every(s => s.allowStudents);
  const allAssistantsAllowed = schools.length > 0 && schools.every(s => s.allowAssistants);
  const allExaminersAllowed = schools.length > 0 && schools.every(s => s.allowExaminers);
  const allAllowed = schools.length > 0 && schools.every(s => s.allowStudents && s.allowAssistants && s.allowExaminers);

  const handleAdd = async () => {
    // 1. Split and Normalize Input
    const rawSchoolNames = newSchoolName.split('\n')
      .map(name => name.toUpperCase().trim())
      .filter(name => name.length > 0);

    if (rawSchoolNames.length === 0) return;

    // 2. Remove Internal Duplicates (Input list itself)
    const uniqueInputSchools: string[] = Array.from(new Set(rawSchoolNames));

    const existingSchoolNames = schools.map(s => s.name.toUpperCase().trim());
    const uniqueSchoolsToSend: string[] = [];
    const duplicateSchools: string[] = [];

    // 3. Filter against Database
    uniqueInputSchools.forEach(name => {
      if (existingSchoolNames.includes(name)) {
        duplicateSchools.push(name);
      } else {
        uniqueSchoolsToSend.push(name);
      }
    });

    if (uniqueSchoolsToSend.length === 0) {
      alert(`Semua nama yang dimasukkan sudah wujud:\n${duplicateSchools.join(', ')}`);
      setNewSchoolName('');
      return;
    }

    setLoading(true);
    try {
        await addSchoolBatch(scriptUrl, uniqueSchoolsToSend, negeriCode, daerahCode);
        
        let finalMessage = `${uniqueSchoolsToSend.length} sekolah berjaya dihantar.`;
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

  const handleBadgeLock = async (badgeName: string, lock: boolean) => {
    const actionText = lock ? 'MENGUNCI' : 'MEMBUKA';
    if (!confirm(`TINDAKAN PUKAL:\n\nAdakah anda pasti mahu ${actionText} program '${badgeName}' untuk SEMUA sekolah?`)) return;
    
    setBadgeLocking(badgeName);
    try {
      const res = await batchLockBadgeAllSchools(scriptUrl, badgeName, lock);
      if (res.status === 'success') {
        alert(res.message || `Berjaya ${lock ? 'dikunci' : 'dibuka'}.`);
        onRefresh();
      } else {
        alert('Gagal: ' + res.message);
      }
    } catch (e) {
      alert('Ralat sambungan.');
    } finally {
      setBadgeLocking(null);
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
      if (!confirm(`Buka semula pendaftaran '${displayBadge}' untuk ${schoolName}?\n\nSekolah ini akan boleh mengedit semula data peserta bagi lencana ini.`)) return;
      
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
        <textarea
          className="w-full p-3 border rounded-lg uppercase h-24 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
          placeholder="MASUKKAN NAMA SEKOLAH (Satu setiap baris)"
          value={newSchoolName}
          onChange={e => setNewSchoolName(e.target.value)}
        ></textarea>
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

      {/* PER-BADGE BATCH LOCK PANEL */}
      {badges.length > 0 && (
        <div className="mb-6 bg-amber-50 p-4 rounded-xl border border-amber-200">
          <div className="flex items-center gap-2 mb-3">
            <Lock size={18} className="text-amber-600"/>
            <span className="text-sm font-bold text-amber-800 uppercase">Kawalan Pukal Mengikut Program</span>
          </div>
          <p className="text-xs text-amber-600 mb-3">Kunci/buka program untuk SEMUA sekolah sekaligus. Jika dikunci, sekolah tidak boleh menghantar pendaftaran bagi program tersebut.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {badges.map(badge => {
              const isLocked = schools.length > 0 && schools.every(s => s.lockedBadges?.includes(badge.name));
              const isLoading = badgeLocking === badge.name;
              return (
                <div key={badge.name} className={`flex items-center justify-between p-3 rounded-lg border transition ${isLocked ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-center gap-2">
                    <Medal size={14} className={isLocked ? 'text-red-500' : 'text-amber-600'} />
                    <span className="text-xs font-bold text-slate-700">{badge.name}</span>
                  </div>
                  <button
                    onClick={() => handleBadgeLock(badge.name, !isLocked)}
                    disabled={isLoading}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition border ${
                      isLocked 
                        ? 'bg-red-100 text-red-700 border-red-300 hover:bg-green-100 hover:text-green-700 hover:border-green-300' 
                        : 'bg-green-100 text-green-700 border-green-300 hover:bg-red-100 hover:text-red-700 hover:border-red-300'
                    }`}
                    title={isLocked ? 'Klik untuk buka semula' : 'Klik untuk kunci'}
                  >
                    {isLoading ? <LoadingSpinner size="sm" /> : (isLocked ? <Lock size={12} /> : <ToggleRight size={12} />)}
                    {isLocked ? 'DIKUNCI' : 'DIBUKA'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="max-h-[600px] overflow-y-auto border rounded-lg bg-gray-50 p-2">
        {schools.map((s, i) => {
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
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isAllEnabled ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                                    {isAllEnabled ? 'AKSES PENUH' : 'AKSES TERHAD'}
                                </span>
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

                    {/* Locked/Submitted Badges Display */}
                    {s.lockedBadges && s.lockedBadges.length > 0 && (
                        <div className="bg-gray-50 border border-gray-100 p-2 rounded-lg mt-1 ml-12">
                            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Status Pendaftaran:</p>
                            <div className="flex flex-wrap gap-2">
                                {s.lockedBadges.map(badgeKey => {
                                    const isApproved = s.approvedBadges && s.approvedBadges.includes(badgeKey);
                                    const displayBadge = badgeKey.includes('_') 
                                        ? `${badgeKey.split('_')[0]} (${badgeKey.split('_')[1]})` 
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
                    )}
                </div>
            )
        })}
        {schools.length === 0 && <p className="text-center text-gray-400 p-4">Tiada sekolah dalam database.</p>}
      </div>
    </div>
  );
};
