
import React, { useMemo, useState, useEffect } from 'react';
import { SubmissionData, UserSession, School, Participant, Badge, UserProfile } from '../types';
import { Plus, LogOut, FileText, User, Calendar, Trash2, Search, AlertOctagon, GraduationCap, Shield, Lock, Save, Edit2, Printer, Filter, Send, CheckCircle, AlertTriangle, History, X, Medal, Award, Archive, Clock, ArrowDownToLine, ChevronRight, Users, Menu, Home, School as SchoolIcon, ChevronLeft, Key, ArrowRight, LayoutList, Crown, MapPin, Wallet, Layers } from 'lucide-react';
import { APP_VERSION, LOGO_URL } from '../constants';
import { useResolvedLogo } from '../hooks/useResolvedLogo';

const normalizeText = (value?: string | null) => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
const getSubmissionYear = (value?: string | null) => {
  const parsed = new Date(String(value || ''));
  const year = parsed.getFullYear();
  return Number.isFinite(year) ? year : null;
};
import { updateParticipantId, lockSchoolBadge, submitRegistration, bulkSubmitRegistration, changePassword, updateUserProfile, validatePassword, bulkDeleteSubmissions, updateParticipantFields, getProgramSettings, ProgramSetting, setParticipantsSiri } from '../services/supabaseApi';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { SearchFilter } from './ui/SearchFilter';
import { ExportButton } from './ui/ExportButton';
import { SortableTable } from './ui/SortableTable';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { UserProfilePage } from './UserProfilePage';
import { ProgramSummaryView } from './ProgramSummaryView';
import { BulkImportModal } from './BulkImportModal';
import { NotificationBell } from './ui/NotificationCenter';
import { PDFExportButton } from './ui/PDFExportButton';
import { SchoolQRGenerator, ParticipantQRGenerator } from './ui/QRVerification';
import { WithdrawalsList } from './WithdrawalsList';
import { SchoolLeaderRequestsTab } from './SchoolLeaderRequestsTab';
import { FloatedStudentsTab } from './FloatedStudentsTab';
import { FloatStudentModal } from './FloatStudentModal';
import { countPendingLeaderRequests } from '../services/leaderApprovalService';
import { useDeadlineChecker } from '../context/NotificationContext';
import { logAudit } from '../services/auditService';


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
  onSwitchToLeader?: () => void; // Untuk akaun pemimpin yang ada link sekolah
}

export const UserDashboard: React.FC<UserDashboardProps> = ({ 
    user, allData, schools, badges, userProfiles, isRegistrationOpen, scriptUrl, onLogout, onNewRegistration, onDelete, onRefresh, onSwitchToLeader 
}) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Check badge deadlines and notify
  useDeadlineChecker(badges);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBadgeFilter, setSelectedBadgeFilter] = useState('');
  const [selectedSiriFilter, setSelectedSiriFilter] = useState<number | ''>('');
  
  // Views
  const [showHistoryView, setShowHistoryView] = useState(false);
  const [showArchiveView, setShowArchiveView] = useState(false);
  const [showWithdrawalsView, setShowWithdrawalsView] = useState(false);
  const [showLeaderRequestsView, setShowLeaderRequestsView] = useState(false);
  const [showDataAccessView, setShowDataAccessView] = useState(false);
  const [showFloatedView, setShowFloatedView] = useState(false);
  const [showPaymentView, setShowPaymentView] = useState(false);
  const [floatModalStudent, setFloatModalStudent] = useState<{ personId: string; studentName: string } | null>(null);
  const [pendingLeaderCount, setPendingLeaderCount] = useState(0);

  // Auto-refresh count permintaan pemimpin pending setiap 30 saat
  useEffect(() => {
    if (!user.schoolId) return;
    const refresh = () => {
      countPendingLeaderRequests(user.schoolId!).then(setPendingLeaderCount);
    };
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [user.schoolId, showLeaderRequestsView]);
  const [historyBadgeFilter, setHistoryBadgeFilter] = useState(''); // Filter program untuk Semak Rekod
  const [historySesiFilter, setHistorySesiFilter] = useState(''); // Filter sesi (tahun mula) untuk Semak Rekod
  
  // Modals
  const [showRambuModal, setShowRambuModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  // Sidebar State
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);

  // Import State
  const [importSourceBadge, setImportSourceBadge] = useState('');
  const [importSourceYear, setImportSourceYear] = useState(selectedYear - 1); // Default to previous year
  // Peranan yg hendak diimport naik. User boleh ulang import utk peranan berbeza (peserta/pemimpin/penolong/penguji).
  const [importRole, setImportRole] = useState<'PESERTA' | 'PEMIMPIN' | 'PENOLONG PEMIMPIN' | 'PENGUJI'>('PESERTA');
  const [selectedImportCandidates, setSelectedImportCandidates] = useState<string[]>([]);
  const [importNewIds, setImportNewIds] = useState<Record<string, string>>({});
  const [isSubmittingImport, setIsSubmittingImport] = useState(false);
  // Siri sasaran (bila program target aktifkan siri) — rujuk docs/rancangan-siri.md #4
  const [programSettings, setProgramSettings] = useState<ProgramSetting[]>([]);
  const [importTargetSiri, setImportTargetSiri] = useState(1);
  useEffect(() => { getProgramSettings(selectedYear).then(setProgramSettings); }, [selectedYear]);

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

  // Bulk delete state
  const [selectedForDelete, setSelectedForDelete] = useState<Set<number>>(new Set());
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [isSettingSiri, setIsSettingSiri] = useState(false);
  const [bulkSiriTarget, setBulkSiriTarget] = useState(1);

  // Edit participant state
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false); 

  const currentSchoolSettings = schools.find(s => s.name === user.schoolName);
  
  // Get user profile from userProfiles array FIRST
  const userProfile = useMemo(() => {
    return userProfiles.find(p => p.schoolCode.toUpperCase() === user.schoolCode.toUpperCase());
  }, [userProfiles, user.schoolCode]);

  // Filter badges by scope based on current school's negeri/daerah
  const schoolNegeriCode = userProfile?.negeriCode || currentSchoolSettings?.negeriCode;
  const schoolDaerahCode = userProfile?.daerahCode || currentSchoolSettings?.daerahCode;
  const scopedBadges = useMemo(() => {
    if (!badges || badges.length === 0) return [];
    return badges.filter((badge: Badge) => {
      const scope = badge.scope || 'daerah';
      if (scope === 'daerah') {
        return badge.daerahCode ? badge.daerahCode === schoolDaerahCode : true;
      } else {
        return badge.negeriCode ? badge.negeriCode === schoolNegeriCode : true;
      }
    });
  }, [badges, schoolNegeriCode, schoolDaerahCode]);

  // Resolved logo (daerah > negeri > default)
  const resolvedLogo = useResolvedLogo(
    userProfile?.negeriCode || currentSchoolSettings?.negeriCode,
    userProfile?.daerahCode || currentSchoolSettings?.daerahCode
  );
  
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
    const years = new Set<number>();
    allData.forEach(d => {
      const y = getSubmissionYear(d.date);
      if (y !== null) years.add(y);
    });

    // Ensure current and active registration years are always selectable,
    // even when GAS has no rows yet for that year.
    years.add(currentYear);
    years.add(2025);

    return Array.from(years).sort((a: number, b: number) => b - a);
  }, [allData, currentYear]);
  
  const myData = useMemo(() => {
    const userSchoolCode = normalizeText(user.schoolCode);
    const userSchoolName = normalizeText(user.schoolName);
    const settingsSchoolCode = normalizeText(currentSchoolSettings?.schoolCode);
    const settingsSchoolName = normalizeText(currentSchoolSettings?.name);
    const validCodes = [userSchoolCode, settingsSchoolCode].filter(Boolean);
    const validNames = [userSchoolName, settingsSchoolName].filter(Boolean);

    // DEBUG: Log filter values to help diagnose missing data
    const samples = allData.slice(0, 5).map(d => ({
      schoolCode: (d as any).schoolCode || (d as any).school_code,
      schoolName: d.school || (d as any).schoolName,
      date: d.date,
      year: getSubmissionYear(d.date),
    }));
    console.log('[UserDashboard] allDataLen:', allData.length);
    console.log('[UserDashboard] selectedYear:', selectedYear);
    console.log('[UserDashboard] userSchoolCode:', userSchoolCode, 'userSchoolName:', userSchoolName);
    console.log('[UserDashboard] validCodes:', JSON.stringify(validCodes));
    console.log('[UserDashboard] validNames:', JSON.stringify(validNames));
    console.log('[UserDashboard] sample 5 data:', JSON.stringify(samples, null, 2));

    return allData.filter(d => {
      const rowSchoolCode = normalizeText((d as any).schoolCode || (d as any).school_code || (d as any).kodSekolah);
      const rowSchoolName = normalizeText(d.school || (d as any).schoolName || (d as any).namaSekolah);
      const rowYear = getSubmissionYear(d.date || (d as any).year || (d as any).tahun);

      const matchesSchool =
        (rowSchoolCode && validCodes.includes(rowSchoolCode)) ||
        (rowSchoolName && validNames.includes(rowSchoolName));

      // Tolak peserta yang ditarik balik (withdrawn) dari senarai aktif
      if ((d as any).isWithdrawn) return false;

      return matchesSchool && rowYear === selectedYear;
    });
  }, [allData, user, selectedYear, currentSchoolSettings]);

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
    if (selectedSiriFilter !== '') {
        data = data.filter(item => (item.siri || 1) === selectedSiriFilter);
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
    // Sort: PESERTA -> PEMIMPIN -> PENOLONG PEMIMPIN -> PENGUJI -> lain-lain
    const rolePriority = (role?: string) => {
        const r = (role || 'PESERTA').toUpperCase();
        if (r === 'PESERTA' || r === 'PENERIMA RAMBU') return 1;
        if (r === 'PEMIMPIN') return 2;
        if (r.includes('PENOLONG')) return 3;
        if (r === 'PENGUJI') return 4;
        return 5;
    };
    return [...data].sort((a, b) => {
        const ra = rolePriority(a.role);
        const rb = rolePriority(b.role);
        if (ra !== rb) return ra - rb;
        return (a.student || '').localeCompare(b.student || '');
    });
  }, [myData, searchQuery, selectedBadgeFilter, selectedSiriFilter]);

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
        // Priority: PESERTA (1) -> PEMIMPIN (2) -> PENOLONG (3) -> PENGUJI (4)
        const getRank = (role: string) => {
            const r = (role || 'PESERTA').toUpperCase();
            if (r === 'PESERTA' || r === 'PENERIMA RAMBU') return 1;
            if (r === 'PEMIMPIN') return 2;
            if (r.includes('PENOLONG')) return 3;
            if (r === 'PENGUJI') return 4;
            return 5;
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

  const progressionMap: Record<string, string> = {
      'Keris Perak': 'Keris Gangsa',
      'Keris Emas': 'Keris Perak',
      'Maju': 'Usaha',
      'Jaya': 'Maju'
  };

  const getImportTargetBadge = (sourceBadge: string) => {
      const match = Object.entries(progressionMap).find(([, source]) => sourceBadge.toLowerCase().includes(source.toLowerCase()));
      return match ? match[0] : '';
  };

  // Siri diaktifkan untuk program TARGET import ini? Padankan ikut skop SEKOLAH (bukan badge.negeriCode/
  // daerahCode — medan tu selalunya kosong pada badge yang tak eksplisit di-scope, jadi padanan tu gagal
  // walaupun program_settings memang wujud untuk daerah/negeri sekolah ini).
  const importTargetSiriSetting = useMemo(() => {
      const targetBadgeName = getImportTargetBadge(importSourceBadge);
      if (!targetBadgeName) return undefined;
      const targetBadge = badges.find(b => b.name === targetBadgeName);
      if (!targetBadge) return undefined;
      const scope = targetBadge.scope || 'daerah';
      return programSettings.find(s =>
          s.badgeName === targetBadgeName && s.year === selectedYear &&
          ((scope === 'negeri' && s.negeriCode === schoolNegeriCode) ||
           (scope === 'daerah' && s.daerahCode === schoolDaerahCode)) &&
          s.siriEnabled);
  }, [importSourceBadge, badges, programSettings, selectedYear, schoolNegeriCode, schoolDaerahCode]);
  const importTargetSiriEnabled = !!importTargetSiriSetting;
  useEffect(() => { if (!importTargetSiriEnabled) setImportTargetSiri(1); }, [importTargetSiriEnabled]);

  // --- IMPORT / MIGRATION LOGIC (USER SIDE) ---
  const importCandidates = useMemo(() => {
      if (!importSourceBadge) return [];
      // Use state importSourceYear instead of calculating from selectedYear
      const sourceYear = importSourceYear;
      
      const targetBadge = getImportTargetBadge(importSourceBadge);
      if (!targetBadge) return [];

      const candidates = allData.filter(d => 
          ((d.schoolCode && d.schoolCode === user.schoolCode) || d.school === user.schoolName) &&
          new Date(d.date).getFullYear() === sourceYear &&
          d.badge === importSourceBadge
      );

      const filteredByRole = candidates.filter(d => {
          const role = (d.role || 'PESERTA').toUpperCase();
          if (importRole === 'PESERTA') return role === 'PESERTA' || role === 'PENERIMA RAMBU';
          return role === importRole;
      });

      // Dedup ikut IC HANYA bila IC ada (elak peserta tanpa IC '' terbuang sesama sendiri).
      const existingIcs = new Set(myData.filter(d => d.badge === targetBadge && d.icNumber).map(d => String(d.icNumber)));
      return filteredByRole.filter(c => !(c.icNumber && existingIcs.has(String(c.icNumber))));
  }, [allData, user, selectedYear, importSourceBadge, myData, importSourceYear, importRole]);

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
      const isPesertaRole = (item: SubmissionData) => {
          const role = (item.role || '').toUpperCase();
          return role === 'PESERTA' || role === 'PENERIMA RAMBU';
      };

      // PRA-PROSES: padankan IC kanonik mengikut NAMA.
      // Banyak rekod tahun lama diimport TANPA IC, manakala tahun terkini ADA IC.
      // Tanpa ini, murid sama berpecah jadi dua baris (kunci 'NAMA' vs 'IC_NAMA'),
      // menyebabkan No Keahlian tahun lama (cth 2025) langsung tak dipaparkan.
      // Jika satu nama hanya ada SATU IC merentas semua rekod, gabungkan semuanya.
      const nameToIcs = new Map<string, Set<string>>();
      schoolData.forEach(item => {
          if (!isPesertaRole(item)) return;
          const nm = item.student ? String(item.student).trim().toUpperCase() : '';
          if (!nm) return;
          const ic = item.icNumber ? String(item.icNumber).trim() : '';
          if (!nameToIcs.has(nm)) nameToIcs.set(nm, new Set());
          if (ic.length > 5) nameToIcs.get(nm)!.add(ic);
      });
      const canonicalIcForName = (nm: string): string => {
          const ics = nameToIcs.get(nm);
          return ics && ics.size === 1 ? Array.from(ics)[0] : '';
      };

      const studentMap = new Map<string, { name: string, ic: string, history: Record<number, { id: string, badge: string }> }>();
      schoolData.forEach(item => {
          // ONLY include PESERTA and PENERIMA RAMBU (exclude PENGUJI, PENOLONG PEMIMPIN, PEMIMPIN, etc.)
          if (!isPesertaRole(item)) return;

          // NOTA: Jangan tapis ikut program di sini. Simpan REKOD PENUH murid
          // (semua program/tahun) supaya paparan boleh tunjuk progresi merentas
          // tahun (cth: Keris Perak 2025 -> Keris Emas 2026). Penapisan program
          // dilakukan di peringkat pemilihan murid (cohortStudents).

          // SAFE STRING CONVERSION
          const icStr = item.icNumber ? String(item.icNumber).trim() : '';
          const studentName = item.student ? String(item.student) : '';

          if (!studentName.trim()) return;

          const nm = studentName.trim().toUpperCase();
          // Kunci: guna IC kanonik nama jika ada (gabungkan rekod tanpa IC dgn rekod ber-IC),
          // jika nama ada lebih dari satu IC (kemungkinan nama serupa) guna IC rekod itu sendiri,
          // jika langsung tiada IC guna nama sahaja.
          const canonIc = canonicalIcForName(nm);
          const keyIc = canonIc || (icStr.length > 5 ? icStr : '');
          const key = keyIc ? `${keyIc}_${nm}` : nm;

          if (!studentMap.has(key)) studentMap.set(key, { name: nm, ic: keyIc || '-', history: {} });
          const entry = studentMap.get(key)!;
          if ((entry.ic === '-' || !entry.ic) && keyIc) entry.ic = keyIc;
          const y = new Date(item.date).getFullYear();
          // Store all (jika ada lebih satu program pada tahun sama, rekod terkemudian menang)
          entry.history[y] = { id: item.id || '-', badge: item.badge };
      });

      // Return ALL prepared data sorted
      return Array.from(studentMap.values()).sort((a,b) => a.name.localeCompare(b.name));
  }, [allData, user]);

  // Senarai PROGRAM yang benar-benar ada untuk sekolah ini (dari data sebenar).
  // Nilai diambil terus dari rekod supaya padanan filter tepat.
  const availableProgramsForSchool = useMemo(() => {
      const set = new Set<string>();
      myHistoryData.forEach(row => {
          Object.values(row.history).forEach(rec => {
              if (rec.badge && String(rec.badge).trim()) set.add(String(rec.badge).trim());
          });
      });
      return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [myHistoryData]);

  // Senarai SESI (tahun) yang ada rekod bagi PROGRAM yang dipilih.
  // Sesi = tahun tumpuan (cth: 2026). Hanya tahun di mana program dipilih
  // benar-benar wujud yang disenaraikan.
  const availableSessions = useMemo(() => {
      if (!historyBadgeFilter) return [];
      const set = new Set<number>();
      myHistoryData.forEach(row => {
          Object.entries(row.history).forEach(([yStr, rec]) => {
              const y = Number(yStr);
              if (!Number.isNaN(y) && rec.badge === historyBadgeFilter) set.add(y);
          });
      });
      return Array.from(set).sort((a, b) => b - a);
  }, [myHistoryData, historyBadgeFilter]);

  // Determine if specific record modification is allowed based on granular permissions
  const approvedBadges = currentSchoolSettings?.approvedBadges || [];
  const canModifyRecord = (item: SubmissionData) => {
      if (!isRegistrationOpen) return false;
      
      const itemYear = new Date(item.date).getFullYear();
      if (itemYear < currentYear) return false;
      
      const lockKey = getLockKey(item.badge, itemYear);
      if (lockedBadges.includes(lockKey)) return false;
      
      // If badge+year is approved, user cannot modify
      if (approvedBadges.includes(lockKey)) return false;

      const perBadgePermissions = currentSchoolSettings?.badgeEditPermissions?.[lockKey];
      const role = (item.role || 'PESERTA').toUpperCase();
      if (role === 'PENGUJI') return perBadgePermissions?.examiners ?? allowExaminers;
      if (role.includes('PENOLONG') || role === 'PEMIMPIN') return perBadgePermissions?.assistants ?? allowAssistants;
      return perBadgePermissions?.students ?? allowStudents;
  };

  const isCurrentOrFuture = selectedYear >= currentYear;
  // canAddGeneral checks if at least one category is allowed for NEW registrations
  const canAddGeneral = isRegistrationOpen && isAnyAllowed && isCurrentOrFuture;
  
  const currentLockKey = selectedBadgeFilter ? getLockKey(selectedBadgeFilter, selectedYear) : '';
  const isSelectedBadgeLocked = selectedBadgeFilter !== '' && lockedBadges.includes(currentLockKey);
  const isSelectedBadgeApproved = selectedBadgeFilter !== '' && approvedBadges.includes(currentLockKey);
  
  // Show submit button if: Registration Open AND At least one permission allowed AND Badge not submitted/approved
  const showSubmitButton = selectedBadgeFilter !== '' && isAnyAllowed && !isSelectedBadgeLocked && !isSelectedBadgeApproved;

  const handleEditClick = (item: SubmissionData) => {
      if (!canModifyRecord(item)) return;
      setEditingId(item.rowIndex || 0);
      setTempIdValue(item.id || ''); // Ensure not undefined
  };

  const handleSaveId = async (item: SubmissionData) => {
      if (!item.rowIndex) return;
      const cleanNewId = tempIdValue.trim().toUpperCase();
      if (cleanNewId) {
          // ID sama dibenarkan untuk program berlainan — halang hanya jika bertindih dalam program + tahun yang sama.
          const isDuplicate = allData.some(d =>
              new Date(d.date).getFullYear() === selectedYear &&
              d.badge === item.badge &&
              String(d.id || '').trim().toUpperCase() === cleanNewId &&
              d.rowIndex !== item.rowIndex
          );
          if (isDuplicate) { alert(`ID '${cleanNewId}' telah digunakan untuk program '${item.badge}' tahun ${selectedYear}.`); return; }
      }
      setSavingId(true);
      try {
          const res = await updateParticipantId(scriptUrl, item.rowIndex, cleanNewId, user.schoolCode);
          if (res.status === 'success') { setEditingId(null); onRefresh(); } else alert("Gagal kemaskini: " + res.message);
      } catch (e) { alert("Ralat server."); } finally { setSavingId(false); }
  };

  // Bulk delete handlers
  const toggleSelectForDelete = (index: number) => {
    setSelectedForDelete(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedForDelete.size === filteredData.length) {
      setSelectedForDelete(new Set());
    } else {
      setSelectedForDelete(new Set(filteredData.map((_, i) => i)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedForDelete.size === 0) return;
    const selItems = Array.from(selectedForDelete).map(i => filteredData[i]).filter(Boolean);
    const yrOf = (d: any) => { try { return new Date(d.date).getFullYear(); } catch { return '?'; } };
    const programs = [...new Set(selItems.map(d => `${d.badge} ${yrOf(d)}`))];
    const schoolsAff = [...new Set(selItems.map(d => d.school).filter(Boolean))];
    const preview = selItems.slice(0, 8).map(d => `• ${d.student}`).join('\n');
    const more = selItems.length > 8 ? `\n…dan ${selItems.length - 8} lagi` : '';
    if (!confirm(
      `⚠️ ANDA PASTI MAHU PADAM ${selItems.length} REKOD PESERTA?\n\n` +
      `Program: ${programs.join(', ')}\n` +
      `Sekolah: ${schoolsAff.join(', ')}\n\n` +
      `${preview}${more}\n\n` +
      `Rekod ini akan dikeluarkan dari senarai pendaftaran.`
    )) return;
    // Pengesahan kedua untuk padaman banyak (elak tersilap padam pukal).
    if (selItems.length >= 5) {
      if (!confirm(`SEKALI LAGI: Sahkan padam ${selItems.length} rekod untuk ${programs.join(', ')}?\n\nTindakan ini tidak boleh diundur dengan mudah.`)) return;
    }
    setIsDeletingBulk(true);
    try {
      const items = selItems.map(d => ({ participantId: d.participantId, icNumber: d.icNumber, id: d.id, student: d.student, badge: d.badge, schoolCode: d.schoolCode, school: d.school, date: d.date }));
      const res = await bulkDeleteSubmissions(items);
      if (res.status === 'success') {
        alert(res.message || 'Rekod berjaya dipadam.');
        setSelectedForDelete(new Set());
        onRefresh();
      } else {
        alert('Gagal: ' + (res.message || 'Ralat tidak diketahui.'));
      }
    } catch (e) { alert('Ralat server.'); } finally { setIsDeletingBulk(false); }
  };

  // Program mana yang aktifkan siri untuk tahun dipapar — kawal keterlihatan aksi "Set Siri" (pukal).
  const siriEnabledBadgeNames = useMemo(() => {
    const set = new Set<string>();
    programSettings.forEach(s => { if (s.year === selectedYear && s.siriEnabled) set.add(s.badgeName); });
    return set;
  }, [programSettings, selectedYear]);

  // Had bilangan siri ikut program (default 5 jika tiada tetapan/badge kosong).
  const maxSiriForBadge = (badgeName: string): number => {
    const s = programSettings.find(p => p.badgeName === badgeName && p.year === selectedYear && p.siriEnabled);
    return s?.maxSiri || 5;
  };
  // Had tertinggi merentas semua program aktif siri — digunakan bila pemilihan pukal merangkumi >1 program.
  const maxSiriAcrossEnabled = useMemo(() => {
    let max = 1;
    programSettings.forEach(s => { if (s.year === selectedYear && s.siriEnabled) max = Math.max(max, s.maxSiri || 5); });
    return max;
  }, [programSettings, selectedYear]);

  const handleBulkSetSiri = async (siri: number) => {
    if (selectedForDelete.size === 0) return;
    const selItems = Array.from(selectedForDelete).map(i => filteredData[i]).filter(Boolean);
    const eligible = selItems.filter(d => siriEnabledBadgeNames.has(d.badge));
    const skipped = selItems.length - eligible.length;
    if (eligible.length === 0) { alert('Tiada peserta dipilih yang program-nya aktifkan Siri.'); return; }
    const personIds = eligible.map(d => d.participantId).filter((id): id is string => !!id);
    if (!confirm(`Tandakan ${personIds.length} peserta sebagai Siri ${siri}?${skipped > 0 ? `\n(${skipped} peserta lain diabaikan kerana program mereka tak aktifkan Siri.)` : ''}`)) return;
    setIsSettingSiri(true);
    try {
      const res = await setParticipantsSiri(personIds, siri);
      if (res.status === 'success') {
        alert(res.message || 'Berjaya ditandakan.');
        setSelectedForDelete(new Set());
        onRefresh();
      } else {
        alert('Gagal: ' + (res.message || 'Ralat tidak diketahui.'));
      }
    } catch (e) { alert('Ralat server.'); } finally { setIsSettingSiri(false); }
  };

  // Edit participant handlers
  const handleEditRow = (item: SubmissionData, index: number) => {
    setEditingRow(index);
    setEditFormData({
      name: item.student || '',
      gender: item.gender || '',
      race: item.race || '',
      membershipId: item.id || '',
      icNumber: item.icNumber || '',
      phoneNumber: item.studentPhone || '',
      role: item.role || 'PESERTA',
      category: item.category || '',
      unit: item.unit || '',
      makanan: item.makanan || '',
      masalahKesihatan: item.masalahKesihatan || '',
      masalahKesihatanLain: item.masalahKesihatanLain || '',
      remarks: item.remarks || '',
    });
  };

  const handleSaveEdit = async (item: SubmissionData) => {
    setSavingEdit(true);
    try {
      const identifier = { icNumber: item.icNumber, membershipId: item.id, name: item.student };
      const res = await updateParticipantFields(identifier, editFormData);
      if (res.status === 'success') { setEditingRow(null); onRefresh(); }
      else alert('Gagal: ' + (res.message || 'Ralat.'));
    } catch (e) { alert('Ralat server.'); } finally { setSavingEdit(false); }
  };

  const handleFinalSubmit = async () => {
    if (!selectedBadgeFilter) return;
    if (!confirm(`PENGESAHAN AKHIR (${selectedYear})\n\nAdakah anda pasti mahu menghantar pendaftaran untuk program '${selectedBadgeFilter}' pada tahun ${selectedYear}?\n\nSelepas ini data akan dikunci.`)) return;
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
      const candidatesToSubmit = rambuCandidates.filter(c => selectedRambuCandidates.includes(c.icNumber || ''));
      if (candidatesToSubmit.length === 0) { alert("Tiada peserta yang sah dipilih."); setIsSubmittingRambu(false); return; }
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
      let idCounter = 0;
      const participants: Participant[] = candidatesToSubmit.map(c => ({ id: Date.now() + (++idCounter), name: c.student, gender: c.gender, race: c.race || '', membershipId: c.id, icNumber: c.icNumber || '', phoneNumber: c.studentPhone || '', remarks: 'Layak Anugerah Rambu' }));
      try {
          await submitRegistration(scriptUrl, leaderInfo, participants, [], [], undefined);
          alert("Berjaya!"); setShowRambuModal(false); setSelectedRambuCandidates([]); onRefresh();
      } catch (e) { alert("Gagal."); } finally { setIsSubmittingRambu(false); }
  };

  const handleSubmitImport = async () => {
      if(selectedImportCandidates.length === 0) { alert("Sila pilih nama."); return; }
      
      const targetBadge = getImportTargetBadge(importSourceBadge);
      
      const badgeConfig = badges.find(b => b.name === targetBadge);
      if (badgeConfig && !badgeConfig.isOpen) { alert(`Pendaftaran '${targetBadge}' ditutup.`); return; }
      
      if(!confirm(`Import ${selectedImportCandidates.length} data ke ${targetBadge}?`)) return;
      setIsSubmittingImport(true);
      
      const candidatesToSubmit = importCandidates.filter(c => selectedImportCandidates.includes(String(c.participantId)));
      if (candidatesToSubmit.length === 0) { alert("Tiada peserta yang sah dipilih."); setIsSubmittingImport(false); return; }

      // No. KP (IC) TIDAK wajib semasa import naik — hanya No Kad Keahlian wajib.
      const missingNewId = candidatesToSubmit.find(c => !String(importNewIds[String(c.participantId)] || '').trim());
      if (missingNewId) { alert(`Sila isi No Kad Keahlian untuk ${missingNewId.student}.`); setIsSubmittingImport(false); return; }

      const newIds = candidatesToSubmit.map(c => String(importNewIds[String(c.participantId)] || '').trim().toUpperCase());
      const duplicateNewId = newIds.find((id, idx) => newIds.indexOf(id) !== idx);
      if (duplicateNewId) { alert(`ID keahlian baru duplicate dalam import: ${duplicateNewId}`); setIsSubmittingImport(false); return; }

      // ID keahlian boleh sama merentas program/tahun berlainan (orang yang sama).
      // Hanya halang jika ID sudah wujud untuk PROGRAM + TAHUN yang sama (cohort yang sama).
      const existingId = newIds.find(id => allData.some(d =>
          String(d.id || '').trim().toUpperCase() === id &&
          d.badge === targetBadge &&
          new Date(d.date).getFullYear() === selectedYear
      ));
      if (existingId) { alert(`ID keahlian "${existingId}" sudah wujud untuk program '${targetBadge}' tahun ${selectedYear}. (ID sama dibenarkan untuk program lain.)`); setIsSubmittingImport(false); return; }

      const ref = candidatesToSubmit[0];

      // Bina rekod utk bulkSubmitRegistration. Peranan ditetapkan ikut pilihan import (importRole).
      // bulkSubmitRegistration akan isi kategori/unit secara automatik:
      //   PESERTA -> kategori (default Pengakap Kanak-kanak) + unit (default Perdana)
      //   PEMIMPIN/PENOLONG PEMIMPIN/PENGUJI -> kategori null (bukan jenis pengakap)
      const records = candidatesToSubmit.map(c => ({
          student: c.student,
          icNumber: c.icNumber || '',
          membershipId: String(importNewIds[String(c.participantId)] || '').trim().toUpperCase(),
          gender: c.gender,
          race: c.race || '',
          phoneNumber: c.studentPhone || '',
          role: importRole,
          category: c.category || undefined,
          unit: c.unit || undefined,
          siri: importTargetSiriEnabled ? importTargetSiri : 1,
          remarks: `[IMPORT NAIK DARI ${importSourceBadge} ${importSourceYear}] ID baru diisi semasa import`,
      }));

      try {
          const res = await bulkSubmitRegistration(scriptUrl, {
              schoolName: ref.school,
              schoolCode: ref.schoolCode || user.schoolCode,
              badgeType: targetBadge,
              year: selectedYear,
              role: importRole,
              records,
          });
          if (res.status !== 'success') throw new Error(res.message);
          alert(`Berjaya import naik ${records.length} ${importRole} ke ${targetBadge}.`);
          setShowImportModal(false);
          setSelectedImportCandidates([]);
          setImportNewIds({});
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
      const passValidation = validatePassword(newPassword);
      if (!passValidation.valid) { alert(passValidation.errors.join('\n')); return; }

      setIsChangingPassword(true);
      try {
          const res = await changePassword(scriptUrl, { schoolCode: user.schoolCode, oldPassword, newPassword });
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
      <div className="md:hidden text-white p-4 flex justify-between items-center shadow-md print:hidden sticky top-0 z-50 border-b-2 border-amber-600" style={{ background: '#07012C' }}>
          <div className="flex items-center gap-2">
              <User size={20} className="text-amber-500" />
              <div className="text-sm font-bold truncate w-36">{user.schoolName}</div>
          </div>
          <div className="flex items-center gap-1">
              <button onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)} className="p-2 hover:bg-slate-800 rounded">
                  <Menu size={24} />
              </button>
          </div>
      </div>

      {/* SIDEBAR NAVIGATION (DARK & LUXURY) */}
      <aside
          style={{ background: 'linear-gradient(180deg, #230F5C 0%, #07012C 60%, #04011E 100%)', borderColor: '#1a0a47' }}
          className={`
          fixed inset-y-0 left-0 z-50 text-slate-300 shadow-2xl transform transition-all duration-300 ease-in-out border-r flex flex-col
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
              <img src={resolvedLogo} alt="Logo" className="h-14 w-auto mb-3 drop-shadow-md" />
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
                isActive={!showHistoryView && !showArchiveView && !showWithdrawalsView && !showDataAccessView && !showFloatedView && !showPaymentView}
                onClick={() => { setShowHistoryView(false); setShowArchiveView(false); setShowWithdrawalsView(false); setShowDataAccessView(false); setShowFloatedView(false); setShowPaymentView(false); setIsMobileSidebarOpen(false); }}
              />

              <SidebarItem
                icon={Wallet}
                label="Rumusan Bayaran"
                isActive={showPaymentView}
                onClick={() => { setShowPaymentView(true); setShowHistoryView(false); setShowArchiveView(false); setShowWithdrawalsView(false); setShowDataAccessView(false); setShowFloatedView(false); setShowLeaderRequestsView(false); setIsMobileSidebarOpen(false); }}
              />

              <SidebarItem 
                icon={Archive} 
                label="Arkib Pencapaian" 
                isActive={showArchiveView}
                onClick={() => { setShowArchiveView(true); setShowHistoryView(false); setShowWithdrawalsView(false); setIsMobileSidebarOpen(false); }} 
              />

              <SidebarItem 
                icon={History} 
                label="Semak Rekod" 
                isActive={showHistoryView}
                onClick={() => { setShowHistoryView(true); setShowArchiveView(false); setShowWithdrawalsView(false); setIsMobileSidebarOpen(false); }} 
              />

              <SidebarItem
                icon={AlertTriangle}
                label="Status Peserta"
                isActive={showWithdrawalsView}
                onClick={() => { setShowWithdrawalsView(true); setShowHistoryView(false); setShowArchiveView(false); setShowLeaderRequestsView(false); setIsMobileSidebarOpen(false); }}
              />

              <SidebarItem
                icon={Users}
                label="Akses Pemimpin"
                badge={pendingLeaderCount}
                isActive={showLeaderRequestsView}
                onClick={() => { setShowLeaderRequestsView(true); setShowWithdrawalsView(false); setShowHistoryView(false); setShowArchiveView(false); setShowFloatedView(false); setIsMobileSidebarOpen(false); }}
              />

              <SidebarItem
                icon={MapPin}
                label="Murid Diapungkan"
                isActive={showFloatedView}
                onClick={() => { setShowFloatedView(true); setShowLeaderRequestsView(false); setShowWithdrawalsView(false); setShowHistoryView(false); setShowArchiveView(false); setShowDataAccessView(false); setIsMobileSidebarOpen(false); }}
              />

              <SidebarItem
                icon={Shield}
                label="Data Peribadi (PDPA)"
                isActive={showDataAccessView}
                onClick={() => { setShowDataAccessView(true); setShowLeaderRequestsView(false); setShowWithdrawalsView(false); setShowHistoryView(false); setShowArchiveView(false); setIsMobileSidebarOpen(false); }}
              />

              <SidebarItem 
                icon={Printer} 
                label="Cetak Paparan" 
                onClick={() => { window.print(); setIsMobileSidebarOpen(false); }} 
              />

              <SidebarItem 
                icon={ArrowDownToLine} 
                label="Import Naik Program" 
                onClick={() => { 
                    setShowImportModal(true); 
                    setIsMobileSidebarOpen(false); 
                    setImportSourceYear(selectedYear - 1);
                    setSelectedImportCandidates([]);
                    setImportNewIds({});
                }} 
              />

              <SidebarItem 
                icon={FileText} 
                label="Import Pukal Excel" 
                onClick={() => { 
                    setShowBulkImportModal(true); 
                    setIsMobileSidebarOpen(false); 
                }} 
              />

          </div>

          <div className="p-4 border-t border-slate-800 bg-slate-900">
              <SidebarItem 
                icon={User} 
                label="Profil Saya" 
                onClick={() => { setShowProfileModal(true); setIsMobileSidebarOpen(false); }} 
                className="text-blue-300 hover:bg-blue-900/20 hover:text-blue-200 border border-blue-900/30"
              />

              <SidebarItem 
                icon={LogOut} 
                label="Log Keluar" 
                className="text-red-400 hover:bg-red-900/20 hover:text-red-300 mt-auto border border-transparent hover:border-red-900/30"
                onClick={onLogout} 
              />

              {onSwitchToLeader && (
                <SidebarItem
                  icon={LogOut}
                  label="Kembali ke Modul Kursus"
                  className="text-emerald-400 hover:bg-emerald-900/20 hover:text-emerald-300 border border-emerald-900/30"
                  onClick={onSwitchToLeader}
                />
              )}

              {isDesktopSidebarOpen && (
                  <div className="text-center mt-4 text-[9px] text-slate-600 font-mono">
                      {APP_VERSION}
                  </div>
              )}
          </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-hidden flex flex-col h-screen overflow-y-auto">
        {/* Top Toolbar - sentiasa nampak */}
        <div className="hidden md:flex items-center justify-end gap-2 px-6 py-2 bg-white border-b border-gray-200 print:hidden">
          <NotificationBell />
        </div>

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
                         <img src={resolvedLogo} className="h-20 w-auto object-contain" alt="Logo" />
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
            {showFloatedView ? (
              <FloatedStudentsTab 
                schoolCode={user.schoolCode}
                schoolName={user.schoolName}
                negeriCode={userProfiles.find(u => u.schoolCode === user.schoolCode)?.negeriCode || schools.find(s => s.name === user.schoolName)?.negeriCode}
                daerahCode={userProfiles.find(u => u.schoolCode === user.schoolCode)?.daerahCode || schools.find(s => s.name === user.schoolName)?.daerahCode}
                onRefresh={onRefresh}
              />
            ) : showDataAccessView ? (
                <div className="bg-white rounded-xl shadow p-6 space-y-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <Shield className="text-blue-600" size={20} />
                    </div>
                    <div>
                      <h2 className="font-bold text-slate-800 text-lg">Akses Data Peribadi (PDPA)</h2>
                      <p className="text-xs text-slate-500">Hak anda di bawah Akta Perlindungan Data Peribadi 2010</p>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-3">
                    <h3 className="font-bold text-sm text-blue-900">Data Sekolah Anda</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div><span className="text-slate-500 font-semibold">Nama Sekolah:</span> <span className="text-slate-700">{user.schoolName || '-'}</span></div>
                      <div><span className="text-slate-500 font-semibold">Kod Sekolah:</span> <span className="text-slate-700">{user.schoolCode || '-'}</span></div>
                      <div><span className="text-slate-500 font-semibold">ID Sekolah:</span> <span className="text-slate-700 font-mono">{user.schoolId || '-'}</span></div>
                      <div><span className="text-slate-500 font-semibold">Jumlah Rekod ({selectedYear}):</span> <span className="text-slate-700">{myData.length} peserta</span></div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-bold text-sm text-slate-800">Hak Anda Di Bawah PDPA</h3>
                    <ul className="text-xs text-slate-600 space-y-2 list-disc pl-4">
                      <li><strong>Akses:</strong> Anda boleh melihat semua data yang disimpan mengenai sekolah anda di dashboard ini.</li>
                      <li><strong>Pembetulan:</strong> Untuk membetulkan data yang tidak tepat, sila hubungi Meja Bantuan melalui Telegram.</li>
                      <li><strong>Penarikan Balik:</strong> Anda boleh meminta data dipadam dengan menghubungi Pegawai Perlindungan Data (DPO).</li>
                      <li><strong>Aduan:</strong> Anda berhak membuat aduan kepada Pesuruhjaya Perlindungan Data Peribadi Malaysia.</li>
                    </ul>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <h3 className="font-bold text-xs text-amber-800 mb-2">Hubungi DPO / Meja Bantuan</h3>
                    <p className="text-xs text-amber-700 mb-2">Untuk sebarang pertanyaan mengenai data peribadi, pembetulan data, atau penarikan balik persetujuan:</p>
                    <a
                      href="https://t.me/AkmalNasir"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded-lg transition-colors"
                    >
                      Hubungi Melalui Telegram
                    </a>
                  </div>

                  <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-100">
                    <p>Polisi Retensi: Data disimpan selama tempoh keahlian aktif + 7 tahun selepas tamat, kemudian dipadam secara automatik.</p>
                    <p className="mt-1">Terakhir dikemas kini: Mei 2026</p>
                  </div>
                </div>
            ) : showLeaderRequestsView ? (
                user.schoolId ? (
                  <SchoolLeaderRequestsTab
                    schoolId={user.schoolId}
                    schoolName={user.schoolName || ''}
                    approverName={user.schoolCode || user.schoolName || 'Admin Sekolah'}
                  />
                ) : (
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg text-sm text-amber-800">
                    Tiada ID sekolah dalam sesi ini. Sila log masuk semula.
                  </div>
                )
            ) : showWithdrawalsView ? (
                <WithdrawalsList
                  data={allData.filter(d => {
                    const code = String((d as any).schoolCode || '').toUpperCase();
                    const userCode = String(user.schoolCode || '').toUpperCase();
                    return code === userCode;
                  })}
                  onRefresh={onRefresh}
                  allowUnwithdraw={false}
                  scopeLabel={user.schoolName}
                />
            ) : showHistoryView ? (
                // --- HISTORY VIEW (COHORT BLOCKS) ---
                <div className="space-y-8 animate-[fadeIn_0.3s_ease-out]">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-2 border-b">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2 text-lg">
                            <History size={20} className="text-blue-900"/> Semakan Keahlian Mengikut Sesi
                        </h2>
                        
                        {/* Filter Program & Sesi (kedua-duanya wajib dipilih) */}
                        <div className="flex flex-wrap items-center gap-2">
                            <Filter size={16} className="text-gray-500"/>
                            {/* PROGRAM */}
                            <select
                                value={historyBadgeFilter}
                                onChange={(e) => { setHistoryBadgeFilter(e.target.value); setHistorySesiFilter(''); }}
                                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            >
                                <option value="">-- Pilih Program --</option>
                                {availableProgramsForSchool.map(name => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                            {/* SESI (tahun mula) */}
                            <select
                                value={historySesiFilter}
                                onChange={(e) => setHistorySesiFilter(e.target.value)}
                                disabled={!historyBadgeFilter}
                                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                            >
                                <option value="">-- Pilih Sesi --</option>
                                {availableSessions.map(y => (
                                    <option key={y} value={y}>Sesi {y}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    
                    {!historyBadgeFilter ? (
                        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
                            <Filter size={28} className="mx-auto mb-3 opacity-40" />
                            <p className="italic">Sila pilih <b>Program</b> dan <b>Sesi</b> untuk memaparkan rekod.</p>
                        </div>
                    ) : availableSessions.length === 0 ? (
                        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
                            <p className="italic">Tiada rekod dijumpai untuk program ini.</p>
                        </div>
                    ) : !historySesiFilter ? (
                        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
                            <Filter size={28} className="mx-auto mb-3 opacity-40" />
                            <p className="italic">Sila pilih <b>Sesi</b> untuk memaparkan rekod.</p>
                        </div>
                    ) : [Number(historySesiFilter)].map(sesiYear => {
                        // SESI = tahun tumpuan yang dipilih (cth: 2026).
                        // Pilih murid yang menyertai PROGRAM dipilih pada tahun sesi ini.
                        // (Rekod penuh murid disimpan, jadi tahun lain & program lain
                        // tetap dipaparkan sebagai progresi.)
                        const cohortStudents = myHistoryData.filter(row =>
                            row.history[sesiYear] && row.history[sesiYear].badge === historyBadgeFilter
                        );

                        if (cohortStudents.length === 0) return (
                            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
                                <p className="italic">Tiada rekod untuk sesi {sesiYear}.</p>
                            </div>
                        );

                        // Julat tahun DINAMIK: tunjuk SEMUA tahun berkaitan murid yang dipaparkan
                        // (rekod terawal hingga terkini), bukan hanya bermula dari tahun sesi.
                        // Contoh: sesi 2026, jika ada rekod 2025/2026/2027 — semua dipaparkan.
                        let minYear = sesiYear;
                        let maxYear = sesiYear;
                        cohortStudents.forEach(row => {
                            Object.keys(row.history).map(Number).filter(y => !Number.isNaN(y)).forEach(y => {
                                if (y < minYear) minYear = y;
                                if (y > maxYear) maxYear = y;
                            });
                        });
                        const yearColumns: number[] = [];
                        for (let y = minYear; y <= maxYear; y++) yearColumns.push(y);

                        return (
                            <div key={sesiYear} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="bg-blue-900 px-4 py-3 flex justify-between items-center text-white">
                                    <h3 className="font-bold text-sm uppercase flex items-center gap-2 tracking-wider">
                                        <History size={16} className="text-amber-400"/>
                                        Sesi {sesiYear}
                                        {yearColumns.length > 1 && <span className="text-amber-300 normal-case font-normal">(rekod {minYear} - {maxYear})</span>}
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
                                                {yearColumns.map((y, idx) => (
                                                    <th key={y} className={`px-4 py-3 w-40 text-center border-b border-slate-200 ${idx < yearColumns.length - 1 ? 'border-r' : ''} ${y === sesiYear ? 'bg-amber-100 text-amber-900' : ''}`}>
                                                        {y}{y === sesiYear && <span className="block text-[9px] font-bold tracking-wide">• SESI DIPILIH</span>}
                                                    </th>
                                                ))}
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

                                                    {yearColumns.map((y, idx) => (
                                                        <td key={y} className={`px-2 py-2 align-top relative ${idx < yearColumns.length - 1 ? 'border-r border-gray-100' : ''} ${y === sesiYear ? 'bg-amber-50/60' : ''}`}>
                                                            <HistoryCard data={row.history[y]} year={y} />
                                                            {idx < yearColumns.length - 1 && (
                                                                <div className="absolute top-1/2 -right-3 -mt-2 z-10 text-slate-300"><ArrowRight size={16} strokeWidth={3} /></div>
                                                            )}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })}
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
            ) : showPaymentView ? (
                // --- RUMUSAN BAYARAN & SAIZ BAJU ---
                <ProgramSummaryView records={myData} year={selectedYear} mode="school" />
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
                        <p className="text-slate-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><Filter size={12}/> Program</p>
                        <select className="w-full p-1.5 border rounded font-bold text-slate-800 text-sm bg-slate-50" value={selectedBadgeFilter} onChange={(e) => { setSelectedBadgeFilter(e.target.value); setSelectedSiriFilter(''); }}>
                            <option value="">Semua Program</option>
                            {availableBadges.map((b, i) => <option key={i} value={b}>{b}</option>)}
                        </select>
                        {siriEnabledBadgeNames.size > 0 && (
                            <select className="w-full p-1.5 border rounded font-bold text-purple-700 text-xs bg-purple-50 mt-1.5" value={selectedSiriFilter} onChange={(e) => setSelectedSiriFilter(e.target.value ? Number(e.target.value) : '')} title="Tapis ikut Siri — merentas semua program yang aktifkan Siri jika Program tak dipilih">
                                <option value="">Semua Siri</option>
                                {Array.from({ length: selectedBadgeFilter ? maxSiriForBadge(selectedBadgeFilter) : maxSiriAcrossEnabled }, (_, i) => i + 1).map(s => <option key={s} value={s}>Siri {s}</option>)}
                            </select>
                        )}
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
                        Pilih <strong>Program</strong> di atas untuk membolehkan butang "Hantar Pendaftaran".
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
                                    {selectedBadgeFilter ? `Program: ${selectedBadgeFilter} | Tahun: ${selectedYear}` : ''}
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
                        Pilih <strong>Program</strong> di atas untuk membolehkan butang "Hantar Pendaftaran".
                    </div>
                )}

                {/* MAIN TABLE CARD */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b bg-slate-50/50 flex flex-col md:flex-row justify-between items-center gap-3">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2 text-sm uppercase tracking-wide">
                            <FileText size={16} className="text-blue-900" /> Senarai Peserta {selectedYear}
                            {selectedBadgeFilter && <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px]">({selectedBadgeFilter})</span>}
                        </h2>
                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <div className="relative flex-1 md:w-52">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input 
                                    type="text" 
                                    className="w-full pl-9 p-2 border rounded-lg text-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none" 
                                    placeholder="Cari..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <PDFExportButton 
                                data={filteredData} 
                                year={selectedYear} 
                                badge={selectedBadgeFilter} 
                                school={user.schoolName}
                                title="SENARAI PENDAFTARAN PENGAKAP"
                            />
                            {filteredData.length > 0 && (
                              <SchoolQRGenerator data={filteredData} year={selectedYear} />
                            )}
                            {filteredData.length > 0 && (
                              <ParticipantQRGenerator data={filteredData} year={selectedYear} />
                            )}
                        </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                        {/* Bulk delete toolbar */}
                        {selectedForDelete.size > 0 && (
                          <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between flex-wrap gap-2">
                            <span className="text-xs font-bold text-red-700">{selectedForDelete.size} rekod dipilih</span>
                            <div className="flex items-center gap-2">
                              {siriEnabledBadgeNames.size > 0 && (
                                <div className="flex items-center gap-1 bg-purple-50 border border-purple-200 rounded-lg px-2 py-1">
                                  <Layers size={12} className="text-purple-600" />
                                  <select value={bulkSiriTarget} onChange={(e) => setBulkSiriTarget(Number(e.target.value))} className="bg-transparent text-xs font-bold text-purple-700 outline-none">
                                    {Array.from({ length: maxSiriAcrossEnabled }, (_, i) => i + 1).map(s => <option key={s} value={s}>Siri {s}</option>)}
                                  </select>
                                  <button onClick={() => handleBulkSetSiri(bulkSiriTarget)} disabled={isSettingSiri} className="bg-purple-600 text-white px-2 py-1 rounded text-xs font-bold hover:bg-purple-700 disabled:opacity-50">
                                    {isSettingSiri ? <LoadingSpinner size="sm" color="border-white" /> : `Set Siri ${bulkSiriTarget}`}
                                  </button>
                                </div>
                              )}
                              <button onClick={handleBulkDelete} disabled={isDeletingBulk} className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-red-700 disabled:opacity-50">
                                {isDeletingBulk ? <LoadingSpinner size="sm" color="border-white" /> : <Trash2 size={12} />} Padam Dipilih
                              </button>
                            </div>
                          </div>
                        )}
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-100 text-slate-600 uppercase text-xs font-bold">
                                <tr>
                                    <th className="px-3 py-3 w-8">
                                      <input type="checkbox" checked={filteredData.length > 0 && selectedForDelete.size === filteredData.length} onChange={toggleSelectAll} className="rounded" />
                                    </th>
                                    <th className="px-4 py-3">Nama</th>
                                    <th className="px-4 py-3">KP / Program</th>
                                    <th className="px-4 py-3">Kaum</th>
                                    <th className="px-4 py-3">No. Keahlian</th>
                                    <th className="px-4 py-3">Peranan</th>
                                    <th className="px-4 py-3">Kategori</th>
                                    <th className="px-4 py-3">Unit</th>
                                    <th className="px-4 py-3">Makanan</th>
                                    <th className="px-4 py-3">Kesihatan</th>
                                    <th className="px-4 py-3 text-right">Tindakan</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredData.map((item, i) => {
                                    const isLocked = !canModifyRecord(item);
                                    const isMigrated = item.remarks && typeof item.remarks === 'string' && item.remarks.includes('MIGRASI');
                                    const isEditing = editingRow === i;
                                    
                                    if (isEditing) {
                                      return (
                                        <tr key={i} className="bg-blue-50">
                                          <td className="px-3 py-2"></td>
                                          <td className="px-4 py-2"><input className="w-full p-1 border rounded text-xs uppercase" value={editFormData.name} onChange={e => setEditFormData(p => ({...p, name: e.target.value}))} /></td>
                                          <td className="px-4 py-2"><input className="w-full p-1 border rounded text-xs font-mono" value={editFormData.icNumber} onChange={e => setEditFormData(p => ({...p, icNumber: e.target.value}))} /></td>
                                          <td className="px-4 py-2">
                                            <select className="w-full p-1 border rounded text-xs" value={editFormData.race} onChange={e => setEditFormData(p => ({...p, race: e.target.value}))}>
                                              <option value="">-</option>
                                              <option value="MELAYU">Melayu</option>
                                              <option value="CINA">Cina</option>
                                              <option value="INDIA">India</option>
                                              <option value="LAIN-LAIN">Lain-lain</option>
                                            </select>
                                          </td>
                                          <td className="px-4 py-2"><input className="w-full p-1 border rounded text-xs uppercase font-mono" value={editFormData.membershipId} onChange={e => setEditFormData(p => ({...p, membershipId: e.target.value}))} /></td>
                                          <td className="px-4 py-2">
                                            <select className="w-full p-1 border rounded text-xs" value={editFormData.role} onChange={e => setEditFormData(p => ({...p, role: e.target.value}))}>
                                              <option value="PESERTA">Peserta</option>
                                              <option value="PEMIMPIN">Pemimpin</option>
                                              <option value="PENOLONG PEMIMPIN">Penolong Pemimpin</option>
                                              <option value="PENGUJI">Penguji</option>
                                              <option value="PENERIMA RAMBU">Penerima Rambu</option>
                                            </select>
                                          </td>
                                          <td className="px-4 py-2">
                                            <select className="w-full p-1 border rounded text-xs" value={editFormData.category} onChange={e => setEditFormData(p => ({...p, category: e.target.value}))}>
                                              <option value="">-</option>
                                              <option value="Pengakap Kanak-kanak">Pengakap Kanak-kanak</option>
                                              <option value="Pengakap Muda">Pengakap Muda</option>
                                              <option value="Pengakap Remaja">Pengakap Remaja</option>
                                              <option value="Kelana">Kelana</option>
                                            </select>
                                          </td>
                                          <td className="px-4 py-2">
                                            <select className="w-full p-1 border rounded text-xs" value={editFormData.unit} onChange={e => setEditFormData(p => ({...p, unit: e.target.value}))}>
                                              <option value="">-</option>
                                              <option value="Perdana">Perdana</option>
                                              <option value="Udara">Udara</option>
                                              <option value="Laut">Laut</option>
                                              <option value="PPKI">PPKI</option>
                                              <option value="PPKI Udara">PPKI Udara</option>
                                            </select>
                                          </td>
                                          <td className="px-4 py-2">
                                            <select className="w-full p-1 border rounded text-xs" value={editFormData.makanan} onChange={e => setEditFormData(p => ({...p, makanan: e.target.value}))}>
                                              <option value="">-</option>
                                              <option value="Biasa">Biasa</option>
                                              <option value="Vegetarian">Vegetarian</option>
                                            </select>
                                          </td>
                                          <td className="px-4 py-2">
                                            <select className="w-full p-1 border rounded text-xs" value={editFormData.masalahKesihatan} onChange={e => setEditFormData(p => ({...p, masalahKesihatan: e.target.value, masalahKesihatanLain: e.target.value !== 'Lain-lain' ? '' : editFormData.masalahKesihatanLain}))}>
                                              <option value="">-</option>
                                              <option value="Tiada">Tiada</option>
                                              <option value="Alahan">Alahan</option>
                                              <option value="Asma">Asma</option>
                                              <option value="Gastrik">Gastrik</option>
                                              <option value="Penyakit Jantung">Penyakit Jantung</option>
                                              <option value="Migrain">Migrain</option>
                                              <option value="Penyakit Kronik">Penyakit Kronik</option>
                                              <option value="Lain-lain">Lain-lain</option>
                                            </select>
                                            {editFormData.masalahKesihatan === 'Lain-lain' && (
                                              <input className="w-full p-1 border rounded text-xs mt-1" placeholder="Nyatakan..." value={editFormData.masalahKesihatanLain} onChange={e => setEditFormData(p => ({...p, masalahKesihatanLain: e.target.value}))} />
                                            )}
                                          </td>
                                          <td className="px-4 py-2 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                              <button onClick={() => handleSaveEdit(item)} disabled={savingEdit} className="bg-green-600 text-white p-1.5 rounded text-xs"><Save size={12}/></button>
                                              <button onClick={() => setEditingRow(null)} className="bg-gray-300 text-gray-700 p-1.5 rounded text-xs"><X size={12}/></button>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    }
                                    
                                    return (
                                    <tr key={i} className={`hover:bg-slate-50 transition ${isLocked ? 'bg-slate-50/50' : ''} ${selectedForDelete.has(i) ? 'bg-red-50' : ''}`}>
                                        <td className="px-3 py-3">
                                          <input type="checkbox" checked={selectedForDelete.has(i)} onChange={() => toggleSelectForDelete(i)} disabled={isLocked} className="rounded" />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-bold text-slate-900 uppercase text-xs sm:text-sm">{item.student}</div>
                                            <div className="text-[10px] text-slate-500">{item.gender}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-mono text-xs text-slate-700">{item.icNumber || '-'}</div>
                                            <div className="flex items-center gap-1 mt-1">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.badge.includes('Emas') ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-200 text-gray-700'}`}>{item.badge}</span>
                                                {isLocked && <Lock size={10} className="text-gray-400"/>}
                                                {isMigrated && <span className="text-[9px] bg-blue-50 text-blue-600 px-1 border border-blue-100 rounded">MIGRASI</span>}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-600">{item.race || '-'}</td>
                                        <td className="px-4 py-3">
                                            {editingId === item.rowIndex ? (
                                                <div className="flex items-center gap-1">
                                                    <input autoFocus className="w-24 p-1 border rounded uppercase text-xs" value={tempIdValue} onChange={(e) => setTempIdValue(e.target.value)} placeholder="ID"/>
                                                    <button onClick={() => handleSaveId(item)} disabled={savingId} className="bg-green-600 text-white p-1 rounded"><Save size={14}/></button>
                                                    <button onClick={() => setEditingId(null)} className="bg-gray-300 text-gray-700 p-1 rounded"><X size={14}/></button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 group">
                                                    <span className={`font-mono font-bold text-xs ${item.id ? 'text-slate-800' : 'text-red-400 italic'}`}>{item.id || 'TIADA ID'}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-xs font-semibold uppercase">{item.role || 'Peserta'}</td>
                                        <td className="px-4 py-3 text-xs text-slate-600">{item.category || '-'}</td>
                                        <td className="px-4 py-3 text-xs text-slate-600">{item.unit || '-'}</td>
                                        <td className="px-4 py-3 text-xs text-slate-600">{item.makanan || '-'}</td>
                                        <td className="px-4 py-3 text-xs text-slate-600">{item.masalahKesihatan === 'Lain-lain' ? `Lain-lain: ${item.masalahKesihatanLain || ''}` : (item.masalahKesihatan || '-')}</td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                              {canModifyRecord(item) && !isMigrated && (
                                                <>
                                                  <button
                                                    onClick={() => { if (item.personId) setFloatModalStudent({ personId: item.personId, studentName: item.student }); }}
                                                    className="p-1.5 rounded text-amber-500 hover:bg-amber-50"
                                                    title="Apungkan Murid"
                                                  >
                                                    <MapPin size={14} />
                                                  </button>
                                                  <button onClick={() => handleEditRow(item, i)} className="p-1.5 rounded text-blue-600 hover:bg-blue-50" title="Edit"><Edit2 size={14} /></button>
                                                </>
                                              )}
                                              <button onClick={() => onDelete(item)} disabled={!canModifyRecord(item) || isMigrated} className={`p-1.5 rounded ${canModifyRecord(item) && !isMigrated ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' : 'text-gray-200 cursor-not-allowed'}`}><Trash2 size={14} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                )})}
                                {filteredData.length === 0 && <tr><td colSpan={11} className="px-6 py-8 text-center text-gray-400 italic text-xs">Tiada rekod.</td></tr>}
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

                        {/* SUBMITTED / APPROVED STATUS */}
                        {isRegistrationOpen && isSelectedBadgeLocked && !isSelectedBadgeApproved && (
                            <div className="bg-yellow-100 text-yellow-800 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 border border-yellow-200 select-none">
                                <Clock size={16} /> {selectedBadgeFilter} Telah Dihantar
                            </div>
                        )}
                        {isRegistrationOpen && isSelectedBadgeApproved && (
                            <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 border border-green-200 select-none">
                                <CheckCircle size={16} /> {selectedBadgeFilter} Telah Disahkan
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
            <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-4xl relative border-2 border-indigo-500 max-h-[90vh] overflow-y-auto">
                <button onClick={() => setShowImportModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={20} /></button>
                <h3 className="font-bold text-lg mb-4 flex gap-2 items-center text-indigo-700 border-b pb-2"><ArrowDownToLine className="text-indigo-600" /> Import Naik Program ({selectedYear})</h3>
                
                <div className="bg-indigo-50 p-4 rounded-lg mb-4 text-sm border border-indigo-100 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <div className="font-bold text-gray-700 text-xs uppercase mb-1">Tahun Asal</div>
                        <select className="bg-white border rounded px-2 py-1.5 text-gray-700 w-full text-xs font-bold" value={importSourceYear} onChange={(e) => { setImportSourceYear(parseInt(e.target.value)); setSelectedImportCandidates([]); setImportNewIds({}); }}>
                            {availableYears.filter(y => y < selectedYear).map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div>
                        <div className="font-bold text-gray-700 text-xs uppercase mb-1">Peranan</div>
                        <select className="bg-white border rounded px-2 py-1.5 text-gray-700 w-full text-xs font-bold" value={importRole} onChange={(e) => { setImportRole(e.target.value as any); setSelectedImportCandidates([]); setImportNewIds({}); }}>
                            <option value="PESERTA">Peserta</option>
                            <option value="PEMIMPIN">Pemimpin</option>
                            <option value="PENOLONG PEMIMPIN">Penolong Pemimpin</option>
                            <option value="PENGUJI">Penguji</option>
                        </select>
                    </div>
                    <div>
                        <div className="font-bold text-gray-700 text-xs uppercase mb-1">Program / Program Asal</div>
                        <select className="bg-white border rounded px-2 py-1.5 text-gray-700 w-full text-xs" value={importSourceBadge} onChange={(e) => { setImportSourceBadge(e.target.value); setSelectedImportCandidates([]); setImportNewIds({}); }}>
                            <option value="">-- Pilih --</option>
                            <option value="Keris Gangsa">Keris Gangsa</option>
                            <option value="Keris Perak">Keris Perak</option>
                            <option value="Usaha">Usaha</option>
                            <option value="Maju">Maju</option>
                        </select>
                    </div>
                    <div>
                        <div className="font-bold text-gray-700 text-xs uppercase mb-1">Program / Program Target</div>
                        <div className="bg-white border rounded px-3 py-2 text-gray-700 text-xs uppercase font-bold">{getImportTargetBadge(importSourceBadge) || '-'}</div>
                    </div>
                    {importTargetSiriEnabled && (
                    <div>
                        <div className="font-bold text-gray-700 text-xs uppercase mb-1">Siri Sasaran</div>
                        <select className="bg-white border rounded px-2 py-1.5 text-gray-700 w-full text-xs font-bold" value={importTargetSiri} onChange={(e) => setImportTargetSiri(Number(e.target.value))}>
                            {Array.from({ length: importTargetSiriSetting?.maxSiri || 5 }, (_, i) => i + 1).map(s => <option key={s} value={s}>Siri {s}</option>)}
                        </select>
                    </div>
                    )}
                </div>

                <p className="text-xs text-gray-500 italic mb-3">Import dilakukan mengikut <b>satu peranan</b> setiap kali. Untuk bawa masuk peranan lain (cth Pemimpin/Penguji), ulang proses ini & tukar pilihan <b>Peranan</b>.</p>

                {importSourceBadge && (
                    <div className="max-h-96 overflow-y-auto border rounded-lg mb-4">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 uppercase text-xs text-gray-600 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 text-center w-10"><input type="checkbox" onChange={(e) => { if (e.target.checked) setSelectedImportCandidates(importCandidates.map(c => String(c.participantId))); else setSelectedImportCandidates([]); }} checked={importCandidates.length > 0 && selectedImportCandidates.length === importCandidates.length}/></th>
                                    <th className="px-4 py-2">Nama</th>
                                    <th className="px-4 py-2 text-center">No. KP</th>
                                    <th className="px-4 py-2 text-center">ID Lama</th>
                                    <th className="px-4 py-2 text-center min-w-[180px]">ID Keahlian Baru</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {importCandidates.map((c, i) => {
                                    const key = String(c.participantId || '');
                                    const selected = selectedImportCandidates.includes(key);
                                    return (
                                    <tr key={key || i} className="hover:bg-indigo-50/50">
                                        <td className="px-4 py-2 text-center"><input type="checkbox" checked={selected} onChange={(e) => { if(e.target.checked) setSelectedImportCandidates(prev => [...prev, key]); else setSelectedImportCandidates(prev => prev.filter(k => k !== key)); }} className="w-4 h-4 text-indigo-600 rounded"/></td>
                                        <td className="px-4 py-2 font-bold text-gray-800 uppercase">{c.student}</td>
                                        <td className="px-4 py-2 text-center font-mono">{c.icNumber || <span className="text-gray-400 italic text-xs">tiada (tidak wajib)</span>}</td>
                                        <td className="px-4 py-2 text-center font-mono text-gray-500">{c.id || '-'}</td>
                                        <td className="px-4 py-2"><input disabled={!selected} value={importNewIds[key] || ''} onChange={(e) => setImportNewIds(prev => ({ ...prev, [key]: e.target.value.toUpperCase() }))} placeholder="No Kad Keahlian (wajib)" className="w-full p-2 border rounded text-xs font-mono disabled:bg-gray-100" /></td>
                                    </tr>
                                )})}
                                {importCandidates.length === 0 && <tr><td colSpan={5} className="text-center py-4 text-gray-400 italic">Tiada calon.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="flex justify-end gap-2 pt-2 border-t">
                    <button onClick={() => setShowImportModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-bold text-sm">Batal</button>
                    <button onClick={handleSubmitImport} disabled={isSubmittingImport || selectedImportCandidates.length === 0} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-indigo-700 shadow flex items-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed">{isSubmittingImport ? <LoadingSpinner size="sm" color="border-white"/> : <CheckCircle size={16}/>} Import Naik ({selectedImportCandidates.length})</button>
                </div>
            </div>
          </div>
      )}

       {showBulkImportModal && (
           <BulkImportModal
             scriptUrl={scriptUrl}
             schoolName={user.schoolName}
             schoolCode={user.schoolCode}
             badges={scopedBadges}
             currentYear={selectedYear}
             existingData={allData}
             onClose={() => setShowBulkImportModal(false)}
             onSuccess={onRefresh}
           />
       )}

      {floatModalStudent && (
        <FloatStudentModal
          studentName={floatModalStudent.studentName}
          personId={floatModalStudent.personId}
          schoolCode={user.schoolCode}
          schools={schools}
          onClose={() => setFloatModalStudent(null)}
          onFloated={() => { setFloatModalStudent(null); onRefresh(); }}
        />
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
                }
              );
              
              if (result.status === 'success') {
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
          onChangePassword={() => {
            setShowProfileModal(false);
            setShowPasswordModal(true);
          }}
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