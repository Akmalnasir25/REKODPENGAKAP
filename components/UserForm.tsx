import React, { useState, useEffect } from 'react';
import { Lock, School, Medal, Users, Plus, Trash2, Save, Sparkles, CheckCircle, ArrowLeft, AlertOctagon, UserCheck, GraduationCap } from 'lucide-react';
import { LeaderInfo, Participant, BadgeType, UserSession, Badge, School as SchoolType, SubmissionData } from '../types';
import { APP_VERSION, LOGO_URL, LOCAL_STORAGE_KEYS } from '../constants';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { generateBadgeInfo } from '../services/geminiService';
import { BadgeModal } from './BadgeModal';
import { submitRegistration } from '../services/supabaseApi';
import { useResolvedLogo } from '../hooks/useResolvedLogo';

interface UserFormProps {
  schools: SchoolType[]; 
  badgeTypes: Badge[]; 
  scriptUrl: string;
  isRegistrationOpen: boolean;
  onAdminClick: () => void;
  isLoadingData: boolean;
  refreshData: () => void;
  userSession?: UserSession;
  onBackToDashboard?: () => void;
  existingData?: SubmissionData[]; // Added for validation
  logoUrl?: string;
}

export const UserForm: React.FC<UserFormProps> = ({ 
    schools, badgeTypes = [], scriptUrl, isRegistrationOpen, onAdminClick, isLoadingData, refreshData, userSession, onBackToDashboard, existingData, logoUrl 
}) => {
  // Resolve logo from school's negeri/daerah
  const currentSchool = schools.find(s => s.name === userSession?.schoolName);
  const resolvedLogo = useResolvedLogo(currentSchool?.negeriCode, currentSchool?.daerahCode);
  const displayLogo = logoUrl || resolvedLogo;
  // State
  const [leaderInfo, setLeaderInfo] = useState<LeaderInfo>({ 
      schoolName: userSession?.schoolName || '', 
      schoolCode: userSession?.schoolCode || '', 
      principalName: '', 
      principalPhone: '',
      leaderName: '', 
      race: 'Melayu', // Default
      phone: '', 
      badgeType: '' 
  });
  
  // Registration Data
  type PersonRole = 'PESERTA' | 'PEMIMPIN' | 'PENOLONG PEMIMPIN' | 'PENGUJI';
  
  let participantIdCounter = 0;
  const createEmptyParticipant = (role: PersonRole = 'PESERTA'): Participant & { role: PersonRole } => ({ 
      id: Date.now() + (++participantIdCounter), 
      name: '', 
      gender: 'Lelaki', 
      race: 'Melayu',
      membershipId: '',
      icNumber: '',
      phoneNumber: '',
      kategori: 'Pengakap Kanak-kanak',
      unit: 'Perdana',
      makanan: 'Biasa',
      masalahKesihatan: 'Tiada',
      masalahKesihatanLain: '',
      remarks: '',
      role,
  } as any);

  const [allPeople, setAllPeople] = useState<(Participant & { role: PersonRole })[]>([createEmptyParticipant('PESERTA')]);
  
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  
  const [showBadgeModal, setShowBadgeModal] = useState(false);
  const [badgeInfoContent, setBadgeInfoContent] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const safeBadges: Badge[] = Array.isArray(badgeTypes) && badgeTypes.length > 0
    ? badgeTypes
    : [
        { name: BadgeType.KERIS_GANGSA, isOpen: true },
        { name: BadgeType.KERIS_PERAK, isOpen: true },
        { name: BadgeType.KERIS_EMAS, isOpen: true }
      ];

  // Determine permissions
  const currentSchoolSettings = userSession ? schools.find(s => s.name === userSession.schoolName) : null;
  const baseAllowStudents = currentSchoolSettings?.allowStudents ?? currentSchoolSettings?.allowEdit ?? false;
  const baseAllowAssistants = currentSchoolSettings?.allowAssistants ?? currentSchoolSettings?.allowEdit ?? false;
  const baseAllowExaminers = currentSchoolSettings?.allowExaminers ?? currentSchoolSettings?.allowEdit ?? false;
  const currentYear = new Date().getFullYear();
  const selectedBadgePermissionKey = leaderInfo.badgeType ? `${leaderInfo.badgeType}_${currentYear}` : '';
  const selectedBadgePermissions = selectedBadgePermissionKey ? currentSchoolSettings?.badgeEditPermissions?.[selectedBadgePermissionKey] : undefined;
  const allowStudents = selectedBadgePermissions?.students ?? baseAllowStudents;
  const allowAssistants = selectedBadgePermissions?.assistants ?? baseAllowAssistants;
  const allowExaminers = selectedBadgePermissions?.examiners ?? baseAllowExaminers;
  
  const lockedBadges = currentSchoolSettings?.lockedBadges || [];

  // EFFECT 1: Load cached leader info on mount (scoped by school code)
  useEffect(() => {
      if (!userSession?.schoolCode) return;
      const cacheKey = `${LOCAL_STORAGE_KEYS.LEADER_CACHE}_${userSession.schoolCode}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
          try {
              const parsed = JSON.parse(cached);
              setLeaderInfo(prev => ({
                  ...prev,
                  principalName: parsed.principalName || prev.principalName,
                  principalPhone: parsed.principalPhone || prev.principalPhone,
                  leaderName: parsed.leaderName || prev.leaderName,
                  race: parsed.race || 'Melayu',
                  phone: parsed.phone || prev.phone
              }));
          } catch (e) {
              console.error("Failed to parse cached leader info");
          }
      }
  }, [userSession?.schoolCode]);

  // EFFECT 2: Auto-save leader info to cache when it changes (scoped by school code)
  useEffect(() => {
      if (!userSession?.schoolCode) return;
      const cacheKey = `${LOCAL_STORAGE_KEYS.LEADER_CACHE}_${userSession.schoolCode}`;
      const cacheData = {
          principalName: leaderInfo.principalName,
          principalPhone: leaderInfo.principalPhone,
          leaderName: leaderInfo.leaderName,
          race: leaderInfo.race,
          phone: leaderInfo.phone
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
  }, [leaderInfo.principalName, leaderInfo.principalPhone, leaderInfo.leaderName, leaderInfo.race, leaderInfo.phone, userSession?.schoolCode]);

  // EFFECT 3: Sync User Session
  useEffect(() => {
      if (userSession) {
          setLeaderInfo(prev => ({
              ...prev,
              schoolName: userSession.schoolName,
              schoolCode: userSession.schoolCode
          }));
      }
  }, [userSession]);

  // EFFECT 4: (removed - no more tabs)


  // If closed globally
  if (!isRegistrationOpen) {
    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-xl shadow-xl max-w-md text-center">
                <AlertOctagon size={48} className="text-red-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Pendaftaran Ditutup</h2>
                <p className="text-gray-600 mb-6">Maaf, pendaftaran telah ditutup oleh pihak Admin.</p>
                {onBackToDashboard && (
                    <button onClick={onBackToDashboard} className="bg-blue-900 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-800 transition">
                        Kembali ke Dashboard
                    </button>
                )}
            </div>
        </div>
    );
  }

  // Check if ALL permissions are revoked
  if (userSession && (!allowStudents && !allowAssistants && !allowExaminers)) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-xl shadow-xl max-w-md text-center">
                <Lock size={48} className="text-orange-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Akses Terhad</h2>
                <p className="text-gray-600 mb-6">Sekolah anda tidak dibenarkan menambah data baru buat masa ini. Sila hubungi Admin untuk bantuan.</p>
                {onBackToDashboard && (
                    <button onClick={onBackToDashboard} className="bg-blue-900 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-800 transition">
                        Kembali ke Dashboard
                    </button>
                )}
            </div>
        </div>
      );
  }

  // Handlers
  const handleBadgeInfoAI = async () => {
    if (!leaderInfo.badgeType) {
      alert("Sila pilih jenis program/lencana dahulu.");
      return;
    }

    setAiLoading(true);
    setShowBadgeModal(true);
    setBadgeInfoContent('');

    try {
        const result = await generateBadgeInfo(leaderInfo.badgeType);
        setBadgeInfoContent(result);
    } catch (e) {
        setBadgeInfoContent("Maaf, gagal mendapatkan maklumat.");
    } finally {
        setAiLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scriptUrl) { alert("URL Database belum diset."); return; }
    
    // Check if selected badge is open globally
    const selectedBadge = safeBadges.find(b => b.name === leaderInfo.badgeType);
    if (selectedBadge && !selectedBadge.isOpen) {
        alert(`Maaf, pendaftaran untuk '${leaderInfo.badgeType}' telah ditutup.`);
        return;
    }
    
    // Check if selected badge is locked for this school FOR CURRENT YEAR
    const lockKey = `${leaderInfo.badgeType}_${currentYear}`;
    if (lockedBadges.includes(lockKey)) {
        alert(`Maaf, pendaftaran sekolah anda untuk '${leaderInfo.badgeType}' tahun ${currentYear} telah DITUTUP (Telah Dihantar).`);
        return;
    }

    // --- NEW VALIDATION LOGIC START ---
    
    // 1. Consolidate entries that have content
    const allEntries = allPeople.filter(p => p.name.trim() !== '' || (p.icNumber && p.icNumber.trim() !== ''));

    // Check Local IC Duplicates
    const icSet = new Set<string>();
    for (const p of allEntries) {
        if (p.icNumber && p.icNumber.trim().length > 4) {
            const cleanIC = p.icNumber.trim().replace(/-/g, '');
            if (icSet.has(cleanIC)) {
                alert(`Ralat: No. KP ${p.icNumber} (Nama: ${p.name}) berulang dalam borang ini.\nSila semak semula senarai anda.`);
                return;
            }
            icSet.add(cleanIC);
        }
    }

    // Check Local Name Duplicates
    const nameSet = new Set<string>();
    for (const p of allEntries) {
        const cleanName = p.name.trim().toUpperCase();
        if (cleanName) {
            if (nameSet.has(cleanName)) {
                alert(`Ralat: Nama "${p.name}" berulang dalam borang ini. Sila pastikan tiada nama yang dimasukkan dua kali.`);
                return;
            }
            nameSet.add(cleanName);
        }
    }

    // Check External/Database Duplicates
    if (existingData) {
        // Filter existing data for current year
        const yearData = existingData.filter(d => new Date(d.date).getFullYear() === currentYear);
        
        for (const p of allEntries) {
             if (p.icNumber && p.icNumber.trim().length > 4) {
                 const cleanIC = p.icNumber.trim().replace(/-/g, '');
                 
                 // Check if this IC exists in the database for the SAME badge in CURRENT YEAR
                 const duplicate = yearData.find(d => {
                     // SAFE STRING CONVERSION: d.icNumber might be number from Excel import
                     const dIC = String(d.icNumber || '').replace(/-/g, '');
                     // Strict check: Same IC, Same Badge (prevents submitting for same award twice)
                     return dIC === cleanIC && d.badge === leaderInfo.badgeType;
                 });

                 if (duplicate) {
                     alert(`HALANGAN DUPLIKASI:\n\nPeserta ${p.name} (${p.icNumber}) telah pun didaftarkan untuk lencana '${leaderInfo.badgeType}' pada tahun ${currentYear} oleh sekolah ${duplicate.school}.\n\nSila padam rekod ini dari senarai untuk meneruskan.`);
                     return;
                 }
             }
        }
    }
    // --- NEW VALIDATION LOGIC END ---

    setSubmitting(true);
    try {
        // Split allPeople by role
        const participants = allPeople.filter(p => (p as any).role === 'PESERTA' && p.name.trim());
        const assistants = allPeople.filter(p => ((p as any).role === 'PEMIMPIN' || (p as any).role === 'PENOLONG PEMIMPIN') && p.name.trim());
        const examiners = allPeople.filter(p => (p as any).role === 'PENGUJI' && p.name.trim());
        const result = await submitRegistration(scriptUrl, leaderInfo, participants, assistants, examiners, undefined);
        if (result.status === 'error') {
            alert("Ralat: " + (result.message || 'Gagal menyimpan data.'));
        } else {
            setSubmitted(true);
            window.scrollTo(0, 0);
            setTimeout(refreshData, 1500);
        }
    } catch (err: any) {
        alert("Ralat: " + err.message);
    } finally {
        setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    setLeaderInfo(prev => ({ 
        ...prev,
        badgeType: '' 
    }));
    setAllPeople([createEmptyParticipant('PESERTA')]);
  };

  if (submitted) {
    return (
      <div className="max-w-3xl mx-auto p-4 mt-8 animate-[fadeIn_0.5s_ease-out]">
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-xl border-t-8 border-emerald-700 text-center">
            <CheckCircle className="w-16 h-16 text-emerald-700 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800">Data Berjaya Disimpan!</h2>
            <p className="text-emerald-700 font-bold text-lg mt-2">{leaderInfo.schoolName}</p>
            <p className="text-gray-500 mb-4 font-medium bg-gray-100 inline-block px-3 py-1 rounded-full text-sm mt-2">{leaderInfo.badgeType}</p>
            <p className="text-sm text-gray-600 mb-6 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Data telah disimpan sebagai draf. Sila ke <span className="font-bold">Dashboard</span> dan klik <span className="font-bold">"Hantar Pendaftaran"</span> pada program yang berkenaan untuk menghantar kepada admin.
            </p>
            
            <div className="space-y-3">
                <button onClick={handleReset} className="w-full bg-emerald-700 text-white py-3 rounded-lg font-bold hover:bg-emerald-600 shadow flex justify-center gap-2 transition">
                    <Plus size={20}/> Tambah Lagi Data
                </button>
                {onBackToDashboard && (
                    <button onClick={onBackToDashboard} className="w-full bg-blue-900 text-white py-3 rounded-lg font-bold hover:bg-blue-800 flex justify-center gap-2 transition">
                        <ArrowLeft size={20}/> Kembali ke Dashboard
                    </button>
                )}
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-20 bg-slate-50 min-h-screen">
      <div className="bg-slate-900 text-white p-6 shadow-lg relative overflow-hidden border-b-4 border-amber-500">
        <div className="max-w-6xl mx-auto relative z-10 flex justify-between items-start">
            <div>
                <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3 tracking-tight">
                    <img src={displayLogo} alt="Logo" className="h-10 w-auto object-contain drop-shadow-sm"/>
                    BORANG PENDAFTARAN
                </h1>
                <p className="text-amber-500 text-sm font-mono mt-1 ml-14 uppercase tracking-widest opacity-80">Sistem Pengurusan Keahlian</p>
            </div>
            
            {onBackToDashboard ? (
                 <button onClick={onBackToDashboard} className="bg-white/10 hover:bg-white/20 p-2 px-3 rounded-lg text-white text-xs flex items-center gap-2 transition backdrop-blur-sm border border-white/20">
                    <ArrowLeft size={16}/> <span className="hidden sm:inline">Dashboard</span>
                 </button>
            ) : (
                <button onClick={onAdminClick} className="bg-white/10 hover:bg-white/20 p-2 rounded-lg text-white text-xs flex flex-col items-center gap-1 transition">
                    <Lock size={18}/> Admin
                </button>
            )}
        </div>
        {/* Background Texture */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none"></div>
      </div>

      <div className="max-w-6xl mx-auto p-4 -mt-4 relative z-20">
        {!scriptUrl && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded shadow-sm flex justify-between items-center animate-pulse">
                <div className="text-red-700 text-sm font-semibold">Sambungan Database belum dibuat!</div>
                <button onClick={onAdminClick} className="text-xs bg-red-100 hover:bg-red-200 text-red-800 px-4 py-2 rounded-lg font-bold shadow-sm">Tetapan</button>
            </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white rounded-xl shadow-md p-5 border-l-4 border-amber-500">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <School className="text-amber-600" /> Maklumat Sekolah
                    </h2>
                    {isLoadingData && <LoadingSpinner size="sm" />}
                </div>
                
                <div className="space-y-4">
                    {userSession ? (
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Nama Sekolah</label>
                                    <p className="font-bold text-gray-800">{userSession.schoolName}</p>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Kod Sekolah</label>
                                    <p className="font-mono font-bold text-gray-800">{userSession.schoolCode}</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Nama Sekolah</label>
                                <select required className="w-full p-3 border rounded-lg bg-white focus:ring-2 focus:ring-amber-400 outline-none transition" value={leaderInfo.schoolName} onChange={e=>setLeaderInfo({...leaderInfo, schoolName: e.target.value})}>
                                    <option value="">-- Pilih Sekolah --</option>
                                    {schools.map((s, idx) => <option key={idx} value={s.name}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Kod Sekolah</label>
                                <input required className="w-full p-3 border rounded-lg uppercase focus:ring-2 focus:ring-amber-400 outline-none transition" placeholder="KOD SEKOLAH" value={leaderInfo.schoolCode} onChange={e=>setLeaderInfo({...leaderInfo, schoolCode: e.target.value})}/>
                            </div>
                        </>
                    )}

                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-sm font-semibold text-gray-700 flex items-center gap-2"><Medal size={16}/> Jenis Program / Lencana</label>
                            <button type="button" onClick={handleBadgeInfoAI} className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-bold flex items-center gap-1 hover:bg-purple-200 transition">
                                <Sparkles size={12}/> Info Syarat (AI)
                            </button>
                        </div>
                        <select required className="w-full p-3 border rounded-lg bg-white focus:ring-2 focus:ring-amber-400 outline-none transition" value={leaderInfo.badgeType} onChange={e=>setLeaderInfo({...leaderInfo, badgeType: e.target.value})}>
                            <option value="">-- Sila Pilih Program / Lencana --</option>
                            {safeBadges.map((badge, idx) => {
                                if (badge.name === 'Anugerah Rambu') return null;

                                const lockKey = `${badge.name}_${currentYear}`;
                                const isLocked = lockedBadges.includes(lockKey);
                                return (
                                <option key={idx} value={badge.name} disabled={!badge.isOpen || isLocked} className={!badge.isOpen || isLocked ? 'text-gray-400' : ''}>
                                    {badge.name} {isLocked ? '(TELAH DIHANTAR)' : ''}
                                </option>
                            )})}
                        </select>
                         {leaderInfo.badgeType && lockedBadges.includes(`${leaderInfo.badgeType}_${currentYear}`) && (
                             <p className="text-red-500 text-xs mt-1 font-bold">Pendaftaran lencana ini telah anda hantar. Sila hubungi Admin jika perlu ubah.</p>
                         )}
                         {leaderInfo.badgeType && safeBadges.find(b => b.name === leaderInfo.badgeType && !b.isOpen) && (
                            <p className="text-red-500 text-xs mt-1 font-bold">Lencana ini telah ditutup. Sila pilih lencana lain.</p>
                         )}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-md border-l-4 border-blue-900 overflow-hidden">
                <div className="p-4 md:p-6 bg-slate-50">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-gray-700 flex items-center gap-2">
                            <Users size={18} /> Senarai Pendaftaran ({allPeople.filter(p => p.name.trim()).length} orang)
                        </h3>
                    </div>

                    {allPeople.map((person, index) => (
                      <div key={person.id} className="bg-white p-4 md:p-6 rounded-xl border border-gray-200 relative hover:shadow-lg transition mb-4 shadow-sm group">
                        <div className="absolute -left-2 -top-2 bg-blue-900 text-white w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold shadow-md z-10">{index+1}</div>
                        
                        {/* Delete button */}
                        {allPeople.length > 1 && (
                          <button 
                            type="button" 
                            onClick={() => setAllPeople(allPeople.filter(p => p.id !== person.id))}
                            className="absolute top-2 right-2 text-gray-300 hover:text-red-500 transition p-1 rounded-full hover:bg-red-50"
                            title="Padam"
                          >
                            <Trash2 size={16}/>
                          </button>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-x-4 gap-y-4 mt-2">
                            
                            {/* ROLE DROPDOWN */}
                            <div className="sm:col-span-12 lg:col-span-3">
                                <label className="text-xs text-gray-500 font-bold uppercase block mb-1">Peranan</label>
                                <select
                                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm font-bold"
                                    value={(person as any).role || 'PESERTA'}
                                    onChange={e => {
                                      const updated = allPeople.map(p => p.id === person.id ? { ...p, role: e.target.value as any } : p);
                                      setAllPeople(updated);
                                    }}
                                >
                                    <option value="PESERTA" disabled={!allowStudents}>Peserta</option>
                                    <option value="PEMIMPIN" disabled={!allowAssistants}>Pemimpin</option>
                                    <option value="PENOLONG PEMIMPIN" disabled={!allowAssistants}>Penolong Pemimpin</option>
                                    <option value="PENGUJI" disabled={!allowExaminers}>Penguji</option>
                                </select>
                            </div>

                            {/* NAME FIELD */}
                            <div className="sm:col-span-12 lg:col-span-4">
                                <label className="text-xs text-gray-500 font-bold uppercase block mb-1">Nama Penuh</label>
                                <input 
                                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm uppercase focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm" 
                                    placeholder="Nama Penuh" 
                                    value={person.name} 
                                    onChange={e => {
                                      const updated = allPeople.map(p => p.id === person.id ? { ...p, name: e.target.value } : p);
                                      setAllPeople(updated);
                                    }}
                                />
                            </div>

                            {/* IC NUMBER */}
                            <div className="sm:col-span-6 lg:col-span-2">
                                <label className="text-xs text-gray-500 font-bold uppercase block mb-1">No. KP</label>
                                <input 
                                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm" 
                                    placeholder="000000-00-0000" 
                                    value={person.icNumber} 
                                    onChange={e => {
                                      const val = e.target.value;
                                      // Auto-detect gender from IC
                                      let gender = person.gender;
                                      const cleanIC = val.replace(/-/g, '');
                                      if (cleanIC.length >= 12) {
                                        const lastDigit = parseInt(cleanIC[cleanIC.length - 1]);
                                        gender = lastDigit % 2 === 0 ? 'Perempuan' : 'Lelaki';
                                      }
                                      const updated = allPeople.map(p => p.id === person.id ? { ...p, icNumber: val, gender } : p);
                                      setAllPeople(updated);
                                    }}
                                />
                            </div>
                            
                            {/* GENDER */}
                            <div className="sm:col-span-3 lg:col-span-1">
                                <label className="text-xs text-gray-500 font-bold uppercase block mb-1">Jantina</label>
                                <select 
                                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm bg-gray-100 text-gray-600 outline-none cursor-not-allowed font-bold shadow-sm" 
                                    value={person.gender} 
                                    disabled={true} 
                                >
                                    <option>Lelaki</option>
                                    <option>Perempuan</option>
                                </select>
                            </div>

                            {/* RACE */}
                            <div className="sm:col-span-3 lg:col-span-2">
                                <label className="text-xs text-gray-500 font-bold uppercase block mb-1">Kaum</label>
                                <select 
                                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm" 
                                    value={person.race} 
                                    onChange={e => {
                                      const updated = allPeople.map(p => p.id === person.id ? { ...p, race: e.target.value } : p);
                                      setAllPeople(updated);
                                    }}
                                >
                                    <option>Melayu</option>
                                    <option>Cina</option>
                                    <option>India</option>
                                    <option>Bumiputera Sabah</option>
                                    <option>Bumiputera Sarawak</option>
                                    <option>Orang Asli</option>
                                    <option>Lain-lain</option>
                                </select>
                            </div>
                            
                            {/* PHONE */}
                            <div className="sm:col-span-4 lg:col-span-2">
                                <label className="text-xs text-gray-500 font-bold uppercase block mb-1">No. Telefon</label>
                                <input 
                                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm" 
                                    placeholder="01X-XXXXXXX" 
                                    value={person.phoneNumber} 
                                    onChange={e => {
                                      const updated = allPeople.map(p => p.id === person.id ? { ...p, phoneNumber: e.target.value } : p);
                                      setAllPeople(updated);
                                    }}
                                />
                            </div>

                            {/* MEMBERSHIP ID */}
                            <div className="sm:col-span-4 lg:col-span-2">
                                <label className="text-xs text-gray-500 font-bold uppercase block mb-1">No. Keahlian</label>
                                <input 
                                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm uppercase focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm" 
                                    placeholder="ATA 0001" 
                                    value={person.membershipId} 
                                    onChange={e => {
                                      const updated = allPeople.map(p => p.id === person.id ? { ...p, membershipId: e.target.value } : p);
                                      setAllPeople(updated);
                                    }}
                                />
                            </div>

                            {/* CATEGORY (only for PESERTA) */}
                            {(person as any).role === 'PESERTA' && (
                              <>
                              <div className="sm:col-span-4 lg:col-span-2">
                                  <label className="text-xs text-gray-500 font-bold uppercase block mb-1">Kategori</label>
                                  <select
                                      className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm"
                                      value={person.kategori || 'Pengakap Kanak-kanak'}
                                      onChange={e => {
                                        const updated = allPeople.map(p => p.id === person.id ? { ...p, kategori: e.target.value } : p);
                                        setAllPeople(updated);
                                      }}
                                  >
                                      <option>Pengakap Kanak-kanak</option>
                                      <option>Pengakap Muda</option>
                                      <option>Pengakap Remaja</option>
                                      <option>Kelana</option>
                                  </select>
                              </div>

                              <div className="sm:col-span-4 lg:col-span-2">
                                  <label className="text-xs text-gray-500 font-bold uppercase block mb-1">Unit</label>
                                  <select
                                      className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm"
                                      value={person.unit || 'Perdana'}
                                      onChange={e => {
                                        const updated = allPeople.map(p => p.id === person.id ? { ...p, unit: e.target.value } : p);
                                        setAllPeople(updated);
                                      }}
                                  >
                                      <option>Perdana</option>
                                      <option>Udara</option>
                                      <option>Laut</option>
                                      <option>PPKI</option>
                                      <option>PPKI Udara</option>
                                  </select>
                              </div>

                              <div className="sm:col-span-4 lg:col-span-2">
                                  <label className="text-xs text-gray-500 font-bold uppercase block mb-1">Makanan</label>
                                  <select
                                      className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm"
                                      value={person.makanan || 'Biasa'}
                                      onChange={e => {
                                        const updated = allPeople.map(p => p.id === person.id ? { ...p, makanan: e.target.value } : p);
                                        setAllPeople(updated);
                                      }}
                                  >
                                      <option>Biasa</option>
                                      <option>Vegetarian</option>
                                  </select>
                              </div>

                              <div className="sm:col-span-6 lg:col-span-3">
                                  <label className="text-xs text-gray-500 font-bold uppercase block mb-1">Masalah Kesihatan</label>
                                  <select
                                      className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm"
                                      value={person.masalahKesihatan || 'Tiada'}
                                      onChange={e => {
                                        const updated = allPeople.map(p => p.id === person.id ? { ...p, masalahKesihatan: e.target.value, masalahKesihatanLain: e.target.value !== 'Lain-lain' ? '' : (p as any).masalahKesihatanLain } : p);
                                        setAllPeople(updated);
                                      }}
                                  >
                                      <option>Tiada</option>
                                      <option>Alahan</option>
                                      <option>Asma</option>
                                      <option>Gastrik</option>
                                      <option>Penyakit Jantung</option>
                                      <option>Migrain</option>
                                      <option>Penyakit Kronik</option>
                                      <option>Lain-lain</option>
                                  </select>
                              </div>

                              {(person as any).masalahKesihatan === 'Lain-lain' && (
                                <div className="sm:col-span-6 lg:col-span-3">
                                    <label className="text-xs text-gray-500 font-bold uppercase block mb-1">Nyatakan Penyakit</label>
                                    <input
                                        className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm"
                                        placeholder="Nyatakan penyakit..."
                                        value={(person as any).masalahKesihatanLain || ''}
                                        onChange={e => {
                                          const updated = allPeople.map(p => p.id === person.id ? { ...p, masalahKesihatanLain: e.target.value } : p);
                                          setAllPeople(updated);
                                        }}
                                    />
                                </div>
                              )}
                              </>
                            )}
                            
                            {/* REMARKS / EMAIL */}
                            <div className="sm:col-span-12 lg:col-span-4">
                                <label className="text-xs text-gray-500 font-bold uppercase block mb-1">Catatan / Email</label>
                                <input 
                                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm" 
                                    placeholder="Cth: email@guru.com / Alahan" 
                                    value={person.remarks} 
                                    onChange={e => {
                                      const updated = allPeople.map(p => p.id === person.id ? { ...p, remarks: e.target.value } : p);
                                      setAllPeople(updated);
                                    }}
                                />
                            </div>
                        </div>
                      </div>
                    ))}

                    <button type="button" onClick={() => setAllPeople([...allPeople, createEmptyParticipant('PESERTA')])} className="mt-2 w-full py-3 border-2 border-dashed border-blue-300 rounded-lg text-blue-600 font-bold hover:bg-blue-50 flex justify-center gap-2 transition">
                        <Plus size={20}/> Tambah Peserta
                    </button>
                </div>
            </div>

            <div className="pt-4 pb-8">
                <button 
                    type="submit" 
                    disabled={submitting} 
                    className={`w-full py-4 rounded-xl text-white font-bold text-lg shadow-lg flex justify-center gap-2 transition active:scale-[0.98] ${submitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-emerald-700 hover:bg-emerald-600'}`}
                >
                    {submitting ? 'Menyimpan...' : <><Save size={24}/> Simpan Data</>}
                </button>
                <p className="text-center text-xs text-gray-500 mt-2">
                  Data akan disimpan sebagai draf. Sila hantar pendaftaran dari Dashboard untuk pengesahan admin.
                </p>
                <div className="flex flex-col items-center justify-center gap-1.5 text-[10px] text-gray-400 font-semibold mt-6 border-t border-gray-200 pt-4 w-full">
                    <span className="uppercase tracking-[0.2em] font-sans">Design By Akmal Nasir<sup className="ml-0.5">&trade;</sup></span>
                    <div className="flex items-center gap-2">
                        <span className="font-mono">{APP_VERSION.split(' ')[0]}</span>
                        <span className="text-gray-300">|</span>
                        <span className="bg-purple-50 text-purple-600 px-2 py-0.5 rounded text-[9px] font-bold border border-purple-100 flex items-center gap-1"><Sparkles size={10}/> AI Powered</span>
                    </div>
                </div>
            </div>
        </form>
      </div>

      <BadgeModal 
        isOpen={showBadgeModal} 
        onClose={() => setShowBadgeModal(false)} 
        badgeType={leaderInfo.badgeType}
        content={badgeInfoContent}
        loading={aiLoading}
      />
    </div>
  );
};