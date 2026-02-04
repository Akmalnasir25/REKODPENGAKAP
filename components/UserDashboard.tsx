
import React, { useMemo, useState } from 'react';
import { SubmissionData, UserSession, School, Participant, Badge, UserProfile } from '../types';
import { Plus, LogOut, FileText, User, Calendar, Trash2, Search, Sparkles, AlertOctagon, GraduationCap, Shield, Lock, Save, Edit2, Printer, Filter, Send, CheckCircle, AlertTriangle, History, X, Medal, Award, Archive, Clock, ArrowDownToLine, ChevronRight, Users, Menu, Home, School as SchoolIcon, ChevronLeft, Key, ArrowRight, LayoutList, Crown } from 'lucide-react';
import { APP_VERSION, LOGO_URL } from '../constants';
import { updateParticipantId, lockSchoolBadge, submitRegistration, changePassword, updateUserProfile } from '../services/api';
import { fetchServerCsrf } from '../services/security';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { SearchFilter } from './ui/SearchFilter';
import { ExportButton } from './ui/ExportButton';
import { SortableTable } from './ui/SortableTable';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { UserProfilePage } from './UserProfilePage';


interface UserDashboardProps {
  user: UserSession;
  allData: SubmissionData[];
  schools: School[];
  badges: Badge[]; 
  userProfiles: UserProfile[];
  isRegistrationOpen: boolean; 
  scriptUrl: string;
  onLogout: () => void;
  onNewRegistration: () => void;
  onDelete: (item: SubmissionData) => void;
  onRefresh: () => void;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({ 
    user, allData, schools, badges, userProfiles, isRegistrationOpen, scriptUrl, onLogout, onNewRegistration, onDelete, onRefresh 
}) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBadgeFilter, setSelectedBadgeFilter] = useState('');
  
  // Views
  const [showHistoryView, setShowHistoryView] = useState(false);
  const [showArchiveView, setShowArchiveView] = useState(false); 
  const [historyBadgeFilter, setHistoryBadgeFilter] = useState(''); // Filter for history view
  
  // Modals
  const [showRambuModal, setShowRambuModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  // Sidebar State
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);

  // Import State
  const [importSourceBadge, setImportSourceBadge] = useState('');
  const [importSourceYear, setImportSourceYear] = useState(selectedYear - 1); // Default to previous year
  const [importCategory, setImportCategory] = useState<'PESERTA' | 'PENOLONG' | 'PENGUJI'>('PESERTA');
  const [selectedImportCandidates, setSelectedImportCandidates] = useState<string[]>([]);
  const [isSubmittingImport, setIsSubmittingImport] = useState(false);

  // Password State
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [tempIdValue, setTempIdValue] = useState('');
  const [savingId, setSavingId] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [isSubmittingRambu, setIsSubmittingRambu] = useState(false);
  const [selectedRambuCandidates, setSelectedRambuCandidates] = useState<string[]>([]); 

  const currentSchoolSettings = schools.find(s => s.name === user.schoolName);
  
  // Get user profile from userProfiles array
  const userProfile = useMemo(() => {
    return userProfiles.find(p => p.schoolCode.toUpperCase() === user.schoolCode.toUpperCase());
  }, [userProfiles, user.schoolCode]);
  
  // Granular Permissions (Fallback to allowEdit logic for legacy)
  const allowStudents = currentSchoolSettings?.allowStudents ?? currentSchoolSettings?.allowEdit ?? false;
  const allowAssistants = currentSchoolSettings?.allowAssistants ?? currentSchoolSettings?.allowEdit ?? false;
  const allowExaminers = currentSchoolSettings?.allowExaminers ?? currentSchoolSettings?.allowEdit ?? false;
  
  // Check if ANY addition is allowed to enable the "New Registration" button generally
  const isAnyAllowed = allowStudents || allowAssistants || allowExaminers;

  const lockedBadges = currentSchoolSettings?.lockedBadges || [];
  const getLockKey = (badge: string, year: number) => `${badge}_${year}`;

  // --- DEADLINE NOTIFICATION LOGIC ---
  const expiringBadges = useMemo(() => {
      if (!badges || badges.length === 0) return [];
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      return badges.filter(b => {
          if (!b.isOpen || !b.deadline) return false;
          const deadlineDate = new Date(b.deadline);
          const diffTime = deadlineDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return diffDays >= 0 && diffDays <= 3;
      }).map(b => {
          const deadlineDate = new Date(b.deadline!);
          const diffTime = deadlineDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return { ...b, daysLeft: diffDays };
      });
  }, [badges]);

  const availableYears = useMemo(() => {
    const years = new Set<number>(allData.map(d => new Date(d.date).getFullYear()));
    years.add(currentYear);
    return Array.from(years).sort((a: number, b: number) => b - a);
  }, [allData, currentYear]);
  
  const myData = useMemo(() => {
    return allData.filter(d => 
        ((d.schoolCode && d.schoolCode === user.schoolCode) || 
        d.school === user.schoolName) &&
        new Date(d.date).getFullYear() === selectedYear
    );
  }, [allData, user, selectedYear]);

  // Compute stats breakdown
  const myStats = useMemo(() => {
      let students = 0;
      let leaders = 0;
      let examiners = 0;

      myData.forEach(d => {
          const role = (d.role || 'PESERTA').toUpperCase();
          if (role === 'PENGUJI') examiners++;
          else if (role.includes('PENOLONG') || role === 'PEMIMPIN') leaders++;
          else students++;
      });
      return { students, leaders, examiners, total: myData.length };
  }, [myData]);

  // Available badges for filter dropdown based on myData
  const availableBadges = useMemo(() => {
    const badges = new Set(myData.map(d => d.badge).filter(Boolean));
    return Array.from(badges).sort();
  }, [myData]);

  const filteredData = useMemo(() => {
    let data = myData;
    if (selectedBadgeFilter) {
        data = data.filter(item => item.badge === selectedBadgeFilter);
    }
    if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase();
        data = data.filter(item => 
            (item.student && String(item.student).toLowerCase().includes(lowerQuery)) ||
            (item.badge && String(item.badge).toLowerCase().includes(lowerQuery)) ||
            (item.id && String(item.id).toLowerCase().includes(lowerQuery)) ||
            (item.icNumber && String(item.icNumber).includes(lowerQuery)) ||
            (item.studentPhone && String(item.studentPhone).includes(lowerQuery))
        );
    }
    return data;
  }, [myData, searchQuery, selectedBadgeFilter]);

  // Compute filtered stats (based on badge filter + search)
  const filteredStats = useMemo(() => {
      let students = 0;
      let leaders = 0;
      let examiners = 0;

      filteredData.forEach(d => {
          const role = (d.role || 'PESERTA').toUpperCase();
          if (role === 'PENGUJI') examiners++;
          else if (role.includes('PENOLONG') || role === 'PEMIMPIN') leaders++;
          else students++;
      });
      return { students, leaders, examiners, total: filteredData.length };
  }, [filteredData]);

  // --- PRINT DATA PREPARATION (SORTED) ---
  const printData = useMemo(() => {
    const data = [...filteredData];
    return data.sort((a, b) => {
        // Priority: PEMIMPIN (1) -> PENOLONG (2) -> PENGUJI (3) -> PESERTA (4)
        const getRank = (role: string) => {
            const r = (role || '').toUpperCase();
            if (r === 'PEMIMPIN') return 1;
            if (r.includes('PENOLONG')) return 2;
            if (r === 'PENGUJI') return 3;
            return 4; // Peserta
        };
        const rankA = getRank(a.role || '');
        const rankB = getRank(b.role || '');
        
        if (rankA !== rankB) return rankA - rankB;
        // Secondary sort by name
        return (a.student || '').localeCompare(b.student || '');
    });
  }, [filteredData]);

  // Use userProfile data for print metadata (groupNumber, leader, principal)
  const printMeta = {
    groupNumber: userProfile?.groupNumber || '',
    leader: userProfile?.leaderName || '',
    principalName: userProfile?.principalName || ''
  };
  const printBadgeTitle = selectedBadgeFilter || "SENARAI KESELURUHAN";

  // --- RAMBU LOGIC ---
  const rambuCandidates = useMemo(() => {
      const emasStudents = myData.filter(d => d.badge.includes('Keris Emas') && (!d.role || d.role === 'PESERTA'));
      // SAFE STRING COMPARISON
      const alreadyRambu = myData.filter(d => d.badge === 'Anugerah Rambu').map(d => String(d.icNumber));
      return emasStudents.filter(d => !alreadyRambu.includes(String(d.icNumber)));
  }, [myData]);

  const isRambuOpen = useMemo(() => {
      const rambuBadge = badges.find(b => b.name === 'Anugerah Rambu');
      return rambuBadge ? rambuBadge.isOpen : false;
  }, [badges]);

  // --- IMPORT / MIGRATION LOGIC (USER SIDE) ---
  const importCandidates = useMemo(() => {
      if (!importSourceBadge) return [];
      // Use state importSourceYear instead of calculating from selectedYear
      const sourceYear = importSourceYear;
      
      let targetBadge = '';
      if (importSourceBadge.includes('Keris Gangsa')) targetBadge = 'Keris Perak';
      else if (importSourceBadge.includes('Keris Perak')) targetBadge = 'Keris Emas';
      else return [];

      const candidates = allData.filter(d => 
          ((d.schoolCode && d.schoolCode === user.schoolCode) || d.school === user.schoolName) &&
          new Date(d.date).getFullYear() === sourceYear &&
          d.badge === importSourceBadge
      );

      const filteredByRole = candidates.filter(d => {
          const role = (d.role || 'PESERTA').toUpperCase();
          if (importCategory === 'PESERTA') return role === 'PESERTA' || role === 'PENERIMA RAMBU';
          else if (importCategory === 'PENOLONG') return role.includes('PENOLONG') || role === 'PEMIMPIN';
          else if (importCategory === 'PENGUJI') return role === 'PENGUJI';
          return false;
      });

      // SAFE STRING COMPARISON for deduplication
      const existingInTarget = myData.filter(d => d.badge === targetBadge).map(d => String(d.icNumber));
      return filteredByRole.filter(c => !existingInTarget.includes(String(c.icNumber)));
  }, [allData, user, selectedYear, importSourceBadge, myData, importCategory, importSourceYear]);

  // --- ARCHIVE DATA (PESERTA SAHAJA) ---
  const myArchiveData = useMemo(() => {
      const allMyData = allData.filter(d => (d.schoolCode === user.schoolCode) || (d.school === user.schoolName));
      const groupedByYear: Record<number, { rambu: SubmissionData[], emas: SubmissionData[] }> = {};
      allMyData.forEach(item => {
          const y = new Date(item.date).getFullYear();
          const badge = item.badge || '';
          const role = item.role || '';
          // ONLY include PESERTA (PENERIMA RAMBU for Rambu, PESERTA for others)
          // Exclude: PENGUJI, PENOLONG PEMIMPIN
          const isPeserta = role === 'PESERTA' || role === 'PENERIMA RAMBU' || (badge === 'Anugerah Rambu' && role !== 'PENGUJI' && role !== 'PENOLONG PEMIMPIN');
          if (isPeserta && (badge === 'Anugerah Rambu' || role === 'PENERIMA RAMBU' || badge.includes('Keris Emas'))) {
              if (!groupedByYear[y]) groupedByYear[y] = { rambu: [], emas: [] };
              if (badge === 'Anugerah Rambu' || role === 'PENERIMA RAMBU') groupedByYear[y].rambu.push(item);
              else if (badge.includes('Keris Emas')) groupedByYear[y].emas.push(item);
          }
      });
      return Object.keys(groupedByYear).map(Number).sort((a,b) => b - a).map(year => ({ year, ...groupedByYear[year] }));
  }, [allData, user]);

  // --- HISTORY DATA LOGIC (PESERTA ONLY) ---
  const myHistoryData = useMemo(() => {
      const schoolData = allData.filter(d => (d.schoolCode === user.schoolCode) || (d.school === user.schoolName));
      const studentMap = new Map<string, { name: string, ic: string, history: Record<number, { id: string, badge: string }> }>();
      schoolData.forEach(item => {
          // ONLY include PESERTA and PENERIMA RAMBU (exclude PENGUJI, PENOLONG PEMIMPIN, PEMIMPIN, etc.)
          const role = (item.role || '').toUpperCase();
          if (role !== 'PESERTA' && role !== 'PENERIMA RAMBU') return;
          
          // Filter by badge if historyBadgeFilter is set
          if (historyBadgeFilter && item.badge !== historyBadgeFilter) return;
          
          // SAFE STRING CONVERSION
          const icStr = item.icNumber ? String(item.icNumber) : '';
          const studentName = item.student ? String(item.student) : '';
          
          if (!studentName.trim()) return;

          const key = icStr.length > 5 ? `${icStr.trim()}_${studentName.trim().toUpperCase()}` : `${studentName.trim().toUpperCase()}`;
          if (!studentMap.has(key)) studentMap.set(key, { name: studentName.toUpperCase(), ic: icStr || '-', history: {} });
          const entry = studentMap.get(key)!;
          const y = new Date(item.date).getFullYear();
          // Store all
          entry.history[y] = { id: item.id || '-', badge: item.badge };
      });
      
      // Return ALL prepared data sorted
      return Array.from(studentMap.values()).sort((a,b) => a.name.localeCompare(b.name));
  }, [allData, user, historyBadgeFilter]);

  // Determine if specific record modification is allowed based on granular permissions
  const canModifyRecord = (item: SubmissionData) => {
      if (!isRegistrationOpen) return false;
      
      const itemYear = new Date(item.date).getFullYear();
      if (itemYear < currentYear) return false;
      
      const lockKey = getLockKey(item.badge, itemYear);
      if (lockedBadges.includes(lockKey)) return false;
      
      // Removed Role/Permission checks here to allow editing/deleting existing (imported) records
      // even if the "Add New" permission is revoked.
      return true;
  };

  const isCurrentOrFuture = selectedYear >= currentYear;
  // canAddGeneral checks if at least one category is allowed for NEW registrations
  const canAddGeneral = isRegistrationOpen && isAnyAllowed && isCurrentOrFuture;
  
  const currentLockKey = selectedBadgeFilter ? getLockKey(selectedBadgeFilter, selectedYear) : '';
  const isSelectedBadgeLocked = selectedBadgeFilter !== '' && lockedBadges.includes(currentLockKey);
  
  // Show submit button if: Registration Open AND At least one permission allowed AND Badge not locked
  const showSubmitButton = selectedBadgeFilter !== '' && isAnyAllowed && !isSelectedBadgeLocked;

  const handleEditClick = (item: SubmissionData) => {
      if (!canModifyRecord(item)) return;
      setEditingId(item.rowIndex || 0);
      setTempIdValue(item.id || ''); // Ensure not undefined
  };

  const handleSaveId = async (item: SubmissionData) => {
      if (!item.rowIndex) return;
      const cleanNewId = tempIdValue.trim().toUpperCase();
      if (cleanNewId) {
          // SAFE STRING: d.id might be numeric or undefined
          const isDuplicate = allData.some(d => new Date(d.date).getFullYear() === selectedYear && String(d.id || '').trim().toUpperCase() === cleanNewId && d.rowIndex !== item.rowIndex);
          if (isDuplicate) { alert(`ID '${cleanNewId}' telah digunakan.`); return; }
      }
      setSavingId(true);
      try {
          const token = await fetchServerCsrf(scriptUrl);
          const res = await updateParticipantId(scriptUrl, item.rowIndex, cleanNewId, user.schoolCode, token || undefined);
          if (res.status === 'success') { setEditingId(null); onRefresh(); } else alert("Gagal kemaskini: " + res.message);
      } catch (e) { alert("Ralat server."); } finally { setSavingId(false); }
  };

  const handleFinalSubmit = async () => {
    if (!selectedBadgeFilter) return;
    if (!confirm(`PENGESAHAN AKHIR (${selectedYear})\n\nAdakah anda pasti mahu menghantar pendaftaran untuk lencana '${selectedBadgeFilter}' pada tahun ${selectedYear}?\n\nSelepas ini data akan dikunci.`)) return;
    setIsLocking(true);
    try {
        const res = await lockSchoolBadge(scriptUrl, user.schoolName, getLockKey(selectedBadgeFilter, selectedYear));
        if (res.status === 'success') { alert("Berjaya dihantar!"); onRefresh(); } else alert("Ralat menghantar.");
    } catch (e) { alert("Gagal menghubungi server."); } finally { setIsLocking(false); }
  };

  const handleSubmitRambu = async () => {
      if(selectedRambuCandidates.length === 0) { alert("Sila pilih peserta."); return; }
      if(!confirm(`Sahkan kehadiran ${selectedRambuCandidates.length} peserta?`)) return;
      setIsSubmittingRambu(true);
      const candidatesToSubmit = rambuCandidates.filter(c => selectedRambuCandidates.includes(c.icNumber));
      const ref = candidatesToSubmit[0];
      
      // Get profile data from userProfiles, not from submissions
      const profile = userProfiles.find(p => p.schoolCode.toUpperCase() === user.schoolCode.toUpperCase());
      
      const leaderInfo = { 
          schoolName: ref.school, 
          schoolCode: ref.schoolCode || user.schoolCode, 
          groupNumber: profile?.groupNumber || '', 
          principalName: profile?.principalName || '', 
          principalPhone: profile?.principalPhone || '', 
          leaderName: profile?.leaderName || '', 
          race: profile?.leaderRace || '', 
          phone: profile?.phone || '', 
          badgeType: 'Anugerah Rambu' 
      };
      const participants: Participant[] = candidatesToSubmit.map(c => ({ id: Date.now() + Math.random(), name: c.student, gender: c.gender, race: c.race || '', membershipId: c.id, icNumber: c.icNumber || '', phoneNumber: c.studentPhone || '', remarks: 'Layak Anugerah Rambu' }));
      try {
          const token = await fetchServerCsrf(scriptUrl);
          await submitRegistration(scriptUrl, leaderInfo, participants, [], [], undefined, token || undefined);
          alert("Berjaya!"); setShowRambuModal(false); setSelectedRambuCandidates([]); onRefresh();
      } catch (e) { alert("Gagal."); } finally { setIsSubmittingRambu(false); }
  };

  const handleSubmitImport = async () => {
      if(selectedImportCandidates.length === 0) { alert("Sila pilih nama."); return; }
      
      let targetBadge = '';
      if (importSourceBadge.includes('Keris Gangsa')) targetBadge = 'Keris Perak';
      else if (importSourceBadge.includes('Keris Perak')) targetBadge = 'Keris Emas';
      
      const badgeConfig = badges.find(b => b.name === targetBadge);
      if (badgeConfig && !badgeConfig.isOpen) { alert(`Pendaftaran '${targetBadge}' ditutup.`); return; }
      
      if(!confirm(`Import ${selectedImportCandidates.length} data ke ${targetBadge}?`)) return;
      setIsSubmittingImport(true);
      
      const candidatesToSubmit = importCandidates.filter(c => selectedImportCandidates.includes(c.icNumber));
      const ref = candidatesToSubmit[0];
      
      // Get profile data from userProfiles, not from submissions
      const profile = userProfiles.find(p => p.schoolCode.toUpperCase() === user.schoolCode.toUpperCase());
      
      const leaderInfo = { 
          schoolName: ref.school, 
          schoolCode: ref.schoolCode || user.schoolCode, 
          groupNumber: profile?.groupNumber || '', 
          principalName: profile?.principalName || '', 
          principalPhone: profile?.principalPhone || '', 
          leaderName: profile?.leaderName || '', 
          race: profile?.leaderRace || '', 
          phone: profile?.phone || '', 
          badgeType: targetBadge 
      };
      
      const mappedCandidates = candidatesToSubmit.map(c => ({ 
          id: Date.now() + Math.random(), 
          name: c.student, 
          gender: c.gender, 
          race: c.race || '', 
          membershipId: '', // Clear Membership ID so user enters the new one
          icNumber: c.icNumber || '', 
          phoneNumber: c.studentPhone || '', 
          remarks: `[IMPORT DARI ${importSourceYear}] ${importCategory}` 
      }));
      
      let participants: Participant[] = [], assistants: Participant[] = [], examiners: Participant[] = [];
      if (importCategory === 'PESERTA') participants = mappedCandidates; 
      else if (importCategory === 'PENOLONG') assistants = mappedCandidates; 
      else if (importCategory === 'PENGUJI') examiners = mappedCandidates;
      
      // Force date to be Jan 1st of the SELECTED YEAR (Target Year)
      const targetDate = `${selectedYear}-01-01`;

      try { 
          const token = await fetchServerCsrf(scriptUrl);
          await submitRegistration(scriptUrl, leaderInfo, participants, assistants, examiners, targetDate, token || undefined); 
          alert("Berjaya import! Sila kemaskini No. Keahlian."); 
          setShowImportModal(false); 
          setSelectedImportCandidates([]); 
          onRefresh(); 
      } catch (e) { 
          alert("Gagal."); 
      } finally { 
          setIsSubmittingImport(false); 
      }
  };

  const handleChangePassword = async () => {
      if(!oldPassword || !newPassword || !confirmPassword) { alert("Sila isi semua ruang."); return; }
      if(newPassword !== confirmPassword) { alert("Pengesahan kata laluan tidak sama."); return; }
      if(newPassword.length < 6) { alert("Kata laluan mesti sekurang-kurangnya 6 aksara."); return; }

      setIsChangingPassword(true);
      try {
          const token = await fetchServerCsrf(scriptUrl);
          const res = await changePassword(scriptUrl, { schoolCode: user.schoolCode, oldPassword, newPassword }, token || undefined);
          if(res.status === 'success') {
              alert("Kata laluan berjaya ditukar! Sila log masuk semula.");
              onLogout();
          } else {
              alert(res.message || "Gagal menukar kata laluan.");
          }
      } catch (e) {
          alert("Ralat server.");
      } finally {
          setIsChangingPassword(false);
      }
  };

  // --- SIDEBAR COMPONENT (DARK THEME) ---
  const SidebarItem = ({ icon: Icon, label, onClick, isActive, className }: any) => (
      <button 
        onClick={onClick} 
        className={`
            w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition rounded-lg my-1
            ${isActive ? 'bg-blue-900 text-white shadow-lg border-l-4 border-amber-500 shadow-blue-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-amber-400'} 
            ${!isDesktopSidebarOpen ? 'md:justify-center md:px-0 md:w-10 md:h-10 md:mx-auto' : ''}
            ${className}
        `}
        title={!isDesktopSidebarOpen ? label : ''}
      >
          <Icon size={18} className="shrink-0" /> 
          <span className={`${!isDesktopSidebarOpen ? 'md:hidden' : 'block'} whitespace-nowrap`}>
              {label}
          </span>
      </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col md:flex-row print:bg-white">
      
      {/* MOBILE HEADER (DARK) */}
      <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center shadow-md print:hidden sticky top-0 z-50 border-b-2 border-amber-600">
          <div className="flex items-center gap-2">
              <User size={20} className="text-amber-500" />
              <div className="text-sm font-bold truncate w-48">{user.schoolName}</div>
          </div>
          <button onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)} className="p-2 hover:bg-slate-800 rounded">
              <Menu size={24} />
          </button>
      </div>

      {/* SIDEBAR NAVIGATION (DARK & LUXURY) */}
      <aside className={`
          fixed inset-y-0 left-0 z-50 bg-slate-900 text-slate-300 shadow-2xl transform transition-all duration-300 ease-in-out border-r border-slate-800 flex flex-col
          md:relative md:translate-x-0 print:hidden
          ${isMobileSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full'}
          ${isDesktopSidebarOpen ? 'md:w-64' : 'md:w-20'}
      `}>
          {/* Sidebar Toggle Button (Desktop Only) */}
          <div className="hidden md:flex justify-end p-2 border-b border-slate-800">
                <button 
                    onClick={() => setIsDesktopSidebarOpen(!isDesktopSidebarOpen)}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition"
                    title={isDesktopSidebarOpen ? "Sembunyikan Sidebar" : "Buka Sidebar"}
                >
                    {isDesktopSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
                </button>
          </div>

          <div className="p-4 border-b border-slate-800 flex flex-col items-center text-center overflow-hidden bg-gradient-to-b from-slate-900 to-slate-800">
              <img src={LOGO_URL} alt="Logo" className="h-14 w-auto mb-3 drop-shadow-md" />
              {isDesktopSidebarOpen && (
                  <div className="animate-[fadeIn_0.2s_ease-out]">
                    <h2 className="font-bold text-white text-xs leading-tight mb-1 uppercase tracking-wide">{user.schoolName}</h2>
                    <p className="text-[10px] text-amber-500 font-mono bg-slate-900/50 px-2 py-0.5 rounded inline-block border border-amber-500/20">{user.schoolCode}</p>
                  </div>
              )}
          </div>

          <div className="p-4 space-y-1 overflow-y-auto flex-1">
              <SidebarItem 
                icon={Home} 
                label="Utama" 
                isActive={!showHistoryView && !showArchiveView} 
                onClick={() => { setShowHistoryView(false); setShowArchiveView(false); setIsMobileSidebarOpen(false); }} 
              />

              {/* Profile Button */}
              <SidebarItem 
                icon={User} 
                label="Profil Saya" 
                onClick={() => { setShowProfileModal(true); setIsMobileSidebarOpen(false); }} 
              />
              
              <SidebarItem 
                icon={Archive} 
                label="Arkib Pencapaian" 
                isActive={showArchiveView}
                onClick={() => { setShowArchiveView(true); setShowHistoryView(false); setIsMobileSidebarOpen(false); }} 
              />

              <SidebarItem 
                icon={History} 
                label="Semak Rekod" 
                isActive={showHistoryView}
                onClick={() => { setShowHistoryView(true); setShowArchiveView(false); setIsMobileSidebarOpen(false); }} 
              />

              <SidebarItem 
                icon={Printer} 
                label="Cetak Paparan" 
                onClick={() => { window.print(); setIsMobileSidebarOpen(false); }} 
              />

              <SidebarItem 
                icon={ArrowDownToLine} 
                label="Import Data" 
                onClick={() => { 
                    setShowImportModal(true); 
                    setIsMobileSidebarOpen(false); 
                    setImportSourceYear(selectedYear - 1); // Reset to default previous year when opening
                    setImportCategory('PESERTA'); // Always set to PESERTA only
                }} 
              />

              <SidebarItem 
                icon={Key} 
                label="Tukar Kata Laluan" 
                onClick={() => { setShowPasswordModal(true); setIsMobileSidebarOpen(false); }} 
              />
          </div>

          <div className="p-4 border-t border-slate-800 bg-slate-900">
              <SidebarItem 
                icon={LogOut} 
                label="Log Keluar" 
                className="text-red-400 hover:bg-red-900/20 hover:text-red-300 mt-auto border border-transparent hover:border-red-900/30"
                onClick={onLogout} 
              />

              {isDesktopSidebarOpen && (
                  <div className="text-center mt-4 text-[9px] text-slate-600 font-mono">
                      {APP_VERSION}
                  </div>
              )}
          </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-hidden flex flex-col h-screen overflow-y-auto">
        <div className="p-4 md:p-8 max-w-7xl mx-auto w-full print:p-0 print:w-full print:max-w-none">
            
            {/* PRINT VIEW (VISIBLE ONLY IN PRINT) */}
            <div className="hidden print:block font-serif text-black p-4" style={{ width: '100%', height: 'auto' }}>
                <style>{`
                    @media print {
                        @page {
                            size: A4 landscape;
                            margin: 10mm;
                        }
                        body {
                            print-color-adjust: exact;
                            -webkit-print-color-adjust: exact;
                        }
                        #print-container {
                            width: 100%;
                            height: auto;
                        }
                        #print-table {
                            width: 100%;
                            page-break-inside: auto;
                        }
                        #print-table tbody tr {
                            page-break-inside: avoid;
                            page-break-after: auto;
                        }
                        #print-header {
                            page-break-inside: avoid;
                            page-break-after: auto;
                        }
                        .bg-gray-100 {
                            background-color: #f3f4f6 !important;
                            print-color-adjust: exact;
                            -webkit-print-color-adjust: exact;
                        }
                    }
                `}</style>
                <div id="print-header" className="border-b-2 border-black mb-4 pb-2">
                     <div className="flex items-center justify-between mb-4">
                         <img src={LOGO_URL} className="h-20 w-auto object-contain" alt="Logo" />
                         <div className="text-right">
                             <h1 className="text-2xl font-bold uppercase tracking-wide">SENARAI PENDAFTARAN PENGAKAP</h1>
                             <h2 className="text-xl font-bold uppercase">{user.schoolName}</h2>
                         </div>
                     </div>
                     <div className="flex justify-between items-end text-sm font-bold uppercase border-t border-black pt-2">
                        <div>
                            <p>LENCANA: {printBadgeTitle}</p>
                            <p>TAHUN: {selectedYear}</p>
                        </div>
                        <div>
                            <p>KOD SEKOLAH: {user.schoolCode}</p>
                            <p>NO. KUMPULAN: {printMeta.groupNumber || '-'}</p>
                        </div>
                     </div>
                </div>

                <table id="print-table" className="w-full border-collapse border border-black text-xs">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="border border-black px-2 py-1.5 text-center w-10">NO.</th>
                            <th className="border border-black px-2 py-1.5 text-left">NAMA PENUH</th>
                            <th className="border border-black px-2 py-1.5 text-center w-28">NO. KP</th>
                            <th className="border border-black px-2 py-1.5 text-center w-24">NO. AHLI</th>
                            <th className="border border-black px-2 py-1.5 text-center w-20">JANTINA</th>
                            <th className="border border-black px-2 py-1.5 text-center w-24">KAUM</th>
                            <th className="border border-black px-2 py-1.5 text-center w-32">PERANAN</th>
                        </tr>
                    </thead>
                    <tbody>
                        {printData.map((item, index) => (
                            <tr key={index}>
                                <td className="border border-black px-2 py-1.5 text-center">{index + 1}</td>
                                <td className="border border-black px-2 py-1.5 uppercase font-semibold">{item.student}</td>
                                <td className="border border-black px-2 py-1.5 text-center font-mono">{item.icNumber}</td>
                                <td className="border border-black px-2 py-1.5 text-center font-mono">{item.id || '-'}</td>
                                <td className="border border-black px-2 py-1.5 text-center uppercase">{item.gender ? item.gender.substring(0,1) : '-'}</td>
                                <td className="border border-black px-2 py-1.5 text-center uppercase">{item.race}</td>
                                <td className="border border-black px-2 py-1.5 text-center uppercase text-[10px]">{item.role || 'PESERTA'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                
                <div className="flex justify-between mt-16 px-8 break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
                    <div className="w-5/12 text-center">
                        <p className="mb-16 text-left text-sm italic">Disediakan oleh:</p>
                        <div className="border-b border-black border-dashed mb-2"></div>
                        <p className="font-bold uppercase text-sm">{printMeta.leader || '................................................'}</p>
                        <p className="text-xs uppercase">PEMIMPIN KUMPULAN {printMeta.groupNumber || '...'}</p>
                    </div>
                    <div className="w-5/12 text-center">
                        <p className="mb-16 text-left text-sm italic">Disahkan oleh:</p>
                        <div className="border-b border-black border-dashed mb-2"></div>
                        <p className="font-bold uppercase text-sm">{printMeta.principalName || '................................................'}</p>
                        <p className="text-xs uppercase">GURU BESAR / PENGETUA</p>
                        <p className="text-xs uppercase">{user.schoolName}</p>
                    </div>
                </div>
            </div>

            {/* ALERTS SECTION (SCREEN ONLY) */}
            <div className="print:hidden space-y-4 mb-6">
                {/* DEADLINE ALERT */}
                {expiringBadges.length > 0 && (
                    <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded-lg shadow-sm flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-orange-800 font-bold text-sm">
                            <Clock size={18} className="animate-pulse" /> PERINGATAN: Pendaftaran Akan Ditutup
                        </div>
                        <ul className="list-disc list-inside text-xs text-orange-700 ml-1">
                            {expiringBadges.map((b, i) => (
                                <li key={i}>
                                    <strong>{b.name}</strong> tutup: <strong>{new Date(b.deadline!).toLocaleDateString('ms-MY')}</strong> ({b.daysLeft === 0 ? 'Hari Ini!' : `${b.daysLeft} hari lagi`}).
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {!isRegistrationOpen && (
                    <div className="bg-red-100 text-red-800 p-4 rounded-lg border border-red-200 flex items-center gap-3">
                        <AlertOctagon size={20} />
                        <div>
                            <div className="font-bold text-sm">Pendaftaran Ditutup oleh Admin.</div>
                        </div>
                    </div>
                )}

                {!isAnyAllowed && isRegistrationOpen && (
                    <div className="bg-orange-100 text-orange-800 p-4 rounded-lg border border-orange-200 flex items-center gap-3">
                        <Lock size={20} />
                        <div className="text-sm font-bold">Akses daftar peserta baru dihadkan. Sila guna Import Data jika perlu.</div>
                    </div>
                )}
            </div>

            {/* CONTENT VIEWS (SCREEN ONLY) */}
            <div className="print:hidden">
            {showHistoryView ? (
                // --- HISTORY VIEW (COHORT BLOCKS) ---
                <div className="space-y-8 animate-[fadeIn_0.3s_ease-out]">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-2 border-b">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2 text-lg">
                            <History size={20} className="text-blue-900"/> Semakan Keahlian Mengikut Sesi
                        </h2>
                        
                        {/* Badge Filter */}
                        <div className="flex items-center gap-2">
                            <Filter size={16} className="text-gray-500"/>
                            <select
                                value={historyBadgeFilter}
                                onChange={(e) => setHistoryBadgeFilter(e.target.value)}
                                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            >
                                <option value="">Semua Lencana</option>
                                {badges.map(b => (
                                    <option key={b.name} value={b.name}>{b.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    
                    {availableYears.map(startYear => {
                        // Filter students who HAVE A RECORD in startYear (Year 1)
                        const cohortStudents = myHistoryData.filter(row => row.history[startYear]);
                        
                        if (cohortStudents.length === 0) return null;

                        return (
                            <div key={startYear} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="bg-blue-900 px-4 py-3 flex justify-between items-center text-white">
                                    <h3 className="font-bold text-sm uppercase flex items-center gap-2 tracking-wider">
                                        <History size={16} className="text-amber-400"/> Sesi {startYear} - {startYear + 2}
                                    </h3>
                                    <span className="text-xs bg-white/10 px-2 py-0.5 rounded font-mono border border-white/20">
                                        {cohortStudents.length} Pelajar
                                    </span>
                                </div>
                                
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left border-separate border-spacing-0">
                                        <thead className="bg-slate-50 uppercase text-xs text-slate-800">
                                            <tr>
                                                <th className="px-4 py-3 border-b border-slate-200">Maklumat Peserta</th>
                                                <th className="px-4 py-3 w-40 text-center border-b border-r border-slate-200">{startYear} (Tahun 1)</th>
                                                <th className="px-4 py-3 w-40 text-center border-b border-r border-slate-200">{startYear + 1} (Tahun 2)</th>
                                                <th className="px-4 py-3 w-40 text-center border-b border-slate-200">{startYear + 2} (Tahun 3)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white">
                                            {cohortStudents.map((row, i) => (
                                                <tr key={i} className="hover:bg-slate-50 transition-colors border-b border-gray-100 last:border-0">
                                                    <td className="px-4 py-3 border-r border-gray-100">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-gray-800 uppercase text-sm">{row.name}</span>
                                                            <span className="text-xs text-gray-500 font-mono">{row.ic}</span>
                                                        </div>
                                                    </td>
                                                    
                                                    {/* YEAR 1 */}
                                                    <td className="px-2 py-2 border-r border-gray-100 align-top relative">
                                                        <HistoryCard data={row.history[startYear]} year={startYear} />
                                                        <div className="absolute top-1/2 -right-3 -mt-2 z-10 text-slate-300"><ArrowRight size={16} strokeWidth={3} /></div>
                                                    </td>

                                                    {/* YEAR 2 */}
                                                    <td className="px-2 py-2 border-r border-gray-100 align-top relative">
                                                        <HistoryCard data={row.history[startYear + 1]} year={startYear + 1} />
                                                        <div className="absolute top-1/2 -right-3 -mt-2 z-10 text-slate-300"><ArrowRight size={16} strokeWidth={3} /></div>
                                                    </td>

                                                    {/* YEAR 3 */}
                                                    <td className="px-2 py-2 align-top">
                                                        <HistoryCard data={row.history[startYear + 2]} year={startYear + 2} />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })}
                    {myHistoryData.length === 0 && <p className="text-center py-12 text-gray-400 italic">Tiada rekod keahlian dijumpai.</p>}
                </div>
            ) : showArchiveView ? (
                // --- ARCHIVE VIEW ---
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-[fadeIn_0.3s_ease-out]">
                    <div className="flex justify-between items-center mb-6 border-b pb-4">
                        <h2 className="font-bold text-amber-800 flex items-center gap-2 text-lg">
                            <Archive size={20}/> Arkib Pencapaian Sekolah
                        </h2>
                        <ExportButton 
                          data={myArchiveData.flatMap(yg => [...yg.rambu, ...yg.emas])}
                          fileName="Arkib_Pencapaian"
                          className="bg-green-600 hover:bg-green-700 text-white"
                        />
                    </div>

                    {/* Search Filter */}
                    <div className="mb-4">
                        <SearchFilter
                          data={myArchiveData.flatMap(yg => [...yg.rambu, ...yg.emas])}
                          searchFields={['student', 'school', 'badge']}
                          onFilterChange={() => {}}
                          placeholder="Cari peserta, sekolah, atau anugerah..."
                        />
                    </div>

                    {/* ... (Archive List Code) ... */}
                    <div className="space-y-6">
                        {myArchiveData.length === 0 && <p className="text-center py-12 text-gray-400 italic">Tiada data pencapaian.</p>}
                        {myArchiveData.map((yearGroup) => (
                            <div key={yearGroup.year} className="border rounded-lg overflow-hidden bg-gray-50">
                                <div className="bg-amber-100 px-4 py-2 border-b border-amber-200 flex justify-between items-center">
                                    <h3 className="font-bold text-amber-900 flex items-center gap-2 text-sm">
                                        <Award size={16}/> Tahun {yearGroup.year}
                                    </h3>
                                    <div className="flex gap-2 text-[10px] font-bold">
                                        <span className="bg-white/50 px-2 py-1 rounded text-amber-800 border border-amber-200/50">Rambu: {yearGroup.rambu.length}</span>
                                        <span className="bg-white/50 px-2 py-1 rounded text-amber-800 border border-amber-200/50">Emas: {yearGroup.emas.length}</span>
                                    </div>
                                </div>
                                <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200">
                                    <div className="p-4">
                                        <h4 className="font-bold text-xs text-amber-600 uppercase mb-2 flex items-center gap-1"><Medal size={12}/> Penerima Rambu</h4>
                                        <ul className="space-y-1">{yearGroup.rambu.map((p, i) => <li key={i} className="text-xs bg-white p-1.5 rounded border shadow-sm font-semibold uppercase">{p.student}</li>)}</ul>
                                    </div>
                                    <div className="p-4">
                                        <h4 className="font-bold text-xs text-yellow-600 uppercase mb-2 flex items-center gap-1"><Award size={12}/> Penerima Emas</h4>
                                        <ul className="space-y-1">{yearGroup.emas.map((p, i) => <li key={i} className="text-xs bg-white p-1.5 rounded border shadow-sm font-semibold uppercase">{p.student}</li>)}</ul>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                // --- DASHBOARD HOME VIEW ---
                <>
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                        <p className="text-slate-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><Calendar size={12}/> Tahun</p>
                        <select className="w-full p-1.5 border rounded font-bold text-slate-800 text-sm bg-slate-50" value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))}>
                            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                        <p className="text-slate-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><Filter size={12}/> Lencana</p>
                        <select className="w-full p-1.5 border rounded font-bold text-slate-800 text-sm bg-slate-50" value={selectedBadgeFilter} onChange={(e) => setSelectedBadgeFilter(e.target.value)}>
                            <option value="">Semua Lencana</option>
                            {availableBadges.map((b, i) => <option key={i} value={b}>{b}</option>)}
                        </select>
                    </div>

                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 col-span-1 md:col-span-2 grid grid-cols-3 divide-x divide-gray-100">
                        <div className="flex flex-col items-center justify-center">
                            <p className="text-blue-500 text-[10px] font-bold uppercase mb-0.5">Peserta</p>
                            <p className="text-xl font-black text-blue-900">{selectedBadgeFilter ? filteredStats.students : myStats.students}</p>
                            {selectedBadgeFilter && <p className="text-[9px] text-gray-400 mt-0.5">({myStats.students} keseluruhan)</p>}
                        </div>
                        <div className="flex flex-col items-center justify-center">
                            <p className="text-indigo-500 text-[10px] font-bold uppercase mb-0.5">Pemimpin</p>
                            <p className="text-xl font-black text-indigo-900">{selectedBadgeFilter ? filteredStats.leaders : myStats.leaders}</p>
                            {selectedBadgeFilter && <p className="text-[9px] text-gray-400 mt-0.5">({myStats.leaders} keseluruhan)</p>}
                        </div>
                        <div className="flex flex-col items-center justify-center">
                            <p className="text-green-500 text-[10px] font-bold uppercase mb-0.5">Penguji</p>
                            <p className="text-xl font-black text-green-900">{selectedBadgeFilter ? filteredStats.examiners : myStats.examiners}</p>
                            {selectedBadgeFilter && <p className="text-[9px] text-gray-400 mt-0.5">({myStats.examiners} keseluruhan)</p>}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 mb-6">
                    <button 
                        onClick={onNewRegistration}
                        disabled={!canAddGeneral}
                        className={`w-full p-4 rounded-xl shadow-sm border flex items-center justify-center gap-3 group transition ${canAddGeneral ? 'bg-blue-900 text-white hover:bg-blue-800 hover:shadow-md' : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'}`}
                    >
                        <div className={`p-2 rounded-full ${canAddGeneral ? 'bg-white/20' : 'bg-gray-200'}`}>
                            {canAddGeneral ? <Plus size={20} /> : <Lock size={20}/>}
                        </div>
                        <div className="text-left">
                            <p className="text-xs font-bold uppercase opacity-80">Tindakan</p>
                            <p className="text-sm font-bold">{canAddGeneral ? 'Daftar Peserta / Pegawai Baru' : 'Pendaftaran Dikunci'}</p>
                        </div>
                    </button>
                </div>

                {/* Hint for Badge Locking */}
                {isRegistrationOpen && isAnyAllowed && !selectedBadgeFilter && filteredData.length > 0 && (
                    <div className="bg-blue-50 text-blue-800 px-4 py-2 rounded-lg mb-4 text-xs flex items-center gap-2 border border-blue-100">
                        <AlertTriangle size={14} className="shrink-0"/> 
                        Pilih <strong>Lencana</strong> di atas untuk membolehkan butang "Hantar Pendaftaran".
                    </div>
                )}

                {/* RECORD COUNT CARD (when badge filter is selected) */}
                {selectedBadgeFilter && (
                    <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-4 rounded-xl mb-6 border border-purple-200 shadow-sm">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                                <p className="text-purple-600 text-xs font-bold uppercase mb-1">Jumlah Rekod</p>
                                <p className="text-2xl font-black text-purple-900">{filteredStats.total} Rekod</p>
                                <p className="text-[10px] text-purple-700 mt-1">
                                    {selectedBadgeFilter ? `Lencana: ${selectedBadgeFilter} | Tahun: ${selectedYear}` : ''}
                                </p>
                            </div>
                            <div className="bg-white rounded-lg p-3 shadow-sm border border-purple-100">
                                <Users size={24} className="text-purple-600" />
                            </div>
                        </div>
                    </div>
                )}

                {/* Hint for Badge Locking - revised */}
                {isRegistrationOpen && isAnyAllowed && !selectedBadgeFilter && filteredData.length > 0 && (
                    <div className="bg-blue-50 text-blue-800 px-4 py-2 rounded-lg mb-4 text-xs flex items-center gap-2 border border-blue-100">
                        <AlertTriangle size={14} className="shrink-0"/> 
                        Pilih <strong>Lencana</strong> di atas untuk membolehkan butang "Hantar Pendaftaran".
                    </div>
                )}

                {/* MAIN TABLE CARD */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b bg-slate-50/50 flex flex-col md:flex-row justify-between items-center gap-3">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2 text-sm uppercase tracking-wide">
                            <FileText size={16} className="text-blue-900" /> Senarai Peserta {selectedYear}
                            {selectedBadgeFilter && <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px]">({selectedBadgeFilter})</span>}
                        </h2>
                        <div className="relative w-full md:w-64">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input 
                                type="text" 
                                className="w-full pl-9 p-2 border rounded-lg text-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none" 
                                placeholder="Cari..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-100 text-slate-600 uppercase text-xs font-bold">
                                <tr>
                                    <th className="px-6 py-3">Nama</th>
                                    <th className="px-6 py-3">KP / Lencana</th>
                                    <th className="px-6 py-3">Kaum</th>
                                    <th className="px-6 py-3">No. Keahlian</th>
                                    <th className="px-6 py-3">Peranan</th>
                                    <th className="px-6 py-3 text-right">Tindakan</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredData.map((item, i) => {
                                    const isLocked = !canModifyRecord(item);
                                    const isMigrated = item.remarks && typeof item.remarks === 'string' && item.remarks.includes('MIGRASI');
                                    const isRambu = item.badge === 'Anugerah Rambu';
                                    
                                    return (
                                    <tr key={i} className={`hover:bg-slate-50 transition ${isLocked ? 'bg-slate-50/50' : ''}`}>
                                        <td className="px-6 py-3">
                                            <div className="font-bold text-slate-900 uppercase text-xs sm:text-sm">{item.student}</div>
                                            <div className="text-[10px] text-slate-500">{item.gender}</div>
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="font-mono text-xs text-slate-700">{item.icNumber || '-'}</div>
                                            <div className="flex items-center gap-1 mt-1">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.badge.includes('Emas') ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-200 text-gray-700'}`}>{item.badge}</span>
                                                {isLocked && <Lock size={10} className="text-gray-400"/>}
                                                {isMigrated && <span className="text-[9px] bg-blue-50 text-blue-600 px-1 border border-blue-100 rounded">MIGRASI</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 text-xs text-slate-600">{item.race || '-'}</td>
                                        <td className="px-6 py-3">
                                            {editingId === item.rowIndex ? (
                                                <div className="flex items-center gap-1">
                                                    <input autoFocus className="w-24 p-1 border rounded uppercase text-xs" value={tempIdValue} onChange={(e) => setTempIdValue(e.target.value)} placeholder="ID"/>
                                                    <button onClick={() => handleSaveId(item)} disabled={savingId} className="bg-green-600 text-white p-1 rounded"><Save size={14}/></button>
                                                    <button onClick={() => setEditingId(null)} className="bg-gray-300 text-gray-700 p-1 rounded"><X size={14}/></button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 group">
                                                    <span className={`font-mono font-bold text-xs ${item.id ? 'text-slate-800' : 'text-red-400 italic'}`}>{item.id || 'TIADA ID'}</span>
                                                    {canModifyRecord(item) && <button onClick={() => handleEditClick(item)} className="opacity-0 group-hover:opacity-100 text-blue-600"><Edit2 size={12}/></button>}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-3 text-xs font-semibold uppercase">{item.role || 'Peserta'}</td>
                                        <td className="px-6 py-3 text-right">
                                            <button onClick={() => onDelete(item)} disabled={!canModifyRecord(item) || isMigrated} className={`p-1.5 rounded ${canModifyRecord(item) && !isMigrated ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' : 'text-gray-200 cursor-not-allowed'}`}><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                )})}
                                {filteredData.length === 0 && <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400 italic text-xs">Tiada rekod.</td></tr>}
                            </tbody>
                        </table>
                    </div>

                    {/* --- ACTION BUTTONS AREA (Bottom Right) --- */}
                    <div className="bg-slate-50 border-t border-slate-200 p-4 flex flex-wrap justify-end gap-3">
                        {/* RAMBU BUTTON */}
                        {rambuCandidates.length > 0 && allowStudents && isRegistrationOpen && isRambuOpen && (
                            <button 
                                onClick={() => setShowRambuModal(true)} 
                                className="bg-amber-500 text-white px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-amber-600 transition shadow border border-amber-600 animate-[pulse_3s_infinite]"
                            >
                                <Award size={16} /> Daftar Rambu ({rambuCandidates.length})
                            </button>
                        )}

                        {/* SUBMIT BUTTON */}
                        {isRegistrationOpen && showSubmitButton && (
                            <button 
                                onClick={handleFinalSubmit}
                                disabled={isLocking}
                                className="bg-blue-900 hover:bg-blue-800 text-white px-5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition shadow-md"
                            >
                                {isLocking ? <LoadingSpinner size="sm" color="border-white"/> : <Send size={16} />}
                                Hantar {selectedBadgeFilter}
                            </button>
                        )}

                        {/* SUBMITTED STATUS */}
                        {isRegistrationOpen && isSelectedBadgeLocked && (
                            <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 border border-green-200 select-none">
                                <CheckCircle size={16} /> {selectedBadgeFilter} Telah Dihantar
                            </div>
                        )}
                    </div>
                </div>
                </>
            )}
            </div>
        </div>
      </main>

      {/* --- MODALS (Rambu & Import & Password) --- */}
      {showRambuModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-[fadeIn_0.3s_ease-out] backdrop-blur-sm print:hidden">
            <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-2xl relative border-2 border-amber-500">
                <button onClick={() => setShowRambuModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={20} /></button>
                <h3 className="font-bold text-lg mb-4 flex gap-2 items-center text-amber-700 border-b pb-2"><Medal className="text-amber-600" /> Pendaftaran Anugerah Rambu {selectedYear}</h3>
                <div className="max-h-60 overflow-y-auto border rounded-lg mb-4">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-100 uppercase text-xs text-gray-600 sticky top-0">
                            <tr><th className="px-4 py-2 text-center w-10">Pilih</th><th className="px-4 py-2">Nama Murid</th><th className="px-4 py-2 text-center">No. KP</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {rambuCandidates.map((c, i) => (
                                <tr key={i} className="hover:bg-amber-50/50 cursor-pointer" onClick={() => {
                                    if(selectedRambuCandidates.includes(String(c.icNumber))) setSelectedRambuCandidates(prev => prev.filter(ic => ic !== String(c.icNumber)));
                                    else setSelectedRambuCandidates(prev => [...prev, String(c.icNumber)]);
                                }}>
                                    <td className="px-4 py-2 text-center"><input type="checkbox" checked={selectedRambuCandidates.includes(String(c.icNumber))} onChange={() => {}} className="w-4 h-4 text-amber-600 rounded"/></td>
                                    <td className="px-4 py-2 font-bold text-gray-800 uppercase">{c.student}</td>
                                    <td className="px-4 py-2 text-center font-mono">{c.icNumber}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t">
                    <button onClick={() => setShowRambuModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-bold text-sm">Batal</button>
                    <button onClick={handleSubmitRambu} disabled={isSubmittingRambu || selectedRambuCandidates.length === 0} className="bg-amber-600 text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-amber-700 shadow flex items-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed">{isSubmittingRambu ? <LoadingSpinner size="sm" color="border-white"/> : <CheckCircle size={16}/>} Sahkan ({selectedRambuCandidates.length})</button>
                </div>
            </div>
          </div>
      )}

      {showImportModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-[fadeIn_0.3s_ease-out] backdrop-blur-sm print:hidden">
            <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-2xl relative border-2 border-indigo-500">
                <button onClick={() => setShowImportModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={20} /></button>
                <h3 className="font-bold text-lg mb-4 flex gap-2 items-center text-indigo-700 border-b pb-2"><ArrowDownToLine className="text-indigo-600" /> Import Data ({selectedYear})</h3>
                
                <div className="bg-indigo-50 p-4 rounded-lg mb-4 text-sm border border-indigo-100 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <div className="font-bold text-gray-700 text-xs uppercase mb-1">Tahun Asal (Sumber)</div>
                        <select 
                            className="bg-white border rounded px-2 py-1.5 text-gray-700 w-full text-xs font-bold" 
                            value={importSourceYear} 
                            onChange={(e) => { setImportSourceYear(parseInt(e.target.value)); setSelectedImportCandidates([]); }}
                        >
                            {availableYears.filter(y => y < selectedYear).map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <div className="font-bold text-gray-700 text-xs uppercase mb-1">Lencana Asal ({importSourceYear})</div>
                        <select className="bg-white border rounded px-2 py-1.5 text-gray-700 w-full text-xs" value={importSourceBadge} onChange={(e) => { setImportSourceBadge(e.target.value); setSelectedImportCandidates([]); }}><option value="">-- Pilih --</option><option value="Keris Gangsa">Keris Gangsa</option><option value="Keris Perak">Keris Perak</option></select>
                    </div>
                    <div>
                        <div className="font-bold text-gray-700 text-xs uppercase mb-1">Kategori (Peserta Sahaja)</div>
                        <div className="bg-gray-50 border rounded px-3 py-2 text-gray-700 text-xs uppercase">Peserta / Murid</div>
                    </div>
                </div>

                {importSourceBadge && (
                    <div className="max-h-60 overflow-y-auto border rounded-lg mb-4">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 uppercase text-xs text-gray-600 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 text-center w-10"><input type="checkbox" onChange={(e) => { if (e.target.checked) setSelectedImportCandidates(importCandidates.map(c => String(c.icNumber))); else setSelectedImportCandidates([]); }} checked={importCandidates.length > 0 && selectedImportCandidates.length === importCandidates.length}/></th>
                                    <th className="px-4 py-2">Nama</th>
                                    <th className="px-4 py-2 text-center">No. KP</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {importCandidates.map((c, i) => (
                                    <tr key={i} className="hover:bg-indigo-50/50 cursor-pointer" onClick={() => { if(selectedImportCandidates.includes(String(c.icNumber))) setSelectedImportCandidates(prev => prev.filter(ic => ic !== String(c.icNumber))); else setSelectedImportCandidates(prev => [...prev, String(c.icNumber)]); }}>
                                        <td className="px-4 py-2 text-center"><input type="checkbox" checked={selectedImportCandidates.includes(String(c.icNumber))} onChange={() => {}} className="w-4 h-4 text-indigo-600 rounded"/></td>
                                        <td className="px-4 py-2 font-bold text-gray-800 uppercase">{c.student}</td>
                                        <td className="px-4 py-2 text-center font-mono">{c.icNumber}</td>
                                    </tr>
                                ))}
                                {importCandidates.length === 0 && <tr><td colSpan={3} className="text-center py-4 text-gray-400 italic">Tiada calon.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="flex justify-end gap-2 pt-2 border-t">
                    <button onClick={() => setShowImportModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-bold text-sm">Batal</button>
                    <button onClick={handleSubmitImport} disabled={isSubmittingImport || selectedImportCandidates.length === 0} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-indigo-700 shadow flex items-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed">{isSubmittingImport ? <LoadingSpinner size="sm" color="border-white"/> : <CheckCircle size={16}/>} Import ({selectedImportCandidates.length})</button>
                </div>
            </div>
          </div>
      )}

      {showPasswordModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-[fadeIn_0.3s_ease-out] backdrop-blur-sm print:hidden">
            <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm relative">
                <button onClick={() => { setShowPasswordModal(false); setOldPassword(''); setNewPassword(''); setConfirmPassword(''); }} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={20} /></button>
                <h3 className="font-bold text-lg mb-4 flex gap-2 items-center text-gray-800"><Key size={20} className="text-blue-900"/> Tukar Kata Laluan</h3>
                
                <div className="space-y-4 mb-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Kata Laluan Lama</label>
                        <input type="password" className="w-full p-2 border rounded text-sm focus:ring-1 focus:ring-blue-500" value={oldPassword} onChange={e=>setOldPassword(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Kata Laluan Baru</label>
                        <input type="password" className="w-full p-2 border rounded text-sm focus:ring-1 focus:ring-blue-500" value={newPassword} onChange={e=>setNewPassword(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Sahkan Kata Laluan Baru</label>
                        <input type="password" className="w-full p-2 border rounded text-sm focus:ring-1 focus:ring-blue-500" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} />
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={() => setShowPasswordModal(false)} className="px-4 py-2 text-gray-500 font-bold text-xs hover:bg-gray-100 rounded">Batal</button>
                    <button onClick={handleChangePassword} disabled={isChangingPassword} className="bg-blue-900 text-white px-4 py-2 rounded font-bold text-xs hover:bg-blue-800 shadow flex items-center gap-2">
                        {isChangingPassword ? <LoadingSpinner size="sm" color="border-white"/> : "Simpan"}
                    </button>
                </div>
            </div>
          </div>
      )}

      {/* User Profile Modal */}
      {showProfileModal && (
        <UserProfilePage 
          profile={{
            id: user.schoolCode,
            name: user.schoolName,
            email: user.schoolCode,
            school: user.schoolName,
            participantId: '',
            phone: userProfile?.phone || '',
            groupNumber: userProfile?.groupNumber || '',
            principalName: userProfile?.principalName || '',
            principalPhone: userProfile?.principalPhone || '',
            leaderName: userProfile?.leaderName || '',
            leaderPhone: userProfile?.leaderPhone || '',
            leaderIC: userProfile?.leaderIC || '',
            leaderGender: userProfile?.leaderGender || '',
            leaderMembershipId: userProfile?.leaderMembershipId || '',
            leaderRace: userProfile?.leaderRace || '',
            remarks: userProfile?.remarks || '',
            joinDate: userProfile?.lastUpdated || new Date().toISOString()
          }}
          onSave={async (profile) => {
            try {
              const token = await fetchServerCsrf(scriptUrl);
              const result = await updateUserProfile(
                scriptUrl,
                user.schoolCode,
                {
                  phone: profile.phone,
                  groupNumber: profile.groupNumber,
                  principalName: profile.principalName,
                  principalPhone: profile.principalPhone,
                  leaderName: profile.leaderName,
                  leaderPhone: profile.leaderPhone,
                  leaderIC: profile.leaderIC,
                  leaderGender: profile.leaderGender,
                  leaderMembershipId: profile.leaderMembershipId,
                  leaderRace: profile.leaderRace,
                  remarks: profile.remarks
                },
                token || undefined
              );
              
              if (result.success) {
                alert('✅ Profil berjaya dikemaskini!');
                setShowProfileModal(false);
                onRefresh(); // Refresh data to show updated profile
              } else {
                alert('❌ Gagal menyimpan profil: ' + (result.message || 'Unknown error'));
              }
            } catch (error) {
              console.error('Error saving profile:', error);
              alert('❌ Gagal menyimpan profil. Sila cuba lagi.');
            }
          }}
          onClose={() => setShowProfileModal(false)}
        />
      )}
    </div>
  );
};

const HistoryCard = ({ data, year }: { data: any, year: number }) => {
    if (!data) return (
        <div className="bg-white border-2 border-dashed border-gray-200 rounded-lg p-3 flex flex-col items-center justify-center text-gray-300 text-xs h-20 min-w-[140px] opacity-60">
            <LayoutList size={16} className="mb-1 opacity-50"/>
            <span className="text-[10px]">Tiada Data</span>
        </div>
    );

    const isEmas = data.badge.includes('Emas');
    const isRambu = data.badge === 'Anugerah Rambu';
    const isLocked = data.id === 'PENDING';
    
    return (
        <div className={`rounded-lg p-3 border-l-4 shadow-sm h-full flex flex-col justify-between text-xs min-w-[140px] transition hover:shadow-md
            ${isRambu ? 'bg-amber-50 border-amber-500 shadow-amber-100' : isEmas ? 'bg-yellow-50 border-yellow-400 shadow-yellow-100' : 'bg-white border-teal-500 shadow-teal-50'}
        `}>
            <div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mb-1 border
                    ${isRambu ? 'bg-amber-100 text-amber-900 border-amber-200' : isEmas ? 'bg-yellow-100 text-yellow-900 border-yellow-200' : 'bg-gray-100 text-gray-700 border-gray-200'}
                `}>
                    {data.badge}
                </span>
            </div>
            <div className="mt-2">
                <span className="text-[10px] text-gray-400 font-bold uppercase block mb-0.5">No. Keahlian</span>
                <div className={`font-mono font-bold text-sm ${isLocked ? 'text-gray-400 italic' : 'text-gray-800'}`}>
                    {data.id}
                </div>
            </div>
        </div>
    );
};