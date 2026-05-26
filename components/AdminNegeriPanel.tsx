import React, { useState, useEffect, useCallback } from 'react';
import { Settings, ArrowLeft, Database, School, Link as LinkIcon, Lock, AlertTriangle, ChevronLeft, ChevronRight, Medal, RefreshCw, ToggleLeft, ToggleRight, ArrowLeftRight, Sparkles, Menu, LayoutDashboard, LogOut, Key, History, Shield, Briefcase, Trash2, Users, Download, FileSpreadsheet, FileJson, X, BarChart3, MapPin, Plus, EyeOff, Eye, Image, Upload, User, CheckCircle, ScanLine } from 'lucide-react';
import { AdminDashboard } from './AdminDashboard';
import { AdminSchools } from './AdminSchools';
import { AdminBadges } from './AdminBadges'; 
import { AdminMigration } from './AdminMigration'; 
import { AdminHistory } from './AdminHistory';
import { AdminDataAudit } from './AdminDataAudit';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { DaerahProgramAnalysis } from './DaerahProgramAnalysis';
import { PengesahanTab } from './PengesahanTab';
import { SubmissionData, Badge, School as SchoolType, UserProfile } from '../types';
import { APP_VERSION, LOCAL_STORAGE_KEYS, DEFAULT_SERVER_URL, LOGO_URL } from '../constants';
import { toggleRegistration, setupDatabase, clearDatabaseSheet, changeAdminPassword, changeAdminRegionalPassword, addDaerah, deleteDaerah, updateDaerah, addAdmin, getSubmittedSchools, approveSchoolBadge, reopenSchoolBadge, recordAttendanceVerification, getAttendanceVerifications, deleteAttendanceVerification } from '../services/supabaseApi';
import { registerAdmin } from '../services/supabaseAuth';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { uploadLogo, getLogoUrl } from '../services/logoService';
import { QRAttendanceScanner } from './ui/QRVerification';
import { WithdrawalScanner } from './WithdrawalScanner';
import { WithdrawalsList } from './WithdrawalsList';

interface AdminNegeriPanelProps {
  negeriCode: string;
  negeriName: string;
  adminSession: { username: string; role: string; fullName?: string; negeriCode?: string; daerahCode?: string };
  onBack: () => void;
  scriptUrl: string;
  setScriptUrl: (url: string) => void;
  data: SubmissionData[];
  schools: SchoolType[];
  badges: Badge[]; 
  daerahList: any[];
  userProfiles?: UserProfile[];
  isRegistrationOpen: boolean; 
  refreshData: () => void;
  deleteData: (item: SubmissionData) => void;
}

export const AdminNegeriPanel: React.FC<AdminNegeriPanelProps> = ({ 
  negeriCode, negeriName, adminSession, onBack, scriptUrl, setScriptUrl, data, schools, badges, daerahList, userProfiles = [], isRegistrationOpen, refreshData, deleteData 
}) => {
  const [tab, setTab] = useState<'dashboard' | 'analytics' | 'daerah' | 'schools' | 'admins' | 'badges' | 'pengesahan' | 'attendance' | 'withdrawals' | 'history' | 'audit' | 'profile'>('dashboard');
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  // Filter daerah global utk semua tab data (Rumusan, Analitik, Sekolah, Semakan, Audit)
  const [selectedDaerahFilter, setSelectedDaerahFilter] = useState<string>('ALL');
  
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  const [newDaerahCode, setNewDaerahCode] = useState('');
  const [newDaerahName, setNewDaerahName] = useState('');
  const [newDistrictAdminUsername, setNewDistrictAdminUsername] = useState('');
  const [newDistrictAdminPassword, setNewDistrictAdminPassword] = useState('');
  const [newDistrictAdminDaerah, setNewDistrictAdminDaerah] = useState('');
  const [newDistrictAdminFullName, setNewDistrictAdminFullName] = useState('');
  const [newDistrictAdminPhone, setNewDistrictAdminPhone] = useState('');
  const [newDistrictAdminEmail, setNewDistrictAdminEmail] = useState('');
  const [negeriLogoUrl, setNegeriLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  // Edit daerah state
  const [editingDaerahCode, setEditingDaerahCode] = useState<string | null>(null);
  const [editDaerahCode, setEditDaerahCode] = useState('');
  const [editDaerahName, setEditDaerahName] = useState('');
  const [savingDaerah, setSavingDaerah] = useState(false);
  const [deletingDaerahCode, setDeletingDaerahCode] = useState<string | null>(null);
  // Attendance state
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [deletingAttendanceId, setDeletingAttendanceId] = useState<string | null>(null);

  const loadAttendanceRecords = useCallback(async () => {
    setAttendanceLoading(true);
    try {
      const records = await getAttendanceVerifications(new Date().getFullYear(), undefined, negeriCode);
      setAttendanceRecords(records);
    } catch (e) {
      console.error('Failed to load attendance:', e);
    } finally {
      setAttendanceLoading(false);
    }
  }, [negeriCode]);

  useEffect(() => {
    if (tab === 'attendance') loadAttendanceRecords();
  }, [tab, loadAttendanceRecords]);

  const handleDeleteAttendance = async (record: any) => {
    if (!confirm(`Padam rekod kehadiran untuk ${record.school?.name || ''} (${record.badge?.name || ''})?`)) return;
    setDeletingAttendanceId(record.id);
    try {
      const res = await deleteAttendanceVerification(record.id);
      if (res.status === 'success') await loadAttendanceRecords();
      else alert('Gagal padam: ' + res.message);
    } catch (e) {
      alert('Ralat sambungan.');
    } finally {
      setDeletingAttendanceId(null);
    }
  };

  // Load negeri logo on mount
  useEffect(() => {
    getLogoUrl('negeri', negeriCode).then(url => setNegeriLogoUrl(url));
  }, [negeriCode]);

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
      const url = await uploadLogo(file, 'negeri', negeriCode);
      setNegeriLogoUrl(url);
      alert('Logo negeri berjaya dimuat naik!');
    } catch (err: any) {
      alert('Gagal muat naik logo: ' + (err.message || 'Ralat tidak diketahui'));
    } finally {
      setLogoUploading(false);
    }
  };
  // Filter data untuk negeri ini sahaja (scope utama)
  const negeriData = data.filter(d => d.negeriCode === negeriCode);
  const negeriSchools = schools.filter(s => s.negeriCode === negeriCode);
  const filteredDaerah = daerahList.filter(d => d.negeriCode === negeriCode);

  // Cascade filter: jika pengguna pilih daerah tertentu, filter lagi ke daerah itu
  const filteredData = selectedDaerahFilter === 'ALL'
    ? negeriData
    : negeriData.filter(d => d.daerahCode === selectedDaerahFilter);
  const filteredSchools = selectedDaerahFilter === 'ALL'
    ? negeriSchools
    : negeriSchools.filter(s => s.daerahCode === selectedDaerahFilter);

  // Reset filter jika daerah yang dipilih dipadam atau bertukar negeri
  useEffect(() => {
    if (selectedDaerahFilter !== 'ALL' && !filteredDaerah.some(d => d.code === selectedDaerahFilter)) {
      setSelectedDaerahFilter('ALL');
    }
  }, [filteredDaerah, selectedDaerahFilter]);

  // Statistik agregat per-daerah (utk paparan ringkasan)
  const daerahStats = filteredDaerah.map(d => {
    const daerahSchools = negeriSchools.filter(s => s.daerahCode === d.code);
    const daerahDataRecords = negeriData.filter(rec => rec.daerahCode === d.code && rec.school !== '__SYSTEM_YEAR_MARKER__');
    const peserta = daerahDataRecords.filter(rec => {
      const role = (rec.role || 'PESERTA').toUpperCase();
      return role !== 'PEMIMPIN' && !role.includes('PENOLONG') && role !== 'PENGUJI';
    });
    return {
      code: d.code,
      name: d.name,
      schoolCount: daerahSchools.length,
      registeredCount: daerahSchools.filter(s => s.isClaimed).length,
      pesertaCount: peserta.length,
      totalRecords: daerahDataRecords.length,
    };
  }).sort((a, b) => b.pesertaCount - a.pesertaCount);

  const handleEditDaerah = (daerah: any) => {
    setEditingDaerahCode(daerah.code);
    setEditDaerahCode(daerah.code);
    setEditDaerahName(daerah.name);
  };

  const handleSaveDaerah = async (originalCode: string) => {
    if (!editDaerahCode.trim() || !editDaerahName.trim()) {
      alert('Kod dan nama daerah tidak boleh kosong.');
      return;
    }
    setSavingDaerah(true);
    try {
      const res = await updateDaerah(originalCode, editDaerahCode, editDaerahName);
      if (res.status === 'success') {
        setEditingDaerahCode(null);
        refreshData();
      } else {
        alert('Gagal: ' + res.message);
      }
    } catch (e) {
      alert('Ralat sambungan.');
    } finally {
      setSavingDaerah(false);
    }
  };

  const handleDeleteDaerah = async (daerah: any) => {
    const schoolsInDaerah = filteredSchools.filter(s => s.daerahCode === daerah.code).length;
    if (schoolsInDaerah > 0) {
      alert(`Tidak boleh padam ${daerah.name}. Masih ada ${schoolsInDaerah} sekolah aktif. Pindahkan atau padam sekolah dahulu.`);
      return;
    }
    if (!confirm(`Padam daerah ${daerah.name} (${daerah.code})? Tindakan ini tidak boleh diundur.`)) return;
    const code = prompt(`Taip "PADAM" untuk pengesahan padam ${daerah.name}.`);
    if (code !== 'PADAM') { alert('Tindakan dibatalkan.'); return; }
    setDeletingDaerahCode(daerah.code);
    try {
      const res = await deleteDaerah(scriptUrl, daerah.code);
      if (res.status === 'success') {
        alert(`Daerah ${daerah.name} berjaya dipadam.`);
        await refreshData();
      } else {
        alert('Gagal padam: ' + res.message);
      }
    } catch (e: any) {
      alert('Ralat sambungan: ' + (e?.message || ''));
    } finally {
      setDeletingDaerahCode(null);
    }
  };

  const handleAddDaerah = async () => {
    if (!newDaerahCode.trim() || !newDaerahName.trim()) {
      alert('Sila isi Kod Daerah dan Nama Daerah.');
      return;
    }
    setSetupLoading(true);
    try {
      const result = await addDaerah(scriptUrl, newDaerahCode, newDaerahName, negeriCode);
      if (result.status === 'success') {
        alert('Daerah berjaya ditambah.');
        setNewDaerahCode('');
        setNewDaerahName('');
        refreshData();
      } else {
        alert(result.message || 'Gagal tambah daerah.');
      }
    } catch (error) {
      alert('Ralat sambungan server semasa tambah daerah.');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleAddDistrictAdmin = async () => {
    if (!newDistrictAdminEmail.trim() || !newDistrictAdminPassword.trim() || !newDistrictAdminDaerah) {
      alert('Sila isi Email, Password dan pilih Daerah.');
      return;
    }
    setSetupLoading(true);
    try {
      const result = await registerAdmin({
        email: newDistrictAdminEmail.trim().toLowerCase(),
        password: newDistrictAdminPassword,
        role: 'daerah_admin',
        negeriCode,
        daerahCode: newDistrictAdminDaerah,
        fullName: newDistrictAdminFullName || newDistrictAdminEmail.trim().toLowerCase(),
        phone: newDistrictAdminPhone || undefined,
      });
      if (result.status === 'success') {
        alert('Admin Daerah berjaya didaftarkan di Supabase.');
        setNewDistrictAdminUsername('');
        setNewDistrictAdminPassword('');
        setNewDistrictAdminDaerah('');
        setNewDistrictAdminFullName('');
        setNewDistrictAdminPhone('');
        setNewDistrictAdminEmail('');
        refreshData();
      } else {
        alert(result.message || 'Gagal tambah Admin Daerah.');
      }
    } catch (error) {
      alert('Ralat sambungan server semasa tambah Admin Daerah.');
    } finally {
      setSetupLoading(false);
    }
  };

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
          // Export only filtered data for this negeri
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
        const res = await changeAdminRegionalPassword(scriptUrl, adminSession.username, 'negeri', newAdminPassword);
        if (res.status === 'success') {
            alert(`Berjaya! Kata laluan untuk ADMIN NEGERI telah ditukar.\n\nSila log masuk semula.`);
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
    { id: 'dashboard', label: 'Rumusan Data', icon: LayoutDashboard, allowed: true, scoped: true },
    { id: 'analytics', label: 'Analitik', icon: BarChart3, allowed: true, scoped: true },
    { id: 'daerah', label: 'Senarai Daerah', icon: MapPin, allowed: true, scoped: false },
    { id: 'schools', label: 'Urus Sekolah', icon: School, allowed: true, scoped: true },
    { id: 'admins', label: 'Urus Admin Daerah', icon: Users, allowed: true, scoped: false },
    { id: 'badges', label: 'Urus Program', icon: Medal, allowed: true, scoped: false },
    { id: 'pengesahan', label: 'Pengesahan', icon: CheckCircle, allowed: true, scoped: false },
    { id: 'attendance', label: 'Kehadiran', icon: ScanLine, allowed: true, scoped: false },
    { id: 'withdrawals', label: 'Status Peserta', icon: AlertTriangle, allowed: true, scoped: true },
    { id: 'history', label: 'Semakan Rekod', icon: History, allowed: true, scoped: true },
    { id: 'audit', label: 'Audit Data', icon: AlertTriangle, allowed: true, scoped: true },
    { id: 'profile', label: 'Profil', icon: User, allowed: true, scoped: false },
  ];

  // Tab yang menyokong filter by daerah (paparkan dropdown bila tab ini aktif)
  const currentMenuItem = menuItems.find(i => i.id === tab);
  const showDaerahFilter = !!currentMenuItem?.scoped;
  const activeDaerahName = selectedDaerahFilter === 'ALL'
    ? `Semua Daerah (${filteredDaerah.length})`
    : (filteredDaerah.find(d => d.code === selectedDaerahFilter)?.name || selectedDaerahFilter);

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
      
      {/* MOBILE HEADER */}
      <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center shadow-md print:hidden sticky top-0 z-50 border-b-2 border-amber-600">
          <div className="flex items-center gap-2">
              <Settings size={20} className="text-amber-500" />
              <div className="text-sm font-bold">Admin Negeri - {negeriName}</div>
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
                >
                    {isDesktopSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
                </button>
          </div>

          <div className="p-6 border-b border-slate-800 flex flex-col items-center text-center overflow-hidden bg-gradient-to-b from-slate-900 to-slate-800">
              <img src={negeriLogoUrl || LOGO_URL} alt="Logo" className="h-14 w-auto mb-3 drop-shadow-md" />
              {isDesktopSidebarOpen && (
                  <div className="animate-[fadeIn_0.2s_ease-out]">
                    <h2 className="font-bold text-white text-lg tracking-tight">Panel Admin</h2>
                    <p className="text-[10px] font-mono mt-1 tracking-wider uppercase px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                        {negeriName}
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
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sticky top-0 z-40 shadow-sm print:hidden">
            <div>
                <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    {menuItems.find(i => i.id === tab)?.label}
                </h1>
                {showDaerahFilter && (
                  <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1.5">
                    <MapPin size={11} className="text-blue-600" />
                    Skop: <span className="font-semibold text-gray-700">{activeDaerahName}</span>
                    <span className="text-gray-400">·</span>
                    {filteredSchools.length} sekolah · {filteredData.length} rekod
                  </p>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
                {/* Filter by Daerah - hanya untuk tab yang scoped */}
                {showDaerahFilter && (
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 pl-3 pr-1.5 py-1 rounded-full">
                      <MapPin size={14} className="text-blue-600 shrink-0" />
                      <span className="text-[10px] font-extrabold text-blue-700 uppercase tracking-wider hidden md:inline">Filter Daerah</span>
                      <select
                          value={selectedDaerahFilter}
                          onChange={(e) => setSelectedDaerahFilter(e.target.value)}
                          className="bg-white border border-blue-200 rounded-full px-3 py-1.5 text-xs font-bold text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-[200px]"
                          title="Filter data berdasarkan daerah"
                      >
                          <option value="ALL">Semua Daerah ({filteredDaerah.length})</option>
                          {filteredDaerah.map((d) => (
                            <option key={d.code} value={d.code}>{d.name} ({d.code})</option>
                          ))}
                      </select>
                  </div>
                )}

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
            {/* TAB DAERAH - Senarai semua daerah dalam negeri */}
            {tab === 'daerah' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                    <MapPin className="text-blue-600" />
                    Senarai Daerah di {negeriName}
                  </h2>
                  <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2"><Plus size={16}/> Tambah Daerah Baru</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input value={newDaerahCode} onChange={(e) => setNewDaerahCode(e.target.value.toUpperCase())} placeholder="Kod Daerah (cth: KU)" className="border rounded-lg px-3 py-2 text-sm" />
                      <input value={newDaerahName} onChange={(e) => setNewDaerahName(e.target.value.toUpperCase())} placeholder="Nama Daerah" className="border rounded-lg px-3 py-2 text-sm" />
                      <button onClick={handleAddDaerah} disabled={setupLoading} className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-blue-700 disabled:bg-gray-300 flex items-center justify-center gap-2">
                        {setupLoading ? <LoadingSpinner size="sm" color="border-white" /> : <Plus size={16}/>} Tambah Daerah
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredDaerah.map((daerah, idx) => {
                      const isEditing = editingDaerahCode === daerah.code;
                      const isDeleting = deletingDaerahCode === daerah.code;
                      const schoolCount = filteredSchools.filter(s => s.daerahCode === daerah.code).length;
                      return (
                        <div key={idx} className="border rounded-lg p-4 hover:shadow-md transition group">
                          {isEditing ? (
                            <div className="space-y-2">
                              <input
                                value={editDaerahCode}
                                onChange={(e) => setEditDaerahCode(e.target.value.toUpperCase())}
                                placeholder="Kod"
                                className="w-full border rounded px-2 py-1 text-sm font-mono"
                              />
                              <input
                                value={editDaerahName}
                                onChange={(e) => setEditDaerahName(e.target.value.toUpperCase())}
                                placeholder="Nama"
                                className="w-full border rounded px-2 py-1 text-sm"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleSaveDaerah(daerah.code)}
                                  disabled={savingDaerah}
                                  className="flex-1 bg-green-600 text-white text-xs font-bold py-1.5 rounded hover:bg-green-700 disabled:opacity-50"
                                >
                                  {savingDaerah ? '...' : 'Simpan'}
                                </button>
                                <button
                                  onClick={() => setEditingDaerahCode(null)}
                                  className="flex-1 bg-gray-200 text-gray-700 text-xs font-bold py-1.5 rounded hover:bg-gray-300"
                                >
                                  Batal
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="font-bold text-lg">{daerah.name}</div>
                                  <div className="text-sm text-gray-500">Kod: {daerah.code}</div>
                                  <div className="text-xs text-gray-400 mt-2">{schoolCount} sekolah</div>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                  <button
                                    onClick={() => handleEditDaerah(daerah)}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition"
                                    title="Edit Daerah"
                                  >
                                    <Settings size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteDaerah(daerah)}
                                    disabled={isDeleting || schoolCount > 0}
                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
                                    title={schoolCount > 0 ? `Tak boleh padam (${schoolCount} sekolah aktif)` : 'Padam Daerah'}
                                  >
                                    {isDeleting ? <LoadingSpinner size="sm" color="border-red-600" /> : <Trash2 size={14} />}
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB ADMIN DAERAH - Urus admin untuk daerah dalam negeri */}
            {tab === 'admins' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                    <Users className="text-purple-600" />
                    Pengurusan Admin Daerah
                  </h2>
                  <p className="text-gray-600 mb-6">
                    Cipta dan urus akaun Admin Daerah untuk daerah-daerah di bawah {negeriName}
                  </p>
                  
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 mb-6">
                    <h3 className="font-bold text-purple-900 mb-4 flex items-center gap-2"><Plus size={16}/> Tambah Admin Daerah</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Daerah</label>
                        <select value={newDistrictAdminDaerah} onChange={(e) => setNewDistrictAdminDaerah(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                          <option value="">-- Pilih Daerah --</option>
                          {filteredDaerah.map((daerah) => <option key={daerah.code} value={daerah.code}>{daerah.name} ({daerah.code})</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email Admin *</label>
                        <input type="email" value={newDistrictAdminEmail} onChange={(e) => setNewDistrictAdminEmail(e.target.value)} placeholder="admin@example.com" className="w-full border rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password</label>
                        <input type="password" value={newDistrictAdminPassword} onChange={(e) => setNewDistrictAdminPassword(e.target.value)} placeholder="Kata laluan" className="w-full border rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nama Penuh</label>
                        <input value={newDistrictAdminFullName} onChange={(e) => setNewDistrictAdminFullName(e.target.value.toUpperCase())} placeholder="Nama admin" className="w-full border rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Telefon</label>
                        <input value={newDistrictAdminPhone} onChange={(e) => setNewDistrictAdminPhone(e.target.value)} placeholder="No. telefon" className="w-full border rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div className="col-span-2 bg-purple-100 border border-purple-200 rounded-lg p-2 text-xs text-purple-800">
                        Akaun admin daerah akan dicipta dalam Supabase Auth dan terikat secara automatik kepada negeri {negeriName} serta daerah yang dipilih.
                      </div>
                    </div>
                    <button onClick={handleAddDistrictAdmin} disabled={setupLoading || filteredDaerah.length === 0} className="mt-4 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-purple-700 disabled:bg-gray-300 flex items-center gap-2">
                      {setupLoading ? <LoadingSpinner size="sm" color="border-white" /> : <Plus size={16}/>} Tambah Admin Daerah
                    </button>
                    {filteredDaerah.length === 0 && <p className="text-xs text-amber-700 mt-2">Sila tambah daerah dahulu sebelum cipta Admin Daerah.</p>}
                  </div>

                  <div className="bg-white border rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b font-bold text-sm text-gray-700">Daerah tersedia untuk negeri ini</div>
                    <div className="divide-y">
                      {filteredDaerah.map((daerah) => (
                        <div key={daerah.code} className="p-4 flex items-center justify-between">
                          <div>
                            <div className="font-bold text-gray-800">{daerah.name}</div>
                            <div className="text-xs text-gray-500">Kod: {daerah.code}</div>
                          </div>
                          <div className="text-xs text-gray-500">{filteredSchools.filter(s => s.daerahCode === daerah.code).length} sekolah</div>
                        </div>
                      ))}
                      {filteredDaerah.length === 0 && <div className="p-4 text-sm text-gray-500">Tiada daerah didaftarkan.</div>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === 'schools' && (
              <div className="animate-[fadeIn_0.2s_ease-out] print:hidden">
                 <AdminSchools 
                   schools={filteredSchools} 
                   scriptUrl={scriptUrl} 
                   negeriCode={negeriCode}
                   daerahCode={selectedDaerahFilter !== 'ALL' ? selectedDaerahFilter : undefined}
                   onRefresh={refreshData} 
                 />
              </div>
            )}
            
            {tab === 'badges' && (
              <div className="animate-[fadeIn_0.2s_ease-out] print:hidden">
                 <AdminBadges badges={badges} scriptUrl={scriptUrl} onRefresh={refreshData} scopeContext={{ type: 'negeri', negeriCode, label: `Negeri ${negeriName}` }} />
              </div>
            )}

            {tab === 'pengesahan' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                <PengesahanTab
                  negeriCode={negeriCode}
                  scriptUrl={scriptUrl}
                  data={negeriData}
                  schools={negeriSchools}
                  badges={badges}
                  onRefresh={refreshData}
                />
              </div>
            )}

            {tab === 'attendance' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                <div className="bg-white rounded-xl shadow p-6">
                  <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2 mb-4">
                    <ScanLine size={20} className="text-green-600" /> Pengesahan Kehadiran QR
                  </h2>
                  <p className="text-sm text-slate-500 mb-4">
                    Imbas QR code sekolah untuk mengesahkan kehadiran peserta dalam {negeriName}. Selepas scan, jumlah peserta berdaftar akan dipaparkan.
                  </p>

                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-red-800">Kemaskini Status Peserta</p>
                      <p className="text-xs text-red-600 mt-1">Imbas QR peserta yang perlu pulang awal/tarik diri di tengah program.</p>
                    </div>
                    <WithdrawalScanner onWithdrawn={() => refreshData()} />
                  </div>

                  <QRAttendanceScanner
                    verifierName={adminSession.fullName || adminSession.username}
                    onVerified={async (record) => {
                      const res = await recordAttendanceVerification({
                        schoolCode: record.schoolCode,
                        badge: record.badge,
                        year: record.year,
                        participantCount: record.totalParticipants,
                      });
                      if (res.status !== 'success') alert('Gagal simpan kehadiran ke server: ' + (res.message || 'Ralat tidak diketahui'));
                      await loadAttendanceRecords();
                    }}
                  />

                  <div className="mt-8 border-t pt-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <CheckCircle size={16} className="text-green-500" /> Ringkasan Kehadiran Hari Ini
                      </h3>
                      <button onClick={loadAttendanceRecords} disabled={attendanceLoading} className="text-blue-600 hover:bg-blue-50 p-1 rounded transition">
                        <RefreshCw size={14} className={attendanceLoading ? 'animate-spin' : ''} />
                      </button>
                    </div>
                    {(() => {
                      const todayStr = new Date().toDateString();
                      const todayRecords = attendanceRecords.filter((r: any) => new Date(r.verified_at).toDateString() === todayStr);
                      if (attendanceLoading) return <p className="text-xs text-slate-400 italic">Memuatkan rekod kehadiran...</p>;
                      if (todayRecords.length === 0) return <p className="text-xs text-slate-400 italic">Belum ada kehadiran disahkan hari ini.</p>;
                      const uniqueSchools = new Set(todayRecords.map((r: any) => `${r.school?.school_code || ''}|${r.badge?.name || ''}`));
                      const totalSchools = uniqueSchools.size;
                      const totalParticipants = todayRecords.reduce((sum: number, r: any) => sum + (r.participant_count || 0), 0);

                      // Group by badge/program
                      const byBadge: Record<string, { schools: Set<string>; participants: number; daerahs: Set<string> }> = {};
                      for (const r of todayRecords) {
                        const badgeName = r.badge?.name || 'Tidak Diketahui';
                        if (!byBadge[badgeName]) byBadge[badgeName] = { schools: new Set(), participants: 0, daerahs: new Set() };
                        byBadge[badgeName].schools.add(r.school?.school_code || '');
                        byBadge[badgeName].participants += r.participant_count || 0;
                        if (r.school?.daerah?.code) byBadge[badgeName].daerahs.add(r.school.daerah.code);
                      }
                      const programList = Object.entries(byBadge).sort((a, b) => b[1].participants - a[1].participants);

                      return (
                        <div>
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="bg-green-50 rounded-lg p-4 text-center">
                              <p className="text-2xl font-bold text-green-700">{totalSchools}</p>
                              <p className="text-xs text-green-600 font-medium">Sekolah/Program Hadir</p>
                            </div>
                            <div className="bg-blue-50 rounded-lg p-4 text-center">
                              <p className="text-2xl font-bold text-blue-700">{totalParticipants}</p>
                              <p className="text-xs text-blue-600 font-medium">Jumlah Peserta</p>
                            </div>
                          </div>

                          <div className="mb-4">
                            <p className="text-[10px] font-bold text-gray-500 uppercase mb-2">Pecahan ikut Program</p>
                            <div className="space-y-1">
                              {programList.map(([badgeName, info], i) => (
                                <div key={i} className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded px-3 py-2">
                                  <span className="text-xs font-bold text-purple-900">{badgeName}</span>
                                  <span className="text-xs text-purple-700">
                                    <strong>{info.schools.size}</strong> sekolah · <strong>{info.daerahs.size}</strong> daerah · <strong>{info.participants}</strong> peserta
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <p className="text-[10px] font-bold text-gray-500 uppercase mb-2">Senarai Scan</p>
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {todayRecords.map((r: any, i: number) => (
                              <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2 gap-3">
                                <div>
                                  <p className="text-xs font-bold text-slate-800">{r.school?.name || '-'}</p>
                                  <p className="text-[10px] text-slate-500">{r.badge?.name || '-'} | {r.school?.daerah?.code || '-'} | {r.participant_count || 0} peserta</p>
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
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {tab === 'history' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                  <AdminHistory data={filteredData} schools={filteredSchools} onRefresh={refreshData} />
              </div>
            )}

            {tab === 'audit' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                  <AdminDataAudit data={filteredData} schools={filteredSchools} />
              </div>
            )}

            {tab === 'dashboard' && (
              <div className="animate-[fadeIn_0.2s_ease-out] space-y-6">
                 {/* Ringkasan Per-Daerah - hanya papar bila tengok semua daerah */}
                 {selectedDaerahFilter === 'ALL' && filteredDaerah.length > 0 && (
                   <div className="bg-white rounded-xl shadow border border-gray-200 p-6 print:hidden">
                     <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                       <div>
                         <h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg">
                           <MapPin size={18} className="text-blue-600" />
                           Ringkasan Per-Daerah
                         </h3>
                         <p className="text-xs text-gray-500 mt-1">
                           Klik mana-mana daerah untuk filter pandangan keseluruhan ke daerah tersebut.
                         </p>
                       </div>
                       <span className="text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full self-start">
                         {filteredDaerah.length} Daerah · {negeriSchools.length} Sekolah
                       </span>
                     </div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                       {daerahStats.map((d) => (
                         <button
                           key={d.code}
                           onClick={() => setSelectedDaerahFilter(d.code)}
                           className="text-left border border-gray-200 rounded-lg p-4 hover:border-blue-400 hover:shadow-md hover:bg-blue-50/50 transition group"
                         >
                           <div className="flex items-start justify-between gap-2 mb-2">
                             <div className="flex-1 min-w-0">
                               <div className="font-bold text-sm text-gray-800 group-hover:text-blue-700 truncate">{d.name}</div>
                               <div className="text-[10px] text-gray-500 font-mono uppercase">{d.code}</div>
                             </div>
                             <MapPin size={14} className="text-gray-300 group-hover:text-blue-500 shrink-0 mt-0.5" />
                           </div>
                           <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-100">
                             <div>
                               <div className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Sekolah</div>
                               <div className="text-lg font-bold text-gray-800">{d.schoolCount}</div>
                               <div className="text-[10px] text-gray-500">{d.registeredCount} aktif</div>
                             </div>
                             <div>
                               <div className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Peserta</div>
                               <div className="text-lg font-bold text-blue-700">{d.pesertaCount}</div>
                               <div className="text-[10px] text-gray-500">{d.totalRecords} rekod</div>
                             </div>
                           </div>
                         </button>
                       ))}
                     </div>
                   </div>
                 )}

                 {/* Analisis lengkap daerah & program */}
                 <DaerahProgramAnalysis
                   data={negeriData}
                   schools={negeriSchools}
                   badges={badges}
                   daerahList={filteredDaerah}
                   negeriName={negeriName}
                   selectedDaerah={selectedDaerahFilter}
                 />

                 <AdminDashboard data={filteredData} schools={filteredSchools} badges={badges} userProfiles={userProfiles} onRefresh={refreshData} onDelete={deleteData} />
              </div>
            )}

            {tab === 'analytics' && (
              <div className="animate-[fadeIn_0.2s_ease-out] space-y-6">
                  <AnalyticsDashboard allData={filteredData} badges={badges} />

                  {/* Analisis lengkap daerah & program (juga dipaparkan di Analitik) */}
                  <DaerahProgramAnalysis
                    data={negeriData}
                    schools={negeriSchools}
                    badges={badges}
                    daerahList={filteredDaerah}
                    negeriName={negeriName}
                    selectedDaerah={selectedDaerahFilter}
                  />
              </div>
            )}

            {tab === 'withdrawals' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                <WithdrawalsList
                  data={filteredData}
                  onRefresh={refreshData}
                  allowUnwithdraw={true}
                  scopeLabel={`Negeri ${negeriName}`}
                />
              </div>
            )}

            {tab === 'profile' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
                  {/* Logo Upload Section */}
                  <div className="bg-white rounded-xl shadow p-6">
                    <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2 mb-4">
                      <Image size={20} className="text-purple-600" /> Logo Negeri
                    </h2>
                    <p className="text-sm text-slate-500 mb-6">
                      Muat naik logo rasmi negeri. Logo ini akan digunakan pada sidebar dan cetakan bagi semua sekolah dalam negeri ini (jika tiada logo daerah).
                    </p>

                    {/* Current Logo Preview */}
                    <div className="mb-6">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Logo Semasa</label>
                      <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 flex items-center justify-center bg-slate-50">
                        {negeriLogoUrl ? (
                          <img src={negeriLogoUrl} alt="Logo Negeri" className="h-32 w-auto object-contain" />
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
                      <label className={`flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-purple-300 rounded-xl cursor-pointer hover:bg-purple-50 transition ${logoUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                        {logoUploading ? (
                          <><RefreshCw size={18} className="animate-spin text-purple-600" /> <span className="text-sm font-medium text-purple-700">Sedang memuat naik...</span></>
                        ) : (
                          <><Upload size={18} className="text-purple-600" /> <span className="text-sm font-medium text-purple-700">Pilih Fail Imej (PNG/JPG, maks 2MB)</span></>
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
                      <Key size={20} className="text-purple-600" /> Tukar Kata Laluan
                    </h2>
                    <p className="text-sm text-slate-500 mb-6">
                      Tukar kata laluan akaun admin negeri anda.
                    </p>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Kata Laluan Baru</label>
                        <input
                          type="password"
                          value={newAdminPassword}
                          onChange={(e) => setNewAdminPassword(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                          placeholder="Masukkan kata laluan baru"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Sahkan Kata Laluan</label>
                        <input
                          type="password"
                          value={confirmAdminPassword}
                          onChange={(e) => setConfirmAdminPassword(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                          placeholder="Masukkan semula kata laluan"
                        />
                      </div>
                      <button
                        onClick={handleChangeAdminPassword}
                        disabled={passwordLoading}
                        className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

export default AdminNegeriPanel;
