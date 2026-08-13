import React, { useState, useEffect, useRef } from 'react';
import { Lock, School, Medal, Users, Plus, Trash2, Save, CheckCircle, ArrowLeft, AlertOctagon, UserCheck, GraduationCap, Layers } from 'lucide-react';
import { LeaderInfo, Participant, BadgeType, UserSession, Badge, School as SchoolType, SubmissionData } from '../types';
import { APP_VERSION, LOGO_URL, LOCAL_STORAGE_KEYS } from '../constants';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { submitRegistration, getProgramSettings, ProgramSetting } from '../services/supabaseApi';
import { useResolvedLogo } from '../hooks/useResolvedLogo';
import { PrivacyNotice } from './ui/PrivacyNotice';
import { badgeStatusKey, resolveBadgePermissions } from '../utils/dataProcessing';

// Program dikira tutup jika di-tutup manual (isOpen false) ATAU tarikh hari ini
// sudah melepasi tarikh akhir. Pendaftaran masih dibenarkan pada hari tarikh akhir itu sendiri.
const isBadgeClosed = (b?: { isOpen: boolean; deadline?: string | null }): boolean => {
  if (!b) return true;
  if (!b.isOpen) return true;
  if (b.deadline) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(b.deadline); d.setHours(0, 0, 0, 0);
    if (!isNaN(d.getTime()) && d < today) return true; // tarikh akhir sudah lepas
  }
  return false;
};

interface UserFormProps {
  schools: SchoolType[];
  badgeTypes: Badge[];
  negeriList?: import('../types').Negeri[];
  daerahList?: import('../types').Daerah[];
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
    schools, badgeTypes = [], negeriList = [], daerahList = [], scriptUrl, isRegistrationOpen, onAdminClick, isLoadingData, refreshData, userSession, onBackToDashboard, existingData, logoUrl
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

  const [selectedNegeri, setSelectedNegeri] = useState('');
  const [selectedDaerah, setSelectedDaerah] = useState('');
  
  // Registration Data
  type PersonRole = 'PESERTA' | 'PEMIMPIN' | 'PENOLONG PEMIMPIN' | 'PEMBANTU' | 'PENGUJI';
  
  const participantIdCounterRef = useRef(0);
  const createEmptyParticipant = (role: PersonRole = 'PESERTA'): Participant & { role: PersonRole } => ({ 
      id: Date.now() + (++participantIdCounterRef.current), 
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
  
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [parentalConsent, setParentalConsent] = useState(false);
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(false);

  // Tahun pendaftaran — benarkan daftar untuk tahun lampau (backdated) bagi peserta yang belum direkod.
  const thisYear = new Date().getFullYear();
  const [registrationYear, setRegistrationYear] = useState(thisYear);
  const yearOptions = [thisYear, thisYear - 1, thisYear - 2, thisYear - 3];
  // Siri (program berperingkat) — hanya relevan bila program dipilih aktifkan siri_enabled.
  const [registrationSiri, setRegistrationSiri] = useState(1);

  // Determine permissions
  const currentSchoolSettings = userSession ? schools.find(s => s.name === userSession.schoolName) : null;
  const baseAllowStudents = currentSchoolSettings?.allowStudents ?? currentSchoolSettings?.allowEdit ?? false;
  const baseAllowAssistants = currentSchoolSettings?.allowAssistants ?? currentSchoolSettings?.allowEdit ?? false;
  const baseAllowExaminers = currentSchoolSettings?.allowExaminers ?? currentSchoolSettings?.allowEdit ?? false;
  // Tahun kohort = tahun pendaftaran dipilih (boleh backdated). Semua semakan kebenaran/kunci/pendua ikut tahun ini.
  const currentYear = registrationYear;

  const schoolNegeriCode = currentSchoolSettings?.negeriCode;
  const schoolDaerahCode = currentSchoolSettings?.daerahCode;

  // Tetapan program dibaca DI SINI, sebelum kebenaran diselesaikan. Kebenaran
  // fasa kedua perlu tahu peranan mana yang dicaj, jadi ia tidak boleh dikira
  // sebelum tetapan ini wujud.
  const [programSettings, setProgramSettings] = useState<ProgramSetting[]>([]);
  useEffect(() => {
    let active = true;
    getProgramSettings(currentYear).then(s => { if (active) setProgramSettings(s); });
    return () => { active = false; };
  }, [currentYear]);
  const selectedProgramSetting = programSettings.find(s =>
    s.badgeName === leaderInfo.badgeType &&
    ((s.scope === 'negeri' && s.negeriCode === schoolNegeriCode) ||
     (s.scope === 'daerah' && s.daerahCode === schoolDaerahCode)));
  const shirtEnabled = !!selectedProgramSetting?.shirtEnabled;
  const siriEnabled = !!selectedProgramSetting?.siriEnabled;
  const siriOptions = Array.from({ length: selectedProgramSetting?.maxSiri || 5 }, (_, i) => i + 1);
  // Kunci status ikut siri (migrasi 027) — setiap siri ialah pusingan berasingan.
  // Kebenaran diselesaikan dengan sandaran ke Siri 1 — togol admin ialah
  // peringkat PROGRAM, jadi Siri 2 tidak boleh terbuka semata-mata kerana
  // barisnya belum wujud semasa togol ditetapkan.
  const selectedBadgePermissions = resolveBadgePermissions(
    currentSchoolSettings?.badgeEditPermissions,
    leaderInfo.badgeType, currentYear, registrationSiri,
  );
  const lockedBadges = currentSchoolSettings?.lockedBadges || [];
  const approvedBadges = currentSchoolSettings?.approvedBadges || [];

  // Sudah dihantar ATAU sudah disahkan. Dahulunya hanya `lockedBadges` (status
  // 'submitted') disemak di sini, jadi lencana yang DILULUSKAN keluar daripada
  // senarai itu dan pendaftaran terbuka semula secara senyap — sedangkan
  // mengedit rekod yang sama kekal disekat di papan pemuka. Tambah dan edit
  // kini mengikut peraturan yang sama.
  const kunciSemasa = badgeStatusKey(leaderInfo.badgeType, currentYear, registrationSiri);
  const sudahHantar = !!leaderInfo.badgeType
    && (lockedBadges.includes(kunciSemasa) || approvedBadges.includes(kunciSemasa));

  // Fasa kedua: hanya pegawai yang TIDAK dicaj, dan hanya bila admin membukanya.
  const izinSelepas = resolveBadgePermissions(
    currentSchoolSettings?.badgeEditPermissionsSelepas,
    leaderInfo.badgeType, currentYear, registrationSiri,
  );
  const pegawaiDicaj = selectedProgramSetting
    ? (selectedProgramSetting.feePemimpin != null || selectedProgramSetting.feePenolong != null)
    : false;

  // Versi per program bagi senarai lungsur: adakah program ini masih menerima
  // sesuatu selepas dihantar? Menggunakan tetapan program itu sendiri, bukan
  // yang sedang dipilih.
  const pegawaiTerbukaSelepas = (badgeName: string) => {
    const izin = resolveBadgePermissions(
      currentSchoolSettings?.badgeEditPermissionsSelepas, badgeName, currentYear, registrationSiri,
    );
    if (izin?.examiners === true) return true;
    if (izin?.assistants !== true) return false;
    const ps = programSettings.find(s =>
      s.badgeName === badgeName &&
      ((s.scope === 'negeri' && s.negeriCode === schoolNegeriCode) ||
       (s.scope === 'daerah' && s.daerahCode === schoolDaerahCode)));
    return !(ps && (ps.feePemimpin != null || ps.feePenolong != null));
  };

  const allowStudents = sudahHantar ? false
    : (selectedBadgePermissions?.students ?? baseAllowStudents);
  const allowAssistants = sudahHantar ? (izinSelepas?.assistants === true && !pegawaiDicaj)
    : (selectedBadgePermissions?.assistants ?? baseAllowAssistants);
  const allowExaminers = sudahHantar ? (izinSelepas?.examiners === true)
    : (selectedBadgePermissions?.examiners ?? baseAllowExaminers);

  // Peranan yang benar-benar boleh didaftar untuk program ini.
  //
  // Dropdown peranan melumpuhkan pilihan yang ditutup, tetapi itu hanya
  // menghalang MENUKAR kepadanya. Baris baharu dahulunya sentiasa bermula
  // sebagai PESERTA, jadi menutup Peserta tidak menghalang apa-apa: sekolah
  // menekan Tambah, mengisi nama, dan menghantar.
  const peranaanDibenarkan = React.useMemo<PersonRole[]>(() => {
    const senarai: PersonRole[] = [];
    if (allowStudents) senarai.push('PESERTA');
    if (allowAssistants) senarai.push('PEMIMPIN', 'PENOLONG PEMIMPIN', 'PEMBANTU');
    if (allowExaminers) senarai.push('PENGUJI');
    return senarai;
  }, [allowStudents, allowAssistants, allowExaminers]);
  const peranaanLalai: PersonRole = peranaanDibenarkan[0] ?? 'PESERTA';

  // Baris KOSONG yang memegang peranan tertutup dibetulkan secara senyap —
  // termasuk baris pertama borang, yang wujud sebelum kebenaran dimuatkan.
  // Baris yang sudah diisi tidak disentuh; ia dihalang semasa hantar dengan
  // mesej, supaya tiada kerja sekolah hilang tanpa penjelasan.
  useEffect(() => {
    if (peranaanDibenarkan.length === 0) return;
    setAllPeople(prev => {
      let berubah = false;
      const baharu = prev.map(p => {
        const kosong = !p.name.trim() && !(p.icNumber || '').trim();
        if (kosong && !peranaanDibenarkan.includes((p as any).role)) {
          berubah = true;
          return { ...p, role: peranaanLalai };
        }
        return p;
      });
      return berubah ? baharu : prev;
    });
  }, [peranaanDibenarkan, peranaanLalai]);

  // FILTER BADGES BY SCOPE based on current school's negeri/daerah
  // Reset ke Siri 1 bila tukar ke program yang tak aktifkan siri, atau siri terpilih melebihi had program baru.
  useEffect(() => {
    if (!siriEnabled || registrationSiri > siriOptions.length) setRegistrationSiri(1);
  }, [siriEnabled, siriOptions.length]);
  const filteredBadges = (badgeTypes || []).filter((badge: Badge) => {
    const scope = badge.scope || 'daerah';
    if (scope === 'daerah') {
      // Daerah-level badges: must match school's daerah, or if badge has no daerahCode, show to all (fallback)
      return badge.daerahCode ? badge.daerahCode === schoolDaerahCode : true;
    } else {
      // Negeri-level badges: must match school's negeri, or if badge has no negeriCode, show to all (fallback)
      return badge.negeriCode ? badge.negeriCode === schoolNegeriCode : true;
    }
  });
  const safeBadges: Badge[] = filteredBadges.length > 0 ? filteredBadges : [
    { name: BadgeType.KERIS_GANGSA, isOpen: true },
    { name: BadgeType.KERIS_PERAK, isOpen: true },
    { name: BadgeType.KERIS_EMAS, isOpen: true }
  ];
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scriptUrl) { alert("URL Database belum diset."); return; }
    
    // Check if selected badge is open globally (status TUTUP atau tarikh akhir sudah lepas)
    const selectedBadge = safeBadges.find(b => b.name === leaderInfo.badgeType);
    if (selectedBadge && isBadgeClosed(selectedBadge)) {
        alert(`Maaf, pendaftaran untuk '${leaderInfo.badgeType}' telah ditutup.`);
        return;
    }
    
    // Kunci ikut program + tahun + SIRI. Sekolah yang sudah hantar Siri 1 masih
    // boleh hantar Siri 2 untuk program yang sama (migrasi 027).
    // Sudah dihantar/disahkan tidak lagi bermakna tertutup rapat: admin boleh
    // membuka pegawai yang tidak dicaj. Yang menutup pintu ialah ketiadaan
    // peranan yang dibenarkan, bukan status itu sendiri.
    if (sudahHantar && peranaanDibenarkan.length === 0) {
        const siriLabel = siriEnabled ? ` (Siri ${registrationSiri})` : '';
        alert(`Maaf, pendaftaran sekolah anda untuk '${leaderInfo.badgeType}'${siriLabel} tahun ${currentYear} telah DITUTUP (Telah Dihantar).`);
        return;
    }

    // --- NEW VALIDATION LOGIC START ---
    
    // 1. Consolidate entries that have content
    const allEntries = allPeople.filter(p => p.name.trim() !== '' || (p.icNumber && p.icNumber.trim() !== ''));

    // Peranan yang ditutup admin tidak boleh DIDAFTAR, bukan sekadar tidak
    // boleh dipilih dari dropdown. Ini pengadang sebenar — paparan di atas
    // hanya memudahkan, dan tidak boleh dipercayai bersendirian.
    const peranaanDitolak = allEntries.filter(p => !peranaanDibenarkan.includes((p as any).role));
    if (peranaanDitolak.length > 0) {
      const jenis = Array.from(new Set(peranaanDitolak.map(p => (p as any).role as string)));
      alert(
        `Pendaftaran ${jenis.join(' dan ')} untuk '${leaderInfo.badgeType}' telah ditutup oleh admin.\n\n` +
        `${peranaanDitolak.length} rekod berkenaan perlu dibuang sebelum borang ini boleh dihantar.`,
      );
      return;
    }

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
                     alert(`HALANGAN DUPLIKASI:\n\nPeserta ${p.name} (${p.icNumber}) telah pun didaftarkan untuk program '${leaderInfo.badgeType}' pada tahun ${currentYear} oleh sekolah ${duplicate.school}.\n\nSila padam rekod ini dari senarai untuk meneruskan.`);
                     return;
                 }
             }
        }
    }
    // --- NEW VALIDATION LOGIC END ---

    setSubmitting(true);
    try {
        // Split allPeople by role; tag siri (bila program aktifkan) untuk semua peserta dalam borang ini.
        const withSiri = (list: typeof allPeople) => siriEnabled ? list.map(p => ({ ...p, siri: registrationSiri })) : list;
        const participants = withSiri(allPeople.filter(p => (p as any).role === 'PESERTA' && p.name.trim()));
        const assistants = withSiri(allPeople.filter(p => ((p as any).role === 'PEMIMPIN' || (p as any).role === 'PENOLONG PEMIMPIN' || (p as any).role === 'PEMBANTU') && p.name.trim()));
        const examiners = withSiri(allPeople.filter(p => (p as any).role === 'PENGUJI' && p.name.trim()));
        // customDate = tarikh tahun kohort dipilih (membolehkan pendaftaran backdated).
        const cohortDate = `${registrationYear}-01-01`;
        const result = await submitRegistration(scriptUrl, leaderInfo, participants, assistants, examiners, cohortDate);
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
                <p className="text-amber-500 text-sm font-mono mt-1 ml-14 uppercase tracking-widest opacity-80">ScoutNadi</p>
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Negeri</label>
                                    <select
                                        required
                                        className="w-full p-3 border rounded-lg bg-white focus:ring-2 focus:ring-amber-400 outline-none transition"
                                        value={selectedNegeri}
                                        onChange={e => {
                                            const negeriCode = e.target.value;
                                            setSelectedNegeri(negeriCode);
                                            setSelectedDaerah('');
                                            setLeaderInfo(prev => ({ ...prev, schoolName: '', schoolCode: '' }));
                                        }}
                                    >
                                        <option value="">-- Pilih Negeri --</option>
                                        {negeriList.map((n, idx) => (
                                            <option key={idx} value={n.code}>{n.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Daerah</label>
                                    <select
                                        required
                                        className="w-full p-3 border rounded-lg bg-white focus:ring-2 focus:ring-amber-400 outline-none transition disabled:bg-gray-100 disabled:text-gray-400"
                                        value={selectedDaerah}
                                        disabled={!selectedNegeri}
                                        onChange={e => {
                                            const daerahCode = e.target.value;
                                            setSelectedDaerah(daerahCode);
                                            setLeaderInfo(prev => ({ ...prev, schoolName: '', schoolCode: '' }));
                                        }}
                                    >
                                        <option value="">-- Pilih Daerah --</option>
                                        {daerahList
                                            .filter(d => d.negeriCode === selectedNegeri)
                                            .map((d, idx) => (
                                                <option key={idx} value={d.code}>{d.name}</option>
                                            ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Nama Sekolah</label>
                                <select
                                    required
                                    className="w-full p-3 border rounded-lg bg-white focus:ring-2 focus:ring-amber-400 outline-none transition disabled:bg-gray-100 disabled:text-gray-400"
                                    value={leaderInfo.schoolName}
                                    disabled={!selectedDaerah}
                                    onChange={e => {
                                        const schoolName = e.target.value;
                                        const selectedSchool = schools.find(s => s.name === schoolName);
                                        setLeaderInfo(prev => ({
                                            ...prev,
                                            schoolName,
                                            schoolCode: selectedSchool?.schoolCode || ''
                                        }));
                                    }}
                                >
                                    <option value="">-- Pilih Sekolah --</option>
                                    {schools
                                        .filter(s => s.daerahCode === selectedDaerah)
                                        .map((s, idx) => (
                                            <option key={idx} value={s.name}>{s.name}</option>
                                        ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Kod Sekolah</label>
                                <input
                                    required
                                    className="w-full p-3 border rounded-lg uppercase focus:ring-2 focus:ring-amber-400 outline-none transition disabled:bg-gray-100 disabled:text-gray-400"
                                    placeholder="KOD SEKOLAH"
                                    value={leaderInfo.schoolCode}
                                    disabled={!!schools.find(s => s.name === leaderInfo.schoolName)?.schoolCode}
                                    onChange={e => setLeaderInfo({ ...leaderInfo, schoolCode: e.target.value })}
                                />
                            </div>
                        </>
                    )}

                    <div>
                        <div className="mb-1">
                            <label className="block text-sm font-semibold text-gray-700 flex items-center gap-2"><Medal size={16}/> Jenis Program / Program</label>
                        </div>
                        <select required className="w-full p-3 border rounded-lg bg-white focus:ring-2 focus:ring-amber-400 outline-none transition" value={leaderInfo.badgeType} onChange={e=>setLeaderInfo({...leaderInfo, badgeType: e.target.value})}>
                            <option value="">-- Sila Pilih Program / Program --</option>
                            {safeBadges.map((badge, idx) => {
                                if (badge.name === 'Anugerah Rambu') return null;

                                const lockKey = badgeStatusKey(badge.name, currentYear, registrationSiri);
                                const dihantar = lockedBadges.includes(lockKey) || approvedBadges.includes(lockKey);
                                // Dihantar tetapi pegawai dibuka: masih boleh dipilih,
                                // cuma senarai peranannya terhad.
                                const pegawaiSahaja = dihantar && pegawaiTerbukaSelepas(badge.name);
                                const isLocked = dihantar && !pegawaiSahaja;
                                const closed = isBadgeClosed(badge);
                                return (
                                <option key={idx} value={badge.name} disabled={closed || isLocked} className={closed || isLocked ? 'text-gray-400' : ''}>
                                    {badge.name} {isLocked ? '(TELAH DIHANTAR)' : pegawaiSahaja ? '(PEGAWAI SAHAJA)' : closed && badge.isOpen ? '(TAMAT TEMPOH)' : ''}
                                </option>
                            )})}
                        </select>
                         {sudahHantar && peranaanDibenarkan.length === 0 && (
                             <p className="text-red-500 text-xs mt-1 font-bold">
                               Pendaftaran program ini{siriEnabled ? ` (Siri ${registrationSiri})` : ''} telah anda hantar. Sila hubungi Admin jika perlu ubah.
                             </p>
                         )}
                         {sudahHantar && peranaanDibenarkan.length > 0 && (
                             <p className="text-amber-600 text-xs mt-1 font-bold">
                               Pendaftaran program ini{siriEnabled ? ` (Siri ${registrationSiri})` : ''} telah dihantar.
                               Anda masih boleh menambah {peranaanDibenarkan.join(', ')}. Peserta tidak boleh ditambah lagi.
                             </p>
                         )}
                         {leaderInfo.badgeType && (() => {
                            const sel = safeBadges.find(b => b.name === leaderInfo.badgeType);
                            if (!sel || !isBadgeClosed(sel)) return null;
                            const expired = sel.isOpen && sel.deadline; // tutup kerana tarikh akhir lepas
                            return (
                              <p className="text-red-500 text-xs mt-1 font-bold">
                                {expired
                                  ? `Pendaftaran program ini telah tamat tempoh (tarikh akhir: ${sel.deadline}). Sila pilih program lain.`
                                  : 'Program ini telah ditutup. Sila pilih program lain.'}
                              </p>
                            );
                         })()}
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2"><GraduationCap size={16}/> Tahun Pendaftaran</label>
                        <select
                            className="w-full p-3 border rounded-lg bg-white focus:ring-2 focus:ring-amber-400 outline-none transition"
                            value={registrationYear}
                            onChange={e => setRegistrationYear(Number(e.target.value))}
                        >
                            {yearOptions.map(y => (
                                <option key={y} value={y}>{y}{y === thisYear ? ' (Tahun semasa)' : ' (Backdated)'}</option>
                            ))}
                        </select>
                        {registrationYear !== thisYear && (
                            <p className="text-amber-600 text-xs mt-1 font-bold">⚠️ Anda mendaftar untuk tahun lampau {registrationYear}. Data akan direkod di bawah kohort {registrationYear}.</p>
                        )}
                    </div>

                    {siriEnabled && (
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2"><Layers size={16}/> Siri</label>
                        <select
                            className="w-full p-3 border rounded-lg bg-white focus:ring-2 focus:ring-amber-400 outline-none transition"
                            value={registrationSiri}
                            onChange={e => setRegistrationSiri(Number(e.target.value))}
                        >
                            {siriOptions.map(s => (
                                <option key={s} value={s}>Siri {s}</option>
                            ))}
                        </select>
                        <p className="text-gray-400 text-xs mt-1">Program ini dijalankan berperingkat. Pilih siri yang berkenaan untuk semua peserta dalam borang ini.</p>
                    </div>
                    )}
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
                                    <option value="PEMBANTU" disabled={!allowAssistants}>Pembantu</option>
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

                            {/* BAJU (hanya jika program aktifkan; untuk peserta, pemimpin, penolong) */}
                            {shirtEnabled && ['PESERTA', 'PEMIMPIN', 'PENOLONG PEMIMPIN', 'PEMBANTU'].includes((person as any).role) && (
                              <>
                              <div className="sm:col-span-4 lg:col-span-3">
                                  <label className="text-xs text-gray-500 font-bold uppercase block mb-1">Jenis Baju</label>
                                  <select
                                      className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm"
                                      value={(person as any).shirtType || ''}
                                      onChange={e => {
                                        const updated = allPeople.map(p => p.id === person.id ? { ...p, shirtType: e.target.value } : p);
                                        setAllPeople(updated);
                                      }}
                                  >
                                      <option value="">- Pilih Jenis -</option>
                                      <option value="Kolar">Kolar</option>
                                      <option value="Round Neck Lengan Pendek">Round Neck Lengan Pendek</option>
                                      <option value="Round Neck Lengan Panjang">Round Neck Lengan Panjang</option>
                                      <option value="Round Neck Muslimah">Round Neck Muslimah</option>
                                  </select>
                              </div>
                              <div className="sm:col-span-4 lg:col-span-2">
                                  <label className="text-xs text-gray-500 font-bold uppercase block mb-1">Saiz Baju</label>
                                  <select
                                      className="w-full p-2.5 border border-gray-300 rounded-lg text-base md:text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm"
                                      value={(person as any).shirtSize || ''}
                                      onChange={e => {
                                        const updated = allPeople.map(p => p.id === person.id ? { ...p, shirtSize: e.target.value } : p);
                                        setAllPeople(updated);
                                      }}
                                  >
                                      <option value="">- Pilih Saiz -</option>
                                      <optgroup label="Budak (ukuran dada)">
                                        {['24', '26', '28', '30', '32'].map(s => <option key={s} value={s}>{s}</option>)}
                                      </optgroup>
                                      <optgroup label="Dewasa">
                                        {['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL'].map(s => <option key={s} value={s}>{s}</option>)}
                                      </optgroup>
                                  </select>
                              </div>
                              </>
                            )}

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

                    {/* Label mengikut peranan yang benar-benar boleh didaftar.
                        "Tambah Peserta" pada program yang Peserta-nya ditutup
                        ialah janji yang borang ini tidak boleh tunaikan. */}
                    <button type="button" onClick={() => setAllPeople([...allPeople, createEmptyParticipant(peranaanLalai)])} className="mt-2 w-full py-3 border-2 border-dashed border-blue-300 rounded-lg text-blue-600 font-bold hover:bg-blue-50 flex justify-center gap-2 transition">
                        <Plus size={20}/> Tambah {peranaanLalai === 'PESERTA' ? 'Peserta' : peranaanLalai === 'PENGUJI' ? 'Penguji' : 'Pemimpin'}
                    </button>
                    {!allowStudents && (
                      <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Pendaftaran <strong>Peserta</strong> baharu untuk program ini telah ditutup oleh admin. Senarai sedia ada kekal, dan muat naik senarai masih boleh digunakan.
                      </p>
                    )}
                </div>
            </div>

            <div className="pt-4 pb-8 space-y-3">
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pdpaConsent}
                      onChange={(e) => setPdpaConsent(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-[11px] text-slate-600 leading-relaxed">
                      Saya bersetuju dengan{' '}
                      <button type="button" onClick={() => setShowPrivacyNotice(true)} className="text-blue-600 font-bold hover:underline">Notis Privasi (PDPA)</button>
                      {' '}dan membenarkan pemprosesan data peribadi peserta untuk tujuan pendaftaran pengakap.
                    </span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={parentalConsent}
                      onChange={(e) => setParentalConsent(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-[11px] text-slate-600 leading-relaxed">
                      Saya mengesahkan bahawa saya adalah ibu bapa/penjaga sah atau telah mendapat kebenaran ibu bapa/penjaga bagi peserta di bawah umur 18 tahun untuk pendaftaran ini.
                    </span>
                  </label>
                </div>

                <button 
                    type="submit" 
                    disabled={submitting || !pdpaConsent || !parentalConsent} 
                    className={`w-full py-4 rounded-xl text-white font-bold text-lg shadow-lg flex justify-center gap-2 transition active:scale-[0.98] ${submitting || !pdpaConsent || !parentalConsent ? 'bg-gray-400 cursor-not-allowed' : 'bg-emerald-700 hover:bg-emerald-600'}`}
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
                    </div>
                </div>
            </div>
        </form>
      </div>

      {showPrivacyNotice && (
        <PrivacyNotice onAccept={() => { setShowPrivacyNotice(false); setPdpaConsent(true); }} />
      )}
    </div>
  );
};