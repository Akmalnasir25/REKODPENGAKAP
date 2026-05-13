

import React, { useState } from 'react';
import { Plus, Trash2, RefreshCw, ToggleLeft, ToggleRight, Settings2, Lock, X, CheckCircle, Clock, Users, Shield, GraduationCap, School as SchoolIcon, Layers, Medal, Search } from 'lucide-react';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { addSchoolBatch, deleteSchool, updateSchoolPermission, toggleSchoolEditBatch, unlockSchoolBadge, approveSchoolBadge, toggleBadgeEditPermissionBatch } from '../services/supabaseApi';
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
  const [badgePermissionLoading, setBadgePermissionLoading] = useState<string | null>(null);
  const [unlockingBadge, setUnlockingBadge] = useState<string | null>(null); 
  const [approvingBadge, setApprovingBadge] = useState<string | null>(null); 
  const [resettingClaim, setResettingClaim] = useState<string | null>(null);
  const [schoolSearch, setSchoolSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState<'all' | 'registered' | 'unregistered'>('all');

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

  const handleBadgeEditPermission = async (badgeName: string, type: 'students' | 'assistants' | 'examiners' | 'all', allow: boolean) => {
    const label = type === 'students' ? 'PESERTA' : type === 'assistants' ? 'PENOLONG PEMIMPIN' : type === 'examiners' ? 'PENGUJI' : 'SEMUA KATEGORI';
    const actionText = allow ? 'MEMBENARKAN EDIT' : 'MENUTUP EDIT';
    if (!confirm(`KAWALAN EDIT PROGRAM:\n\nAdakah anda pasti mahu ${actionText} ${label} untuk program '${badgeName}' bagi SEMUA sekolah?\n\nProgram lain tidak akan terkesan.`)) return;
    
    const loadingKey = `${badgeName}-${type}`;
    setBadgePermissionLoading(loadingKey);
    try {
      const res = await toggleBadgeEditPermissionBatch(scriptUrl, badgeName, type, allow);
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

      {/* PER-BADGE EDIT PERMISSION PANEL */}
      {badges.length > 0 && (
        <div className="mb-6 bg-amber-50 p-4 rounded-xl border border-amber-200">
          <div className="flex items-center gap-2 mb-3">
            <Settings2 size={18} className="text-amber-600"/>
            <span className="text-sm font-bold text-amber-800 uppercase">Kawalan Edit Pukal Mengikut Program</span>
          </div>
          <p className="text-xs text-amber-600 mb-3">Benarkan/tutup edit Peserta, Penolong Pemimpin dan Penguji untuk SEMUA sekolah mengikut program. Contoh: tutup Peserta untuk Keris Perak sahaja, program lain masih boleh edit.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {badges.map(badge => {
              const currentYearKey = `${badge.name}_${new Date().getFullYear()}`;
              const allStudentsEdit = schools.length > 0 && schools.every(s => s.badgeEditPermissions?.[currentYearKey]?.students !== false);
              const allAssistantsEdit = schools.length > 0 && schools.every(s => s.badgeEditPermissions?.[currentYearKey]?.assistants !== false);
              const allExaminersEdit = schools.length > 0 && schools.every(s => s.badgeEditPermissions?.[currentYearKey]?.examiners !== false);
              const PermissionButton = ({ type, active, icon: Icon }: { type: 'students' | 'assistants' | 'examiners', active: boolean, icon: any }) => {
                const loadingKey = `${badge.name}-${type}`;
                const label = type === 'students' ? 'Peserta' : type === 'assistants' ? 'Penolong' : 'Penguji';
                return (
                  <button
                    onClick={() => handleBadgeEditPermission(badge.name, type, !active)}
                    disabled={badgePermissionLoading === loadingKey}
                    className={`flex items-center justify-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold transition ${active ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-100 text-red-700 border-red-300'}`}
                    title={`${active ? 'Klik untuk tutup edit' : 'Klik untuk benarkan edit'} ${label} bagi ${badge.name}`}
                  >
                    {badgePermissionLoading === loadingKey ? <LoadingSpinner size="sm" /> : <Icon size={12} />}
                    {label}: {active ? 'ON' : 'OFF'}
                  </button>
                );
              };
              return (
                <div key={badge.name} className="p-3 rounded-lg border bg-white border-slate-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Medal size={14} className="text-amber-600" />
                    <span className="text-xs font-bold text-slate-700">{badge.name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <PermissionButton type="students" active={allStudentsEdit} icon={Users} />
                    <PermissionButton type="assistants" active={allAssistantsEdit} icon={Shield} />
                    <PermissionButton type="examiners" active={allExaminersEdit} icon={GraduationCap} />
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
