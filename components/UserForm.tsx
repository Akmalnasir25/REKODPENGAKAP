import React, { useState, useEffect } from 'react';
import { Lock, School, Medal, Users, Plus, Trash2, Save, Sparkles, CheckCircle, ArrowLeft, AlertOctagon, UserCheck, GraduationCap } from 'lucide-react';
import { LeaderInfo, Participant, BadgeType, UserSession, Badge, School as SchoolType, SubmissionData } from '../types';
import { APP_VERSION, LOGO_URL, LOCAL_STORAGE_KEYS } from '../constants';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { generateBadgeInfo } from '../services/geminiService';
import { BadgeModal } from './BadgeModal';
import { submitRegistration } from '../services/api';
import { fetchServerCsrf } from '../services/security';

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
}

export const UserForm: React.FC<UserFormProps> = ({ 
    schools, badgeTypes = [], scriptUrl, isRegistrationOpen, onAdminClick, isLoadingData, refreshData, userSession, onBackToDashboard, existingData 
}) => {
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
  const [activeTab, setActiveTab] = useState<'participants' | 'assistants' | 'examiners'>('participants');
  
  const createEmptyParticipant = (): Participant => ({ 
      id: Date.now(), 
      name: '', 
      gender: 'Lelaki', 
      race: 'Melayu',
      membershipId: '', 
      icNumber: '', 
      phoneNumber: '',
      remarks: '' 
  });

  const [participants, setParticipants] = useState<Participant[]>([createEmptyParticipant()]);
  const [assistants, setAssistants] = useState<Participant[]>([]);
  const [examiners, setExaminers] = useState<Participant[]>([]);
  
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
  // If no settings found (e.g. legacy data), default to TRUE if allowEdit is true, or fallback to false
  const allowStudents = currentSchoolSettings?.allowStudents ?? currentSchoolSettings?.allowEdit ?? false;
  const allowAssistants = currentSchoolSettings?.allowAssistants ?? currentSchoolSettings?.allowEdit ?? false;
  const allowExaminers = currentSchoolSettings?.allowExaminers ?? currentSchoolSettings?.allowEdit ?? false;
  
  const lockedBadges = currentSchoolSettings?.lockedBadges || [];
  const currentYear = new Date().getFullYear();

  // EFFECT 1: Load cached leader info on mount
  useEffect(() => {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.LEADER_CACHE);
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
  }, []);

  // EFFECT 2: Auto-save leader info to cache when it changes
  useEffect(() => {
      const cacheData = {
          principalName: leaderInfo.principalName,
          principalPhone: leaderInfo.principalPhone,
          leaderName: leaderInfo.leaderName,
          race: leaderInfo.race,
          phone: leaderInfo.phone
      };
      localStorage.setItem(LOCAL_STORAGE_KEYS.LEADER_CACHE, JSON.stringify(cacheData));
  }, [leaderInfo.principalName, leaderInfo.principalPhone, leaderInfo.leaderName, leaderInfo.race, leaderInfo.phone]);

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

  // EFFECT 4: Handle Tab Access
  useEffect(() => {
      if (activeTab === 'participants' && !allowStudents) setActiveTab('assistants');
      if (activeTab === 'assistants' && !allowAssistants) setActiveTab('examiners');
      if (activeTab === 'examiners' && !allowExaminers) setActiveTab('participants'); // Fallback loop
  }, [allowStudents, allowAssistants, allowExaminers]);


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
      alert("Sila pilih jenis lencana dahulu.");
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

  const addPerson = (list: Participant[], setList: React.Dispatch<React.SetStateAction<Participant[]>>) => {
      setList([...list, createEmptyParticipant()]);
  };

  const removePerson = (id: number, list: Participant[], setList: React.Dispatch<React.SetStateAction<Participant[]>>, minItems = 0) => {
      if(list.length > minItems) {
          setList(list.filter(p => p.id !== id));
      }
  };

  const updatePerson = (id: number, field: keyof Participant, value: string, list: Participant[], setList: React.Dispatch<React.SetStateAction<Participant[]>>) => {
      setList(list.map(p => {
          if (p.id !== id) return p;

          const updates: any = { [field]: value };

          // AUTOMATIC GENDER DETECTION FROM IC
          if (field === 'icNumber') {
              // Remove non-numeric characters
              const cleanIC = value.replace(/[^0-9]/g, '');
              
              // Only process if we have digits
              if (cleanIC.length > 0) {
                  const lastDigit = parseInt(cleanIC.slice(-1));
                  
                  // Check if last digit is Odd (Lelaki) or Even (Perempuan)
                  if (!isNaN(lastDigit)) {
                      updates.gender = lastDigit % 2 === 0 ? 'Perempuan' : 'Lelaki';
                  }
              }
          }

          return { ...p, ...updates };
      }));
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
    const allEntries = [
        ...participants.map(p => ({...p, listName: 'Peserta'})),
        ...assistants.map(p => ({...p, listName: 'Penolong'})),
        ...examiners.map(p => ({...p, listName: 'Penguji'}))
    ].filter(p => p.name.trim() !== '' || (p.icNumber && p.icNumber.trim() !== ''));

    // Check Local IC Duplicates
    const icSet = new Set<string>();
    for (const p of allEntries) {
        if (p.icNumber && p.icNumber.trim().length > 4) { // Ignore short/empty ICs
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
        const token = await fetchServerCsrf(scriptUrl);
        if (!token) { alert('Gagal mendapatkan token keselamatan dari server. Sila cuba lagi.'); setSubmitting(false); return; }
        await submitRegistration(scriptUrl, leaderInfo, participants, assistants, examiners, undefined, token);
        setSubmitted(true);
        window.scrollTo(0, 0);
        setTimeout(refreshData, 1500);
    } catch (err: any) {
        alert("Ralat: " + err.message);
    } finally {
        setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    // Only reset badgeType, keep school, principal and leader info (Auto-Fill requirement)
    setLeaderInfo(prev => ({ 
        ...prev,
        badgeType: '' 
    }));
    setParticipants([createEmptyParticipant()]);
    setAssistants([]);
    setExaminers([]);
    setActiveTab('participants');
  };

  const renderPersonInputs = (
      person: Participant, 
      index: number, 
      list: Participant[], 
      setList: React.Dispatch<React.SetStateAction<Participant[]>>,
      minItems = 0,
      requireMembershipId = false // NEW PARAMETER
  ) => (
    <div key={person.id} className="bg-white p-4 md:p-6 rounded-xl border border-gray-200 relative hover:shadow-lg transition mb-4 shadow-sm group">
        <div className="absolute -left-2 -top-2 bg-blue-900 text-white w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold shadow-md z-10">{index+1}</div>
        
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-x-4 gap-y-4 mt-2">
            
            {/* NAME FIELD */}
            <div className="sm:col-span-12 lg:col-span-4">
                <label className="text-xs text-gray-500 font-bold uppercase block mb-1">Nama Penuh</label>
                <input 
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm uppercase focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm" 
                    placeholder="Nama Penuh Peserta" 
                    value={person.name} 
                    onChange={e=>updatePerson(person.id,'name',e.target.value, list, setList)}
                />
            </div>

            {/* IC NUMBER */}
            <div className="sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-gray-500 font-bold uppercase block mb-1">No. Kad Pengenalan</label>
                <input 
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm" 
                    placeholder="000000-00-0000" 
                    value={person.icNumber} 
                    onChange={e=>updatePerson(person.id,'icNumber',e.target.value, list, setList)}
                />
            </div>
            
            {/* GENDER & RACE */}
            <div className="grid grid-cols-2 gap-4 sm:col-span-6 lg:col-span-5">
                <div>
                    <label className="text-xs text-gray-500 font-bold uppercase block mb-1">Jantina (Auto)</label>
                    <select 
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm bg-gray-100 text-gray-600 outline-none cursor-not-allowed font-bold shadow-sm" 
                        value={person.gender} 
                        disabled={true} 
                    >
                        <option>Lelaki</option>
                        <option>Perempuan</option>
                    </select>
                </div>

                <div>
                    <label className="text-xs text-gray-500 font-bold uppercase block mb-1">Kaum</label>
                    <select 
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm" 
                        value={person.race} 
                        onChange={e=>updatePerson(person.id,'race',e.target.value, list, setList)}
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
            </div>
            
            {/* PHONE */}
            <div className="sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-gray-500 font-bold uppercase block mb-1">No. Telefon</label>
                <input 
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm" 
                    placeholder="01X-XXXXXXX" 
                    value={person.phoneNumber} 
                    onChange={e=>updatePerson(person.id,'phoneNumber',e.target.value, list, setList)}
                />
            </div>

            {/* MEMBERSHIP ID */}
            <div className="sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-gray-500 font-bold uppercase block mb-1">
                    No. Keahlian {!requireMembershipId && <span className="text-gray-400 font-normal normal-case text-[10px]">(Tidak Wajib)</span>}
                </label>
                <input 
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm uppercase focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm" 
                    placeholder="ATA 0001" 
                    value={person.membershipId} 
                    onChange={e=>updatePerson(person.id,'membershipId',e.target.value, list, setList)}
                />
            </div>
            
            {/* REMARKS */}
            <div className="sm:col-span-11 lg:col-span-5">
                <label className="text-xs text-gray-500 font-bold uppercase block mb-1">Catatan</label>
                <input 
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm" 
                    placeholder="Nyatakan jika ada (Cth: Alahan)" 
                    value={person.remarks} 
                    onChange={e=>updatePerson(person.id,'remarks',e.target.value, list, setList)}
                />
            </div>
            
            {/* DELETE BUTTON */}
            <div className="sm:col-span-1 flex justify-end items-end">
                <button 
                    type="button" 
                    onClick={()=>removePerson(person.id, list, setList, minItems)} 
                    className="text-gray-400 hover:text-red-600 bg-gray-50 hover:bg-red-50 p-2.5 rounded-lg transition w-full sm:w-auto flex justify-center items-center" 
                    title="Padam Peserta Ini"
                >
                    <Trash2 size={20}/>
                </button>
            </div>
        </div>
    </div>
  );

  if (submitted) {
    return (
      <div className="max-w-3xl mx-auto p-4 mt-8 animate-[fadeIn_0.5s_ease-out]">
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-xl border-t-8 border-blue-900 text-center">
            <CheckCircle className="w-16 h-16 text-blue-900 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800">Berjaya Dihantar!</h2>
            <p className="text-blue-900 font-bold text-lg mt-2">{leaderInfo.schoolName}</p>
            <p className="text-gray-500 mb-6 font-medium bg-gray-100 inline-block px-3 py-1 rounded-full text-sm mt-2">{leaderInfo.badgeType}</p>
            
            <div className="space-y-3">
                <button onClick={handleReset} className="w-full bg-blue-900 text-white py-3 rounded-lg font-bold hover:bg-blue-800 shadow flex justify-center gap-2 transition">
                    <Plus size={20}/> Daftar Peserta Lain
                </button>
                {onBackToDashboard && (
                    <button onClick={onBackToDashboard} className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-200 flex justify-center gap-2 transition">
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
                    <img src={LOGO_URL} alt="Logo" className="h-10 w-auto object-contain drop-shadow-sm"/>
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
                            <label className="block text-sm font-semibold text-gray-700 flex items-center gap-2"><Medal size={16}/> Jenis Lencana / Kategori</label>
                            <button type="button" onClick={handleBadgeInfoAI} className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-bold flex items-center gap-1 hover:bg-purple-200 transition">
                                <Sparkles size={12}/> Info Syarat (AI)
                            </button>
                        </div>
                        <select required className="w-full p-3 border rounded-lg bg-white focus:ring-2 focus:ring-amber-400 outline-none transition" value={leaderInfo.badgeType} onChange={e=>setLeaderInfo({...leaderInfo, badgeType: e.target.value})}>
                            <option value="">-- Sila Pilih Lencana / Kategori --</option>
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
                <div className="flex border-b overflow-x-auto">
                    <button 
                        type="button"
                        onClick={() => { if(allowStudents) setActiveTab('participants'); }}
                        disabled={!allowStudents}
                        className={`flex-1 py-4 px-4 text-sm font-bold flex items-center justify-center gap-2 transition whitespace-nowrap 
                            ${activeTab === 'participants' ? 'bg-blue-50 text-blue-900 border-b-2 border-blue-900' : 'text-gray-500 hover:bg-gray-50'}
                            ${!allowStudents ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                    >
                        {allowStudents ? <Users size={16} /> : <Lock size={16}/>} Peserta ({participants.length})
                    </button>
                    <button 
                        type="button"
                        onClick={() => { if(allowAssistants) setActiveTab('assistants'); }}
                        disabled={!allowAssistants}
                        className={`flex-1 py-4 px-4 text-sm font-bold flex items-center justify-center gap-2 transition whitespace-nowrap 
                            ${activeTab === 'assistants' ? 'bg-blue-50 text-blue-900 border-b-2 border-blue-900' : 'text-gray-500 hover:bg-gray-50'}
                            ${!allowAssistants ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                    >
                        {allowAssistants ? <Users size={16} /> : <Lock size={16}/>} Penolong Pemimpin ({assistants.length})
                    </button>
                    <button 
                        type="button"
                        onClick={() => { if(allowExaminers) setActiveTab('examiners'); }}
                        disabled={!allowExaminers}
                        className={`flex-1 py-4 px-4 text-sm font-bold flex items-center justify-center gap-2 transition whitespace-nowrap 
                            ${activeTab === 'examiners' ? 'bg-blue-50 text-blue-900 border-b-2 border-blue-900' : 'text-gray-500 hover:bg-gray-50'}
                            ${!allowExaminers ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                    >
                        {allowExaminers ? <GraduationCap size={16} /> : <Lock size={16}/>} Penguji ({examiners.length})
                    </button>
                </div>
                
                <div className="p-4 md:p-6 bg-slate-50">
                    {activeTab === 'participants' && allowStudents && (
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-gray-700">Senarai Peserta</h3>
                            </div>
                            {participants.map((p, i) => renderPersonInputs(p, i, participants, setParticipants, 1, true))}
                            <button type="button" onClick={() => addPerson(participants, setParticipants)} className="mt-4 w-full py-3 border-2 border-dashed border-blue-300 rounded-lg text-blue-600 font-bold hover:bg-blue-50 flex justify-center gap-2 transition">
                                <Plus size={20}/> Tambah Peserta
                            </button>
                        </div>
                    )}

                    {activeTab === 'assistants' && allowAssistants && (
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-gray-700">Senarai Penolong Pemimpin</h3>
                            </div>
                            {assistants.map((p, i) => renderPersonInputs(p, i, assistants, setAssistants, 2, true))}
                            <button type="button" onClick={() => addPerson(assistants, setAssistants)} className="mt-4 w-full py-3 border-2 border-dashed border-blue-300 rounded-lg text-blue-600 font-bold hover:bg-blue-50 flex justify-center gap-2 transition">
                                <Plus size={20}/> Tambah Penolong Pemimpin
                            </button>
                        </div>
                    )}

                    {activeTab === 'examiners' && allowExaminers && (
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-gray-700">Senarai Penguji</h3>
                            </div>
                            {examiners.length === 0 ? (
                                <p className="text-gray-400 text-center py-4 text-sm italic">Tiada Penguji didaftarkan.</p>
                            ) : (
                                examiners.map((p, i) => renderPersonInputs(p, i, examiners, setExaminers, 0, false))
                            )}
                            <button type="button" onClick={() => addPerson(examiners, setExaminers)} className="mt-4 w-full py-3 border-2 border-dashed border-green-300 rounded-lg text-green-600 font-bold hover:bg-green-50 flex justify-center gap-2 transition">
                                <Plus size={20}/> Tambah Penguji
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="pt-4 pb-8">
                <button 
                    type="submit" 
                    disabled={submitting} 
                    className={`w-full py-4 rounded-xl text-white font-bold text-lg shadow-lg flex justify-center gap-2 transition active:scale-[0.98] ${submitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-900 hover:bg-blue-800'}`}
                >
                    {submitting ? 'Menghantar...' : <><Save size={24}/> Hantar Pendaftaran</>}
                </button>
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