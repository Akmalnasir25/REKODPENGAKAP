import React, { useState } from 'react';
import { Settings, ArrowLeft, Database, School, Link as LinkIcon, Lock, AlertTriangle, ChevronLeft, ChevronRight, Medal, RefreshCw, ToggleLeft, ToggleRight, ArrowLeftRight, Sparkles, Menu, LayoutDashboard, LogOut, Key, History, Shield, Briefcase, Trash2, Users, Download, FileSpreadsheet, FileJson, X, BarChart3 } from 'lucide-react';
import { AdminDashboard } from './AdminDashboard';
import { AdminSchools } from './AdminSchools';
import { AdminBadges } from './AdminBadges'; 
import { AdminMigration } from './AdminMigration'; 
import { AdminHistory } from './AdminHistory';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { SubmissionData, Badge, School as SchoolType } from '../types';
import { APP_VERSION, LOCAL_STORAGE_KEYS, DEFAULT_SERVER_URL, LOGO_URL } from '../constants';
import { toggleRegistration, setupDatabase, clearDatabaseSheet, changeAdminPassword } from '../services/api';
import { LoadingSpinner } from './ui/LoadingSpinner';

interface AdminPanelProps {
  role: 'admin' | 'district';
  onBack: () => void;
  scriptUrl: string;
  setScriptUrl: (url: string) => void;
  data: SubmissionData[];
  schools: SchoolType[];
  badges: Badge[]; 
  isRegistrationOpen: boolean; 
  refreshData: () => void;
  deleteData: (item: SubmissionData) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ 
  role, onBack, scriptUrl, setScriptUrl, data, schools, badges, isRegistrationOpen, refreshData, deleteData 
}) => {
  const [tab, setTab] = useState<'dashboard' | 'analytics' | 'schools' | 'badges' | 'migration' | 'history' | 'config'>('dashboard');
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);

  // Password Change State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Define Permissions based on user prompt ("Daerah paling atas, Admin di bawah")
  // DAERAH (District) = Super Admin (Has Config Access)
  // ADMIN (Penyelaras) = Operational Admin (No Config Access)
  const canAccessConfig = role === 'district';

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
          // Flatten data for better Excel view
          exportData = data.map(d => ({
              ...d,
              _backupDate: timestamp
          }));
      } else if (type === 'SCHOOLS') {
          exportData = schools.map(s => ({
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
    if (newAdminPassword.length < 3) {
        alert("Kata laluan terlalu pendek.");
        return;
    }

    setPasswordLoading(true);
    try {
        const res = await changeAdminPassword(scriptUrl, role, newAdminPassword);
        if (res.status === 'success') {
            alert(`Berjaya! Kata laluan untuk ${role === 'district' ? 'DAERAH' : 'PENYELARAS'} telah ditukar.\n\nSila log masuk semula.`);
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
    { id: 'badges', label: 'Urus Lencana', icon: Medal, allowed: true },
    { id: 'history', label: 'Semakan Rekod', icon: History, allowed: true },
    // Only District Admin can see Migration
    { id: 'migration', label: 'Migrasi Data', icon: ArrowLeftRight, allowed: canAccessConfig }, 
    // Only District Admin can see Configuration
    { id: 'config', label: 'Konfigurasi', icon: Settings, allowed: canAccessConfig }, 
  ];

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
              <div className="text-sm font-bold">Panel Admin</div>
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
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 shadow-lg ${role === 'district' ? 'bg-amber-500 shadow-amber-900/50' : 'bg-blue-600 shadow-blue-900/50'}`}>
                  {role === 'district' ? <Shield size={24} className="text-slate-900" /> : <Briefcase size={24} className="text-white" />}
              </div>
              {isDesktopSidebarOpen && (
                  <div className="animate-[fadeIn_0.2s_ease-out]">
                    <h2 className="font-bold text-white text-lg tracking-tight">Panel Admin</h2>
                    <p className={`text-[10px] font-mono mt-1 tracking-wider uppercase px-2 py-0.5 rounded ${role === 'district' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-300'}`}>
                        {role === 'district' ? 'PENTADBIR DAERAH' : 'PENYELARAS'}
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
              
              {/* Change Password Button */}
              <SidebarItem 
                icon={Key} 
                label="Tukar Kata Laluan" 
                onClick={() => { setShowPasswordModal(true); setIsMobileSidebarOpen(false); }}
                className="mt-4 text-amber-500 hover:text-amber-400 hover:bg-amber-900/20 border border-amber-900/30"
              />
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
            {tab === 'config' && canAccessConfig && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-6 animate-[fadeIn_0.2s_ease-out] print:hidden">
                <h2 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                    <Settings className="text-gray-500"/> Tetapan Pangkalan Data
                </h2>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h3 className="text-sm font-bold text-blue-800 mb-2 flex items-center gap-2">
                    <Lock size={14} /> URL Script (Backend)
                  </h3>
                  {scriptUrl ? (
                    <div>
                      <p className="text-xs text-blue-600 mb-2">URL semasa yang disambungkan:</p>
                      <code className="block bg-white p-3 rounded border text-xs break-all font-mono text-gray-600 shadow-inner">{scriptUrl}</code>
                    </div>
                  ) : (
                    <p className="text-sm text-red-600 flex items-center gap-2 font-semibold">
                      <AlertTriangle size={16} /> URL belum dimasukkan.
                    </p>
                  )}
                </div>

                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <h3 className="text-sm font-bold text-yellow-800 mb-2 flex items-center gap-2">
                        <Sparkles size={14} /> Persediaan Database (Auto-Setup)
                    </h3>
                    <p className="text-xs text-yellow-700 mb-3">
                        Gunakan butang ini untuk AppScript menjana struktur Header dan Sheet yang diperlukan secara automatik jika ia belum wujud.
                    </p>
                    <button 
                        type="button" 
                        onClick={handleSetupDatabase} 
                        disabled={setupLoading || !scriptUrl}
                        className="bg-yellow-500 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-yellow-600 transition shadow-sm flex items-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        {setupLoading ? <LoadingSpinner size="sm" color="border-white"/> : <Database size={14}/>}
                        Jana Struktur Database
                    </button>
                </div>
                
                {/* BACKUP & EXPORT SECTION */}
                <div className="p-6 bg-indigo-50 border border-indigo-200 rounded-lg shadow-sm">
                    <h3 className="text-sm font-bold text-indigo-800 mb-3 flex items-center gap-2 uppercase tracking-wide">
                        <Download size={18} /> Backup & Eksport Data
                    </h3>
                    <p className="text-xs text-indigo-700 mb-4 font-medium">
                        Muat turun salinan data semasa sebelum melakukan sebarang perubahan drastik atau reset.
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* DATA BACKUP */}
                        <div className="bg-white p-3 rounded-lg border border-indigo-100 shadow-sm">
                            <div className="text-xs font-bold text-gray-500 mb-2 uppercase flex items-center gap-1"><Database size={12}/> Data Peserta</div>
                            <div className="flex gap-2">
                                <button onClick={() => handleExport('DATA', 'xlsx')} className="flex-1 bg-green-600 text-white py-1.5 rounded text-[10px] font-bold hover:bg-green-700 flex items-center justify-center gap-1"><FileSpreadsheet size={12}/> EXCEL</button>
                                <button onClick={() => handleExport('DATA', 'json')} className="flex-1 bg-gray-700 text-white py-1.5 rounded text-[10px] font-bold hover:bg-gray-800 flex items-center justify-center gap-1"><FileJson size={12}/> JSON</button>
                            </div>
                        </div>

                        {/* SCHOOLS BACKUP */}
                        <div className="bg-white p-3 rounded-lg border border-indigo-100 shadow-sm">
                            <div className="text-xs font-bold text-gray-500 mb-2 uppercase flex items-center gap-1"><School size={12}/> Data Sekolah</div>
                            <div className="flex gap-2">
                                <button onClick={() => handleExport('SCHOOLS', 'xlsx')} className="flex-1 bg-green-600 text-white py-1.5 rounded text-[10px] font-bold hover:bg-green-700 flex items-center justify-center gap-1"><FileSpreadsheet size={12}/> EXCEL</button>
                                <button onClick={() => handleExport('SCHOOLS', 'json')} className="flex-1 bg-gray-700 text-white py-1.5 rounded text-[10px] font-bold hover:bg-gray-800 flex items-center justify-center gap-1"><FileJson size={12}/> JSON</button>
                            </div>
                        </div>

                        {/* BADGES BACKUP */}
                        <div className="bg-white p-3 rounded-lg border border-indigo-100 shadow-sm">
                            <div className="text-xs font-bold text-gray-500 mb-2 uppercase flex items-center gap-1"><Medal size={12}/> Data Lencana</div>
                            <div className="flex gap-2">
                                <button onClick={() => handleExport('BADGES', 'xlsx')} className="flex-1 bg-green-600 text-white py-1.5 rounded text-[10px] font-bold hover:bg-green-700 flex items-center justify-center gap-1"><FileSpreadsheet size={12}/> EXCEL</button>
                                <button onClick={() => handleExport('BADGES', 'json')} className="flex-1 bg-gray-700 text-white py-1.5 rounded text-[10px] font-bold hover:bg-gray-800 flex items-center justify-center gap-1"><FileJson size={12}/> JSON</button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* DANGER ZONE - RESET DATA */}
                <div className="p-6 bg-red-50 border-2 border-red-500 rounded-lg shadow-sm">
                    <h3 className="text-sm font-bold text-red-800 mb-3 flex items-center gap-2 uppercase tracking-wide">
                        <AlertTriangle size={18} /> Zon Bahaya (Pengurusan Data)
                    </h3>
                    <p className="text-xs text-red-700 mb-6 font-medium">
                        Amaran: Tindakan di bawah akan <strong>MEMADAMKAN SEMUA DATA</strong> dalam sheet yang berkaitan secara kekal. Data yang dipadam tidak boleh dikembalikan. Sila gunakan dengan berhati-hati.
                    </p>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <button 
                            onClick={() => handleClearData('DATA', 'DATA (Rekod Pendaftaran)')}
                            disabled={setupLoading}
                            className="bg-white border-2 border-red-200 text-red-600 px-4 py-3 rounded-lg text-xs font-bold hover:bg-red-600 hover:text-white transition shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <Trash2 size={16}/> Reset Semua Data Peserta
                        </button>
                        
                        <button 
                            onClick={() => handleClearData('SCHOOLS', 'SCHOOLS (Senarai Sekolah)')}
                            disabled={setupLoading}
                            className="bg-white border-2 border-red-200 text-red-600 px-4 py-3 rounded-lg text-xs font-bold hover:bg-red-600 hover:text-white transition shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <School size={16}/> Reset Senarai Sekolah
                        </button>

                        <button 
                            onClick={() => handleClearData('BADGES', 'BADGES (Senarai Lencana)')}
                            disabled={setupLoading}
                            className="bg-white border-2 border-red-200 text-red-600 px-4 py-3 rounded-lg text-xs font-bold hover:bg-red-600 hover:text-white transition shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <Medal size={16}/> Reset Senarai Lencana
                        </button>

                        <button 
                            onClick={() => handleClearData('USERS', 'USERS (Akaun Pengguna)')}
                            disabled={setupLoading}
                            className="bg-white border-2 border-red-200 text-red-600 px-4 py-3 rounded-lg text-xs font-bold hover:bg-red-600 hover:text-white transition shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <Users size={16}/> Reset Semua Pengguna
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSaveConfig} className="space-y-4 p-6 border border-gray-200 rounded-lg bg-gray-50">
                  <h3 className="text-sm font-bold text-gray-700">Tetapan Lanjutan (Override)</h3>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-semibold text-gray-600">URL Apps Script Tersuai</label>
                        <button type="button" onClick={handleResetUrl} className="text-[10px] text-blue-600 hover:underline flex items-center gap-1">
                            <RefreshCw size={10} /> Reset Default
                        </button>
                    </div>
                    <input 
                        type="url" 
                        className="w-full p-3 border rounded-lg font-mono text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none transition" 
                        value={scriptUrl} 
                        onChange={(e) => setScriptUrl(e.target.value)} 
                        placeholder="https://script.google.com/..."
                    />
                  </div>
                  <button className="bg-slate-700 text-white px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-800 transition shadow-md w-full sm:w-auto">
                    Simpan Tetapan & Refresh
                  </button>
                </form>
              </div>
            )}

            {tab === 'schools' && (
              <div className="animate-[fadeIn_0.2s_ease-out] print:hidden">
                 <AdminSchools schools={schools} scriptUrl={scriptUrl} onRefresh={refreshData} />
              </div>
            )}
            
            {tab === 'badges' && (
              <div className="animate-[fadeIn_0.2s_ease-out] print:hidden">
                 <AdminBadges badges={badges} scriptUrl={scriptUrl} onRefresh={refreshData} />
              </div>
            )}

            {tab === 'migration' && canAccessConfig && (
              <div className="animate-[fadeIn_0.2s_ease-out] print:hidden">
                 <AdminMigration scriptUrl={scriptUrl} onRefresh={refreshData} />
              </div>
            )}

            {tab === 'history' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                 <AdminHistory data={data} schools={schools} onRefresh={refreshData} />
              </div>
            )}

            {tab === 'analytics' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                 <AnalyticsDashboard allData={data} badges={badges} />
              </div>
            )}

            {tab === 'dashboard' && (
               <div className="animate-[fadeIn_0.2s_ease-out]">
                  <AdminDashboard data={data} schools={schools} onRefresh={refreshData} onDelete={deleteData} />
               </div>
            )}
        </div>
      </main>

      {/* CHANGE PASSWORD MODAL */}
      {showPasswordModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-[fadeIn_0.3s_ease-out] backdrop-blur-sm print:hidden">
            <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm relative">
                <button 
                    onClick={() => { setShowPasswordModal(false); setNewAdminPassword(''); setConfirmAdminPassword(''); }} 
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                >
                    <X size={20} />
                </button>
                <h3 className="font-bold text-lg mb-4 flex gap-2 items-center text-gray-800">
                    <Key size={20} className="text-amber-600"/> Tukar Kata Laluan
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                    Tukar kata laluan untuk akaun <strong>{role === 'district' ? 'DAERAH (SUPER ADMIN)' : 'ADMIN PENYELARAS'}</strong>.
                </p>
                
                <div className="space-y-4 mb-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Kata Laluan Baru</label>
                        <input type="password" className="w-full p-2 border rounded text-sm focus:ring-1 focus:ring-amber-500" value={newAdminPassword} onChange={e=>setNewAdminPassword(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Sahkan Kata Laluan</label>
                        <input type="password" className="w-full p-2 border rounded text-sm focus:ring-1 focus:ring-amber-500" value={confirmAdminPassword} onChange={e=>setConfirmAdminPassword(e.target.value)} />
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={() => setShowPasswordModal(false)} className="px-4 py-2 text-gray-500 font-bold text-xs hover:bg-gray-100 rounded">Batal</button>
                    <button onClick={handleChangeAdminPassword} disabled={passwordLoading} className="bg-amber-600 text-white px-4 py-2 rounded font-bold text-xs hover:bg-amber-700 shadow flex items-center gap-2">
                        {passwordLoading ? <LoadingSpinner size="sm" color="border-white"/> : "Simpan & Log Keluar"}
                    </button>
                </div>
            </div>
          </div>
      )}
    </div>
  );
};