import React, { useState } from 'react';
import { Settings, ArrowLeft, Database, School, Link as LinkIcon, Lock, AlertTriangle, ChevronLeft, ChevronRight, Medal, RefreshCw, ToggleLeft, ToggleRight, ArrowLeftRight, Sparkles, Menu, LayoutDashboard, LogOut, Key, History, Shield, Briefcase, Trash2, Users, Download, FileSpreadsheet, FileJson, X, BarChart3, MapPin, Plus, EyeOff, Eye } from 'lucide-react';
import { AdminDashboard } from './AdminDashboard';
import { AdminSchools } from './AdminSchools';
import { AdminBadges } from './AdminBadges'; 
import { AdminMigration } from './AdminMigration'; 
import { AdminHistory } from './AdminHistory';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { SubmissionData, Badge, School as SchoolType } from '../types';
import { APP_VERSION, LOCAL_STORAGE_KEYS, DEFAULT_SERVER_URL, LOGO_URL } from '../constants';
import { toggleRegistration, setupDatabase, clearDatabaseSheet, changeAdminPassword, changeAdminRegionalPassword } from '../services/api';
import { LoadingSpinner } from './ui/LoadingSpinner';

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
  isRegistrationOpen: boolean; 
  refreshData: () => void;
  deleteData: (item: SubmissionData) => void;
}

export const AdminNegeriPanel: React.FC<AdminNegeriPanelProps> = ({ 
  negeriCode, negeriName, adminSession, onBack, scriptUrl, setScriptUrl, data, schools, badges, daerahList, isRegistrationOpen, refreshData, deleteData 
}) => {
  const [tab, setTab] = useState<'dashboard' | 'analytics' | 'daerah' | 'schools' | 'admins' | 'badges' | 'history'>('dashboard');
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');

  // Debug logging
  React.useEffect(() => {
    console.log('=== AdminNegeriPanel Debug ===');
    console.log('negeriCode:', negeriCode);
    console.log('negeriName:', negeriName);
    console.log('Total data received:', data.length);
    console.log('Total schools received:', schools.length);
    console.log('Total daerah received:', daerahList.length);
    
    if (data.length > 0) {
      console.log('Sample data[0]:', data[0]);
      console.log('Data negeriCode values:', [...new Set(data.map(d => d.negeriCode))]);
    }
    
    if (schools.length > 0) {
      console.log('Sample schools[0]:', schools[0]);
      console.log('Schools negeriCode values:', [...new Set(schools.map(s => s.negeriCode))]);
    }
  }, [negeriCode, negeriName, data, schools, daerahList]);

  // Filter data untuk negeri ini sahaja
  const filteredData = data.filter(d => d.negeriCode === negeriCode);
  const filteredSchools = schools.filter(s => s.negeriCode === negeriCode);
  const filteredDaerah = daerahList.filter(d => d.negeriCode === negeriCode);
  
  console.log('Filtered results:', {
    filteredData: filteredData.length,
    filteredSchools: filteredSchools.length,
    filteredDaerah: filteredDaerah.length
  });

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
    { id: 'dashboard', label: 'Rumusan Data', icon: LayoutDashboard, allowed: true },
    { id: 'analytics', label: 'Analitik', icon: BarChart3, allowed: true },
    { id: 'daerah', label: 'Senarai Daerah', icon: MapPin, allowed: true },
    { id: 'schools', label: 'Urus Sekolah', icon: School, allowed: true },
    { id: 'admins', label: 'Urus Admin Daerah', icon: Users, allowed: true },
    { id: 'badges', label: 'Urus Lencana', icon: Medal, allowed: true },
    { id: 'history', label: 'Semakan Rekod', icon: History, allowed: true },
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
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 shadow-lg bg-blue-600 shadow-blue-900/50">
                  <Shield size={24} className="text-white" />
              </div>
              {isDesktopSidebarOpen && (
                  <div className="animate-[fadeIn_0.2s_ease-out]">
                    <h2 className="font-bold text-white text-lg tracking-tight">Panel Admin</h2>
                    <p className="text-[10px] font-mono mt-1 tracking-wider uppercase px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                        PENTADBIR NEGERI
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
            {/* TAB DAERAH - Senarai semua daerah dalam negeri */}
            {tab === 'daerah' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                    <MapPin className="text-blue-600" />
                    Senarai Daerah di {negeriName}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredDaerah.map((daerah, idx) => (
                      <div key={idx} className="border rounded-lg p-4 hover:shadow-md transition">
                        <div className="font-bold text-lg">{daerah.name}</div>
                        <div className="text-sm text-gray-500">Kod: {daerah.code}</div>
                        <div className="text-xs text-gray-400 mt-2">
                          {filteredSchools.filter(s => s.daerahCode === daerah.code).length} sekolah
                        </div>
                      </div>
                    ))}
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
                  
                  {/* TODO: Add form to create admin daerah */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                    <p className="text-sm text-blue-800">
                      🚧 Feature dalam pembangunan - Admin Negeri akan boleh create Admin Daerah di sini
                    </p>
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
                   onRefresh={refreshData} 
                 />
              </div>
            )}
            
            {tab === 'badges' && (
              <div className="animate-[fadeIn_0.2s_ease-out] print:hidden">
                 <AdminBadges badges={badges} scriptUrl={scriptUrl} onRefresh={refreshData} />
              </div>
            )}

            {tab === 'history' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                  <AdminHistory data={filteredData} />
              </div>
            )}

            {tab === 'dashboard' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                 <AdminDashboard data={filteredData} schools={filteredSchools} badges={badges} onDelete={deleteData} />
              </div>
            )}

            {tab === 'analytics' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                  <AnalyticsDashboard allData={filteredData} badges={badges} />
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

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Key size={20} className="text-blue-600" />
                Tukar Kata Laluan Admin Negeri
              </h3>
              <button 
                onClick={() => setShowPasswordModal(false)}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Kata Laluan Baru
                </label>
                <input
                  type="password"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Masukkan kata laluan baru"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Sahkan Kata Laluan
                </label>
                <input
                  type="password"
                  value={confirmAdminPassword}
                  onChange={(e) => setConfirmAdminPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Masukkan semula kata laluan"
                />
              </div>
              
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowPasswordModal(false);
                    setNewAdminPassword('');
                    setConfirmAdminPassword('');
                  }}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                >
                  Batal
                </button>
                <button
                  onClick={handleChangeAdminPassword}
                  disabled={passwordLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {passwordLoading ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Sedang Proses...
                    </>
                  ) : (
                    'Simpan'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminNegeriPanel;
