import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Settings, ArrowLeft, Database, School, Link as LinkIcon, Lock, AlertTriangle, ChevronLeft, ChevronRight, Medal, RefreshCw, ToggleLeft, ToggleRight, ArrowLeftRight, Menu, LayoutDashboard, LogOut, Key, History, Shield, Briefcase, Trash2, Users, Download, FileSpreadsheet, FileJson, X, BarChart3, ScanLine, CheckCircle, FileText, Eye, Image, Upload, User, MapPin, Wallet } from 'lucide-react';
import { AdminDashboard } from './AdminDashboard';
import { AdminSchools } from './AdminSchools';
import { AdminBadges } from './AdminBadges'; 
import { AdminMigration } from './AdminMigration'; 
import { AdminHistory } from './AdminHistory';
import { AdminDataAudit } from './AdminDataAudit';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { PengesahanTab } from './PengesahanTab';
import { AdminPaymentsTab } from './AdminPaymentsTab';
import { SubmissionData, Badge, School as SchoolType, UserProfile } from '../types';
import { APP_VERSION, LOCAL_STORAGE_KEYS, DEFAULT_SERVER_URL, LOGO_URL } from '../constants';
import { toggleRegistration, setupDatabase, clearDatabaseSheet, changeAdminPassword, changeAdminRegionalPassword, recordAttendanceVerification, getAttendanceVerifications, deleteAttendanceVerification, approveSchoolBadge, reopenSchoolBadge, getSubmittedSchools, getProgramSettings, ProgramSetting } from '../services/supabaseApi';
import { QRAttendanceScanner } from './ui/QRVerification';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { uploadLogo, getLogoUrl } from '../services/logoService';
import { WithdrawalScanner } from './WithdrawalScanner';
import { WithdrawalsList } from './WithdrawalsList';
import { CoursesAdminPanel } from './courses/admin/CoursesAdminPanel';
import { FloatedStudentsTab } from './FloatedStudentsTab';

interface AdminDaerahPanelProps {
  daerahCode: string;
  daerahName: string;
  negeriCode: string;
  adminSession: { username: string; role: string; fullName?: string; negeriCode?: string; daerahCode?: string };
  onBack: () => void;
  scriptUrl: string;
  setScriptUrl: (url: string) => void;
  data: SubmissionData[];
  schools: SchoolType[];
  badges: Badge[]; 
  userProfiles?: UserProfile[];
  isRegistrationOpen: boolean; 
  refreshData: () => void;
  deleteData: (item: SubmissionData) => void;
}

export const AdminDaerahPanel: React.FC<AdminDaerahPanelProps> = ({ 
  daerahCode, daerahName, negeriCode, adminSession, onBack, scriptUrl, setScriptUrl, data, schools, badges, userProfiles = [], isRegistrationOpen, refreshData, deleteData 
}) => {
  const [tab, setTab] = useState<'dashboard' | 'analytics' | 'schools' | 'badges' | 'pengesahan' | 'bayaran' | 'history' | 'audit' | 'attendance' | 'withdrawals' | 'courses' | 'profile'>('dashboard');
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [deletingAttendanceId, setDeletingAttendanceId] = useState<string | null>(null);
  const [selectedAttendanceBadgeId, setSelectedAttendanceBadgeId] = useState<string>('');
  const [selectedAttendanceSiri, setSelectedAttendanceSiri] = useState<number | ''>('');
  const [attendanceScanSiri, setAttendanceScanSiri] = useState(1);
  const [programSettings, setProgramSettings] = useState<ProgramSetting[]>([]);
  useEffect(() => { getProgramSettings(new Date().getFullYear()).then(setProgramSettings); }, []);
  const [registeredSchools, setRegisteredSchools] = useState<any[]>([]);
  const [daerahLogoUrl, setDaerahLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  // Filter badges for attendance dropdown based on admin scope
  const attendanceBadges = useMemo(() => {
    return badges.filter((b: any) => {
      const scope = b.scope || 'daerah';
      if (scope === 'daerah') return !b.daerahCode || b.daerahCode === daerahCode;
      return false; // District admin only sees district-scoped badges
    });
  }, [badges, daerahCode]);

  const scanTargetMaxSiri = useMemo(() => {
    const badge = attendanceBadges.find((b: any) => b.id === selectedAttendanceBadgeId);
    const s = programSettings.find(p => p.badgeName === badge?.name && p.siriEnabled);
    return s?.maxSiri || 5;
  }, [attendanceBadges, selectedAttendanceBadgeId, programSettings]);
  useEffect(() => { if (attendanceScanSiri > scanTargetMaxSiri) setAttendanceScanSiri(1); }, [scanTargetMaxSiri]);

  const loadAttendanceRecords = useCallback(async () => {
    setAttendanceLoading(true);
    try {
      const records = await getAttendanceVerifications(new Date().getFullYear(), daerahCode, undefined, selectedAttendanceBadgeId || undefined);
      setAttendanceRecords(records);
    } catch (e) {
      console.error('Failed to load attendance:', e);
    } finally {
      setAttendanceLoading(false);
    }
  }, [daerahCode, selectedAttendanceBadgeId]);

  // Load registered schools for selected badge (from school_badge_status)
  useEffect(() => {
    if (!selectedAttendanceBadgeId) {
      setRegisteredSchools([]);
      return;
    }
    (async () => {
      try {
        const { supabase } = await import('../services/supabaseClient');
        const { data, error } = await supabase
          .from('school_badge_status')
          .select('school_id, status, school:school_id(id, name, school_code, negeri:negeri_id(code), daerah:daerah_id(code))')
          .eq('badge_id', selectedAttendanceBadgeId)
          .eq('year', new Date().getFullYear())
          .in('status', ['submitted', 'approved', 'locked', 'reopened']);
        if (error) throw error;
        // Filter by daerah
        const filtered = (data || []).filter((r: any) => r.school?.daerah?.code === daerahCode);
        setRegisteredSchools(filtered);
      } catch (e) {
        console.error('Failed to load registered schools:', e);
        setRegisteredSchools([]);
      }
    })();
  }, [selectedAttendanceBadgeId, daerahCode]);

  useEffect(() => {
    if (tab === 'attendance') loadAttendanceRecords();
  }, [tab, loadAttendanceRecords]);

  // Siri yang wujud dalam rekod kehadiran bagi program dipilih — kawal keterlihatan penapis Siri.
  const availableAttendanceSiris = useMemo(() => {
    const set = new Set<number>();
    attendanceRecords.forEach((r: any) => set.add(r.siri || 1));
    return Array.from(set).sort((a, b) => a - b);
  }, [attendanceRecords]);

  const attendanceRecordsFiltered = useMemo(() => {
    if (selectedAttendanceSiri === '') return attendanceRecords;
    return attendanceRecords.filter((r: any) => (r.siri || 1) === selectedAttendanceSiri);
  }, [attendanceRecords, selectedAttendanceSiri]);

  // Calculate attendance statistics
  const attendanceStats = useMemo(() => {
    if (!selectedAttendanceBadgeId) {
      return { scanned: 0, notScanned: 0, total: 0, percentage: 0, totalParticipants: 0, scannedSchools: [], notScannedSchools: [] };
    }
    const scannedSchoolIds = new Set(attendanceRecordsFiltered.map((r: any) => r.school?.school_code).filter(Boolean));
    const registeredSchoolList = registeredSchools.map((r: any) => ({
      id: r.school.id,
      code: r.school.school_code,
      name: r.school.name,
    }));
    const scannedSchools = registeredSchoolList.filter((s: any) => scannedSchoolIds.has(s.code));
    const notScannedSchools = registeredSchoolList.filter((s: any) => !scannedSchoolIds.has(s.code));
    const total = registeredSchoolList.length;
    const scanned = scannedSchools.length;
    const totalParticipants = attendanceRecordsFiltered.reduce((sum, r) => sum + (r.participant_count || 0), 0);
    const percentage = total > 0 ? Math.round((scanned / total) * 100) : 0;
    return {
      scanned,
      notScanned: notScannedSchools.length,
      total,
      percentage,
      totalParticipants,
      scannedSchools,
      notScannedSchools,
    };
  }, [attendanceRecordsFiltered, registeredSchools, selectedAttendanceBadgeId]);

  // Load daerah logo on mount
  useEffect(() => {
    getLogoUrl('daerah', daerahCode).then(url => setDaerahLogoUrl(url));
  }, [daerahCode]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Sila pilih fail imej sahaja (PNG, JPG, dll).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('Saiz fail melebihi 2MB. Sila pilih fail yang lebih kecil.');
      return;
    }
    setLogoUploading(true);
    try {
      const url = await uploadLogo(file, 'daerah', daerahCode);
      setDaerahLogoUrl(url);
      alert('Logo daerah berjaya dimuat naik!');
    } catch (err: any) {
      alert('Gagal muat naik logo: ' + (err.message || 'Ralat tidak diketahui'));
    } finally {
      setLogoUploading(false);
    }
  };

  const handleDeleteAttendance = async (record: any) => {
    const schoolName = record.school?.name || 'sekolah ini';
    const badgeName = record.badge?.name || 'program ini';
    if (!confirm(`Padam pengesahan kehadiran untuk ${schoolName} (${badgeName})?\n\nSelepas dipadam, QR boleh discan semula.`)) return;
    setDeletingAttendanceId(record.id);
    try {
      const res = await deleteAttendanceVerification(record.id);
      if (res.status === 'success') {
        await loadAttendanceRecords();
      } else {
        alert('Gagal padam: ' + (res.message || 'Ralat tidak diketahui'));
      }
    } catch (e) {
      alert('Ralat sambungan. Gagal padam rekod kehadiran.');
    } finally {
      setDeletingAttendanceId(null);
    }
  };

  const filteredData = useMemo(() => data.filter(d => d.daerahCode === daerahCode), [data, daerahCode]);
  const filteredSchools = useMemo(() => schools.filter(s => s.daerahCode === daerahCode), [schools, daerahCode]);

  // Senarai badge yang readonly untuk admin daerah:
  // - Program scope=negeri yang TIDAK perlu pengesahan daerah (terus ke negeri)
  // - Program scope=negeri yang dah disahkan daerah (sebab dah komit, jangan ubah)
  // Untuk program scope=negeri yang requiresDaerahApproval=true DAN belum disahkan,
  // daerah boleh edit data peserta
  const readOnlyBadges = new Set(
    badges
      .filter(b => (b.scope || 'daerah') === 'negeri' && !b.requiresDaerahApproval)
      .map(b => b.name)
  );

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem(LOCAL_STORAGE_KEYS.SCRIPT_URL, scriptUrl.trim());
    alert("Tetapan disimpan. Halaman akan dimuat semula.");
    window.location.reload(); 
  };

  const handleResetUrl = () => {
      if(confirm("Adakah anda pasti mahu menggunakan URL asal (Default) dari kod?")) {
          setScriptUrl(DEFAULT_SERVER_URL);
          localStorage.removeItem(LOCAL_STORAGE_KEYS.SCRIPT_URL);
          alert("URL telah di-reset kepada default. Sila tekan Simpan Tetapan.");
      }
  };

  const handleToggleRegistration = async () => {
    setTogglingStatus(true);
    try {
        const newStatus = !isRegistrationOpen;
        await toggleRegistration(scriptUrl, newStatus);
        refreshData();
    } catch (e) {
        alert("Gagal menukar status pendaftaran.");
    } finally {
        setTogglingStatus(false);
    }
  };

  const handleSetupDatabase = async () => {
    if(!confirm("Adakah anda pasti? Ini akan mencipta Sheet 'DATA', 'SCHOOLS', 'BADGES' jika belum wujud dalam Google Sheet.")) return;
    setSetupLoading(true);
    try {
        const res = await setupDatabase(scriptUrl);
        if(res.status === 'success') {
            alert("Struktur Database berjaya dijana! Sila refresh.");
            refreshData();
        } else {
             if (res.message && (res.message.toLowerCase().includes('invalid action') || res.message.toLowerCase().includes('action tidak sah'))) {
                   alert("RALAT VERSI:\n\nSistem Backend (Google Apps Script) anda adalah versi LAMA.\nSila kemaskini kod AppScript anda.");
            } else {
                   alert("Ralat: " + res.message);
            }
        }
    } catch(e) {
        alert("Ralat sambungan. Pastikan URL betul.");
    } finally {
        setSetupLoading(false);
    }
  };

  const handleClearData = async (target: string, label: string) => {
      const confirmation = confirm(`AMARAN KERAS:\n\nAnda pasti mahu memadamkan SEMUA data dalam '${label}'?\n\nTindakan ini akan memadam rekod secara kekal dan tidak boleh diundur!`);
      if (!confirmation) return;

      const code = prompt(`Untuk pengesahan akhir, sila taip "PADAM" (huruf besar) untuk memadam ${label}.`);
      if (code !== "PADAM") {
          alert("Tindakan dibatalkan. Kod pengesahan salah.");
          return;
      }

      setSetupLoading(true);
      try {
          const res = await clearDatabaseSheet(scriptUrl, target);
          if (res.status === 'success') {
              alert(`Berjaya! Data ${label} telah dikosongkan.`);
              refreshData();
          } else {
              // Check for "Invalid Action" or similar errors indicating backend is outdated
              if (res.message && (res.message.toLowerCase().includes('invalid action') || res.message.toLowerCase().includes('action tidak sah'))) {
                   alert("RALAT VERSI:\n\nSistem Backend (Google Apps Script) anda adalah versi LAMA.\nFungsi 'Reset Data' ini memerlukan kod AppScript yang terkini.\n\nSila copy kod baru yang diberikan dan lakukan 'New Deployment' di Google Apps Script.");
              } else {
                   alert("Gagal: " + res.message);
              }
          }
      } catch (e) {
          alert("Ralat server. Gagal memadam data.");
      } finally {
          setSetupLoading(false);
      }
  };

  const handleExport = (type: 'DATA' | 'SCHOOLS' | 'BADGES', format: 'xlsx' | 'json') => {
      let exportData: any[] = [];
      let fileName = `BACKUP_${type}_${new Date().toISOString().split('T')[0]}`;
      const timestamp = new Date().toLocaleString();

      if (type === 'DATA') {
          // Export only filtered data for this daerah
          exportData = filteredData.map(d => ({
              ...d,
              _backupDate: timestamp
          }));
      } else if (type === 'SCHOOLS') {
          exportData = filteredSchools.map(s => ({
              ...s,
              lockedBadges: s.lockedBadges ? s.lockedBadges.join(', ') : '',
              approvedBadges: s.approvedBadges ? s.approvedBadges.join(', ') : '',
              _backupDate: timestamp
          }));
      } else if (type === 'BADGES') {
          exportData = badges;
      }

      if (exportData.length === 0) {
          alert(`Tiada data ${type} untuk dieksport.`);
          return;
      }

      if (format === 'json') {
          const jsonString = JSON.stringify(exportData, null, 2);
          const blob = new Blob([jsonString], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${fileName}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      } else {
          // Excel Export
          const XLSX = (window as any).XLSX;
          if (!XLSX) {
              alert("Library Excel sedang dimuatkan. Sila cuba sebentar lagi.");
              return;
          }
          const ws = XLSX.utils.json_to_sheet(exportData);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
          XLSX.writeFile(wb, `${fileName}.xlsx`);
      }
  };

  const handleChangeAdminPassword = async () => {
    if (!newAdminPassword || !confirmAdminPassword) {
        alert("Sila isi kedua-dua ruangan kata laluan.");
        return;
    }
    if (newAdminPassword !== confirmAdminPassword) {
        alert("Kata laluan dan pengesahan kata laluan tidak sama.");
        return;
    }
    if (newAdminPassword.length < 6) {
        alert("Kata laluan mesti sekurang-kurangnya 6 aksara.");
        return;
    }
    if (!/[A-Z]/.test(newAdminPassword) || !/[a-z]/.test(newAdminPassword) || !/\d/.test(newAdminPassword)) {
        alert("Kata laluan mesti mengandungi huruf besar, huruf kecil, dan nombor.");
        return;
    }

    setPasswordLoading(true);
    try {
        const res = await changeAdminRegionalPassword(scriptUrl, adminSession.username, 'daerah', newAdminPassword);
        if (res.status === 'success') {
            alert(`Berjaya! Kata laluan untuk ADMIN DAERAH telah ditukar.\n\nSila log masuk semula.`);
            onBack(); // Logout
        } else {
            alert("Gagal: " + res.message);
        }
    } catch (e) {
        alert("Ralat sambungan server.");
    } finally {
        setPasswordLoading(false);
        setNewAdminPassword('');
        setConfirmAdminPassword('');
        setShowPasswordModal(false);
    }
  };

  const menuItems = [
    { id: 'dashboard', label: 'Rumusan Data', icon: LayoutDashboard, allowed: true },
    { id: 'analytics', label: 'Analitik', icon: BarChart3, allowed: true },
    { id: 'schools', label: 'Urus Sekolah', icon: School, allowed: true },
    { id: 'badges', label: 'Urus Program', icon: Medal, allowed: true },
    { id: 'pengesahan', label: 'Pengesahan', icon: CheckCircle, allowed: true },
    { id: 'bayaran', label: 'Rumusan Bayaran', icon: Wallet, allowed: true },
    { id: 'attendance', label: 'Kehadiran', icon: ScanLine, allowed: true },
    { id: 'withdrawals', label: 'Status Peserta', icon: AlertTriangle, allowed: true },
    { id: 'floated', label: 'Murid Terapung', icon: MapPin, allowed: true },
    { id: 'courses', label: 'Kursus Pemimpin', icon: Users, allowed: true },
    { id: 'history', label: 'Semakan Rekod', icon: History, allowed: true },
    { id: 'audit', label: 'Audit Data', icon: AlertTriangle, allowed: true },
    { id: 'profile', label: 'Profil', icon: User, allowed: true },
  ];

  const SidebarItem = ({ icon: Icon, label, badge, onClick, isActive, className }: any) => (
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
        <div className="relative">
          <Icon size={18} className="shrink-0" />
          {badge > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </div>
        <span className={`${!isDesktopSidebarOpen ? 'md:hidden' : 'block'} whitespace-nowrap`}>
            {label}
        </span>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col md:flex-row print:bg-white">
      
      {/* MOBILE HEADER */}
      <div className="md:hidden text-white p-4 flex justify-between items-center shadow-md print:hidden sticky top-0 z-50 border-b-2 border-amber-600" style={{ background: '#07012C' }}>
          <div className="flex items-center gap-2">
              <Settings size={20} className="text-amber-500" />
              <div className="text-sm font-bold">Admin Daerah - {daerahName}</div>
          </div>
          <button onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)} className="p-2 hover:bg-slate-800 rounded">
              <Menu size={24} />
          </button>
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
                >
                    {isDesktopSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
                </button>
          </div>

          <div className="p-6 border-b border-slate-800 flex flex-col items-center text-center overflow-hidden bg-gradient-to-b from-slate-900 to-slate-800">
              <img src={daerahLogoUrl || LOGO_URL} alt="Logo" className="h-14 w-auto mb-3 drop-shadow-md" />
              {isDesktopSidebarOpen && (
                  <div className="animate-[fadeIn_0.2s_ease-out]">
                    <h2 className="font-bold text-white text-lg tracking-tight">Panel Admin Daerah</h2>
                    <p className="text-[10px] font-mono mt-1 tracking-wider uppercase px-2 py-0.5 rounded bg-green-500/20 text-green-300">
                        {daerahName}
                    </p>
                  </div>
              )}
          </div>

          <div className="p-4 space-y-1 overflow-y-auto flex-1">
              {menuItems.filter(i => i.allowed).map((item) => (
                  <SidebarItem 
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    badge={0}
                    isActive={tab === item.id}
                    onClick={() => { setTab(item.id as any); setIsMobileSidebarOpen(false); }}
                  />
              ))}
          </div>

          <div className="p-4 border-t border-slate-800 bg-slate-900">
              <SidebarItem 
                icon={LogOut} 
                label="Log Keluar" 
                className="text-red-400 hover:bg-red-900/20 hover:text-red-300 mt-auto border border-transparent hover:border-red-900/30"
                onClick={onBack} 
              />
          </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-hidden flex flex-col h-screen overflow-y-auto bg-slate-50">
        
        {/* TOP BAR / HEADER */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-40 shadow-sm print:hidden">
            <div>
                <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    {menuItems.find(i => i.id === tab)?.label}
                </h1>
            </div>

            <div className="flex items-center gap-4">
                {/* Master Switch */}
                <div className="flex items-center gap-3 bg-gray-100 pl-3 pr-1.5 py-1 rounded-full border border-gray-200">
                    <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Status Sistem</span>
                    <button 
                        onClick={handleToggleRegistration}
                        disabled={togglingStatus}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold text-white transition-all shadow-sm ${isRegistrationOpen ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                        title="Suis Utama (Master Switch) untuk menutup keseluruhan sistem"
                    >
                        {togglingStatus ? <LoadingSpinner size="sm" color="border-white" /> : (isRegistrationOpen ? <ToggleRight size={16}/> : <ToggleLeft size={16}/>)}
                        {isRegistrationOpen ? 'DIBUKA' : 'DITUTUP'}
                    </button>
                </div>
            </div>
        </header>

        {/* CONTENT BODY */}
        <div className="p-4 md:p-8 max-w-[1600px] mx-auto w-full">
            {tab === 'schools' && (
              <div className="animate-[fadeIn_0.2s_ease-out] print:hidden">
                 <AdminSchools 
                   schools={filteredSchools} 
                   badges={badges}
                   scriptUrl={scriptUrl} 
                   negeriCode={negeriCode}
                    daerahCode={daerahCode}
                    enableResetClaim={true}
                    onRefresh={refreshData} 
                 />
              </div>
            )}
            
            {tab === 'badges' && (
              <div className="animate-[fadeIn_0.2s_ease-out] print:hidden">
                 <AdminBadges badges={badges} scriptUrl={scriptUrl} onRefresh={refreshData} scopeContext={{ type: 'daerah', daerahCode, label: `Daerah ${daerahName}` }} />
              </div>
            )}

            {tab === 'pengesahan' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                <PengesahanTab 
                  daerahCode={daerahCode}
                  scriptUrl={scriptUrl}
                  data={filteredData}
                  schools={filteredSchools}
                  badges={badges}
                  onRefresh={refreshData}
                />
              </div>
            )}

            {tab === 'bayaran' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                <AdminPaymentsTab />
              </div>
            )}

            {tab === 'history' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                  <AdminHistory data={filteredData} schools={filteredSchools} onRefresh={refreshData} />
              </div>
            )}

            {tab === 'courses' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                  <CoursesAdminPanel
                    adminScope="daerah"
                    adminNegeriCode={negeriCode}
                    adminDaerahCode={daerahCode}
                    adminUser={adminSession?.username || 'admin_daerah'}
                  />
              </div>
            )}

            {tab === 'audit' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                  <AdminDataAudit data={filteredData} schools={filteredSchools} />
              </div>
            )}

            {tab === 'dashboard' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                 <AdminDashboard data={filteredData} schools={filteredSchools} badges={badges} userProfiles={userProfiles} onRefresh={refreshData} onDelete={deleteData} readOnlyBadges={readOnlyBadges} />
              </div>
            )}

            {tab === 'analytics' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                  <AnalyticsDashboard allData={filteredData} badges={badges} />
              </div>
            )}

            {tab === 'attendance' && (
              <div className="animate-[fadeIn_0.2s_ease-out] space-y-6">
                {/* Header & Scanner Tools */}
                <div className="bg-white rounded-xl shadow p-6">
                  <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2 mb-4">
                    <ScanLine size={20} className="text-green-600" /> Pengesahan Kehadiran QR
                  </h2>
                  <p className="text-sm text-slate-500 mb-4">
                    Imbas QR code sekolah untuk mengesahkan kehadiran peserta dalam {daerahName}. Selepas scan, jumlah peserta berdaftar akan dipaparkan secara automatik.
                  </p>

                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-red-800">Kemaskini Status Peserta</p>
                      <p className="text-xs text-red-600 mt-1">Imbas QR peserta yang perlu pulang awal/tarik diri di tengah program.</p>
                    </div>
                    <WithdrawalScanner onWithdrawn={() => refreshData()} />
                  </div>

                  <div className="mb-3 flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-600 uppercase">Siri untuk scan seterusnya:</label>
                    <select
                      value={attendanceScanSiri}
                      onChange={(e) => setAttendanceScanSiri(Number(e.target.value))}
                      className="p-1.5 border border-slate-200 rounded text-xs font-bold text-purple-700 bg-purple-50"
                    >
                      {Array.from({ length: scanTargetMaxSiri }, (_, i) => i + 1).map(s => <option key={s} value={s}>Siri {s}</option>)}
                    </select>
                    <span className="text-[11px] text-slate-400">(kekalkan Siri 1 jika program tidak berperingkat)</span>
                  </div>

                  <QRAttendanceScanner
                    verifierName={adminSession.fullName || adminSession.username}
                    onVerified={async (record) => {
                      const res = await recordAttendanceVerification({
                        schoolCode: record.schoolCode,
                        badge: record.badge,
                        year: record.year,
                        participantCount: record.totalParticipants,
                        siri: attendanceScanSiri,
                      });
                      if (res.status !== 'success') alert('Gagal simpan kehadiran ke server: ' + (res.message || 'Ralat tidak diketahui'));
                      await loadAttendanceRecords();
                    }}
                  />
                </div>

                {/* Badge Filter with Full Statistics */}
                <div className="bg-white rounded-xl shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                      <BarChart3 size={18} className="text-indigo-600" /> Statistik Kehadiran Mengikut Program
                    </h3>
                    <button onClick={loadAttendanceRecords} disabled={attendanceLoading} className="text-blue-600 hover:bg-blue-50 p-2 rounded-full transition">
                      <RefreshCw size={14} className={attendanceLoading ? 'animate-spin' : ''} />
                    </button>
                  </div>

                  <div className="mb-6">
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Pilih Program/Badge</label>
                    <select
                      value={selectedAttendanceBadgeId}
                      onChange={(e) => { setSelectedAttendanceBadgeId(e.target.value); setSelectedAttendanceSiri(''); }}
                      className="w-full p-3 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">-- Sila Pilih Program --</option>
                      {attendanceBadges.map((b: any) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    {availableAttendanceSiris.length > 1 && (
                      <div className="mt-2">
                        <label className="block text-xs font-bold text-purple-600 uppercase mb-1">Penapis Siri</label>
                        <select
                          value={selectedAttendanceSiri}
                          onChange={(e) => setSelectedAttendanceSiri(e.target.value ? Number(e.target.value) : '')}
                          className="w-full p-2 border border-purple-200 rounded-lg text-sm bg-purple-50 text-purple-700 font-bold focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">Semua Siri</option>
                          {availableAttendanceSiris.map(s => <option key={s} value={s}>Siri {s}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  {selectedAttendanceBadgeId ? (
                    attendanceLoading ? (
                      <div className="text-center py-8">
                        <LoadingSpinner size="lg" color="border-indigo-500" />
                        <p className="text-xs text-slate-400 mt-3">Memuatkan statistik...</p>
                      </div>
                    ) : (
                      <div>
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                          <div className="bg-green-50 rounded-lg p-4 text-center border border-green-100">
                            <p className="text-2xl font-bold text-green-700">{attendanceStats.scanned}</p>
                            <p className="text-xs text-green-600 font-medium">Dah Scan</p>
                          </div>
                          <div className="bg-orange-50 rounded-lg p-4 text-center border border-orange-100">
                            <p className="text-2xl font-bold text-orange-700">{attendanceStats.notScanned}</p>
                            <p className="text-xs text-orange-600 font-medium">Belum Scan</p>
                          </div>
                          <div className="bg-indigo-50 rounded-lg p-4 text-center border border-indigo-100">
                            <p className="text-2xl font-bold text-indigo-700">{attendanceStats.percentage}%</p>
                            <p className="text-xs text-indigo-600 font-medium">Kemajuan</p>
                          </div>
                          <div className="bg-blue-50 rounded-lg p-4 text-center border border-blue-100">
                            <p className="text-2xl font-bold text-blue-700">{attendanceStats.totalParticipants}</p>
                            <p className="text-xs text-blue-600 font-medium">Jumlah Peserta</p>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mb-6">
                          <div className="flex justify-between text-xs text-slate-600 mb-1">
                            <span>Kemajuan Scan ({attendanceStats.scanned} / {attendanceStats.total} Sekolah)</span>
                            <span className="font-bold">{attendanceStats.percentage}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-green-500 to-indigo-600 h-3 rounded-full transition-all duration-500"
                              style={{ width: `${attendanceStats.percentage}%` }}
                            />
                          </div>
                        </div>

                        {/* Tab: Dah Scan / Belum Scan */}
                        <div className="border-b border-slate-200 mb-4">
                          <nav className="flex gap-6">
                            <button
                              className="py-2 px-1 border-b-2 border-green-500 text-green-700 font-bold text-sm flex items-center gap-2"
                              onClick={() => {
                                const el = document.getElementById('scanned-tab-daerah');
                                el?.scrollIntoView({ behavior: 'smooth' });
                              }}
                            >
                              <CheckCircle size={14} /> Dah Scan ({attendanceStats.scanned})
                            </button>
                            <button
                              className="py-2 px-1 border-b-2 border-orange-500 text-orange-700 font-bold text-sm flex items-center gap-2"
                              onClick={() => {
                                const el = document.getElementById('not-scanned-tab-daerah');
                                el?.scrollIntoView({ behavior: 'smooth' });
                              }}
                            >
                              <AlertTriangle size={14} /> Belum Scan ({attendanceStats.notScanned})
                            </button>
                          </nav>
                        </div>

                        {/* Dah Scan List */}
                        <div id="scanned-tab-daerah" className="mb-6">
                          <h4 className="text-xs font-bold text-slate-700 uppercase mb-3 flex items-center gap-2">
                            <CheckCircle size={12} className="text-green-500" /> Sekolah Yang Dah Scan
                          </h4>
                          {attendanceStats.scannedSchools.length === 0 ? (
                            <p className="text-xs text-slate-400 italic p-4 bg-slate-50 rounded">Belum ada sekolah yang telah scan kehadiran untuk program ini.</p>
                          ) : (
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                              {attendanceStats.scannedSchools.map((s: any, i: number) => {
                                const record = attendanceRecordsFiltered.find((r: any) => r.school?.school_code === s.code);
                                return (
                                  <div key={i} className="flex items-center justify-between bg-green-50 border border-green-100 rounded-lg px-4 py-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-bold text-slate-800 truncate">{s.name}</p>
                                      <p className="text-[10px] text-slate-500">
                                        <span className="font-mono">{s.code}</span> · <span className="text-green-700 font-bold">{record?.participant_count || 0} peserta</span>
                                        {(record?.siri || 1) > 1 && <span className="text-purple-600 font-bold"> · Siri {record.siri}</span>}
                                      </p>
                                    </div>
                                    <span className="text-[10px] text-green-600 font-mono">
                                      {record && new Date(record.verified_at).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Belum Scan List */}
                        <div id="not-scanned-tab-daerah">
                          <h4 className="text-xs font-bold text-slate-700 uppercase mb-3 flex items-center gap-2">
                            <AlertTriangle size={12} className="text-orange-500" /> Sekolah Yang Belum Scan
                          </h4>
                          {attendanceStats.notScannedSchools.length === 0 ? (
                            <p className="text-xs text-green-600 italic p-4 bg-green-50 rounded border border-green-100 font-bold">🎉 Semua sekolah telah scan kehadiran untuk program ini!</p>
                          ) : (
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                              {attendanceStats.notScannedSchools.map((s: any, i: number) => (
                                <div key={i} className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-lg px-4 py-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-slate-800 truncate">{s.name}</p>
                                    <p className="text-[10px] text-slate-500">
                                      <span className="font-mono">{s.code}</span>
                                    </p>
                                  </div>
                                  <span className="text-[10px] text-orange-600 font-bold">Belum Scan</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="text-center py-12">
                      <ScanLine size={48} className="mx-auto text-slate-200 mb-3" />
                      <p className="text-sm text-slate-400">Sila pilih program di atas untuk lihat statistik kehadiran penuh.</p>
                    </div>
                  )}
                </div>

                {/* Today's Records */}
                <div className="bg-white rounded-xl shadow p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <CheckCircle size={16} className="text-green-500" /> Senarai Scan Hari Ini
                    </h3>
                  </div>
                  {(() => {
                    const todayStr = new Date().toDateString();
                    const todayRecords = attendanceRecords.filter((r: any) => new Date(r.verified_at).toDateString() === todayStr);
                    if (attendanceLoading) return <p className="text-xs text-slate-400 italic">Memuatkan rekod...</p>;
                    if (todayRecords.length === 0) return <p className="text-xs text-slate-400 italic">Belum ada kehadiran disahkan hari ini.</p>;
                    return (
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {todayRecords.map((r: any, i: number) => (
                          <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2 gap-3">
                            <div>
                              <p className="text-xs font-bold text-slate-800">{r.school?.name || '-'}</p>
                              <p className="text-[10px] text-slate-500">{r.badge?.name || '-'}{(r.siri || 1) > 1 ? ` (Siri ${r.siri})` : ''} | {r.participant_count || 0} peserta</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-green-600 font-mono">
                                {new Date(r.verified_at).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <button
                                onClick={() => handleDeleteAttendance(r)}
                                disabled={deletingAttendanceId === r.id}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-100 rounded p-1 transition disabled:opacity-50"
                                title="Padam pengesahan kehadiran"
                              >
                                {deletingAttendanceId === r.id ? <LoadingSpinner size="sm" color="border-red-500" /> : <Trash2 size={12} />}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {tab === 'withdrawals' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                <WithdrawalsList
                  data={data.filter(d => d.daerahCode === daerahCode)}
                  onRefresh={refreshData}
                  allowUnwithdraw={true}
                  scopeLabel={`Daerah ${daerahCode}`}
                />
              </div>
            )}

            {tab === 'floated' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                <FloatedStudentsTab
                  schoolCode=""
                  schoolName={`Daerah ${daerahName}`}
                  negeriCode={negeriCode}
                  daerahCode={daerahCode}
                  isAdmin
                  onRefresh={refreshData}
                />
              </div>
            )}

            {tab === 'profile' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
                  {/* Logo Upload Section */}
                  <div className="bg-white rounded-xl shadow p-6">
                    <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2 mb-4">
                      <Image size={20} className="text-green-600" /> Logo Daerah
                    </h2>
                    <p className="text-sm text-slate-500 mb-6">
                      Muat naik logo rasmi daerah. Logo ini akan digunakan pada sidebar dan cetakan bagi semua sekolah dalam daerah ini.
                    </p>

                    {/* Current Logo Preview */}
                    <div className="mb-6">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Logo Semasa</label>
                      <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 flex items-center justify-center bg-slate-50">
                        {daerahLogoUrl ? (
                          <img src={daerahLogoUrl} alt="Logo Daerah" className="h-32 w-auto object-contain" />
                        ) : (
                          <div className="text-center text-slate-400">
                            <Image size={48} className="mx-auto mb-2 opacity-30" />
                            <p className="text-xs">Belum ada logo dimuat naik. Logo default akan digunakan.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Upload Button */}
                    <div>
                      <label className={`flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-green-300 rounded-xl cursor-pointer hover:bg-green-50 transition ${logoUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                        {logoUploading ? (
                          <><RefreshCw size={18} className="animate-spin text-green-600" /> <span className="text-sm font-medium text-green-700">Sedang memuat naik...</span></>
                        ) : (
                          <><Upload size={18} className="text-green-600" /> <span className="text-sm font-medium text-green-700">Pilih Fail Imej (PNG/JPG, maks 2MB)</span></>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="hidden"
                          disabled={logoUploading}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Change Password Section */}
                  <div className="bg-white rounded-xl shadow p-6">
                    <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2 mb-4">
                      <Key size={20} className="text-green-600" /> Tukar Kata Laluan
                    </h2>
                    <p className="text-sm text-slate-500 mb-6">
                      Tukar kata laluan akaun admin daerah anda.
                    </p>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Kata Laluan Baru</label>
                        <input
                          type="password"
                          value={newAdminPassword}
                          onChange={(e) => setNewAdminPassword(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                          placeholder="Masukkan kata laluan baru"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Sahkan Kata Laluan</label>
                        <input
                          type="password"
                          value={confirmAdminPassword}
                          onChange={(e) => setConfirmAdminPassword(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                          placeholder="Masukkan semula kata laluan"
                        />
                      </div>
                      <button
                        onClick={handleChangeAdminPassword}
                        disabled={passwordLoading}
                        className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {passwordLoading ? (
                          <><RefreshCw size={16} className="animate-spin" /> Sedang Proses...</>
                        ) : (
                          'Simpan Kata Laluan'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
        </div>
      </main>

      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden" 
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

    </div>
  );
};

export default AdminDaerahPanel;
