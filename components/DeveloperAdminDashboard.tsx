import React, { useState, useEffect } from 'react';
import { Settings, Lock, Unlock, Users, Database, LogOut, AlertCircle, Eye, EyeOff, MapPin, Activity, BarChart3, Download, Trash2, Plus, CheckCircle, XCircle, Clock } from 'lucide-react';

interface District {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  paymentStatus: 'paid' | 'pending' | 'overdue';
  userAccess: boolean;
  adminAccess: boolean;
  districtAccess: boolean;
  usersCount: number;
  submissionsCount: number;
  lastActivity?: string;
}

interface ActivityLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  result: 'success' | 'blocked' | 'warning';
  details?: string;
}

interface DeveloperAdminDashboardProps {
  onLogout: () => void;
  scriptUrl: string;
  setScriptUrl: (url: string) => void;
  onOpenHierarchy: () => void;
}

type TabType = 'system' | 'districts' | 'logs' | 'tools';

export function DeveloperAdminDashboard({ onLogout, scriptUrl, setScriptUrl, onOpenHierarchy }: DeveloperAdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('system');
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(localStorage.getItem('maintenanceMode') === 'true');
  const [userAccessEnabled, setUserAccessEnabled] = useState(localStorage.getItem('userAccess') !== 'false');
  const [adminAccessEnabled, setAdminAccessEnabled] = useState(localStorage.getItem('adminAccess') !== 'false');
  const [districtAccessEnabled, setDistrictAccessEnabled] = useState(localStorage.getItem('districtAccess') !== 'false');
  const [urlInput, setUrlInput] = useState(scriptUrl);
  const [successMessage, setSuccessMessage] = useState('');

  // Developer Password Change
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // District Management
  const [districts, setDistricts] = useState<District[]>([
    {
      id: '1',
      name: 'Kuala Lumpur',
      status: 'active',
      paymentStatus: 'paid',
      userAccess: true,
      adminAccess: true,
      districtAccess: true,
      usersCount: 245,
      submissionsCount: 1230,
      lastActivity: '2 mins ago'
    },
    {
      id: '2',
      name: 'Selangor',
      status: 'active',
      paymentStatus: 'pending',
      userAccess: true,
      adminAccess: false,
      districtAccess: true,
      usersCount: 189,
      submissionsCount: 890,
      lastActivity: '15 mins ago'
    }
  ]);

  // Activity Logs
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([
    {
      id: '1',
      timestamp: new Date().toLocaleString(),
      user: 'Admin - Kuala Lumpur',
      action: 'Login',
      result: 'success',
      details: 'Successful admin login from 192.168.1.100'
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 300000).toLocaleString(),
      user: 'Unknown',
      action: 'Login Attempt',
      result: 'blocked',
      details: 'User access disabled in system'
    }
  ]);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  // Download config.json for Firebase deployment
  const handleDownloadConfig = () => {
    const config = {
      maintenance: maintenanceEnabled,
      userAccess: userAccessEnabled,
      adminAccess: adminAccessEnabled,
      districtAccess: districtAccessEnabled,
      lastUpdated: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addActivityLog('Developer', 'Config Download', 'success', 'Downloaded config.json for deployment');
    showSuccess('Config file downloaded! Place in public/ folder before deployment');
  };

  // System Settings Handlers
  const handleMaintenanceToggle = () => {
    const newState = !maintenanceEnabled;
    if (newState) {
      localStorage.setItem('maintenanceMode', 'true');
    } else {
      localStorage.removeItem('maintenanceMode');
    }
    setMaintenanceEnabled(newState);
    addActivityLog('Developer', 'System Change', 'success', `Maintenance mode ${newState ? 'enabled' : 'disabled'}`);
    showSuccess(`Maintenance mode ${newState ? 'ENABLED' : 'DISABLED'}`);
  };

  const handleUserAccessToggle = () => {
    const newState = !userAccessEnabled;
    localStorage.setItem('userAccess', newState.toString());
    setUserAccessEnabled(newState);
    addActivityLog('Developer', 'Access Control', 'success', `User access ${newState ? 'enabled' : 'disabled'}`);
    showSuccess(`User access ${newState ? 'ENABLED' : 'DISABLED'}`);
  };

  const handleAdminAccessToggle = () => {
    const newState = !adminAccessEnabled;
    localStorage.setItem('adminAccess', newState.toString());
    setAdminAccessEnabled(newState);
    addActivityLog('Developer', 'Access Control', 'success', `Admin access ${newState ? 'enabled' : 'disabled'}`);
    showSuccess(`Admin access ${newState ? 'ENABLED' : 'DISABLED'}`);
  };

  const handleDistrictAccessToggle = () => {
    const newState = !districtAccessEnabled;
    localStorage.setItem('districtAccess', newState.toString());
    setDistrictAccessEnabled(newState);
    addActivityLog('Developer', 'Access Control', 'success', `District access ${newState ? 'enabled' : 'disabled'}`);
    showSuccess(`District access ${newState ? 'ENABLED' : 'DISABLED'}`);
  };

  const handleUpdateUrl = () => {
    if (urlInput.trim()) {
      localStorage.setItem('SCRIPT_URL', urlInput.trim());
      setScriptUrl(urlInput.trim());
      addActivityLog('Developer', 'System Change', 'success', 'Database URL updated');
      showSuccess('Database URL updated successfully');
    }
  };

  const handleChangePassword = () => {
    setPasswordError('');
    const storedPassword = localStorage.getItem('DEV_PASSWORD') || 'Dev@123456';
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Sila isi semua medan');
      return;
    }

    if (currentPassword !== storedPassword) {
      setPasswordError('Kata laluan semasa tidak betul');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Kata laluan baru tidak sepadan');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('Kata laluan baru mesti sekurang-kurangnya 6 aksara');
      return;
    }

    localStorage.setItem('DEV_PASSWORD', newPassword);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPasswordChange(false);
    addActivityLog('Developer', 'Security', 'success', 'Developer password changed');
    showSuccess('Developer password updated successfully');
  };

  const toggleDistrictAccess = (districtId: string, accessType: 'user' | 'admin' | 'district') => {
    setDistricts(districts.map(d => {
      if (d.id === districtId) {
        const updated = { ...d };
        if (accessType === 'user') updated.userAccess = !updated.userAccess;
        if (accessType === 'admin') updated.adminAccess = !updated.adminAccess;
        if (accessType === 'district') updated.districtAccess = !updated.districtAccess;
        addActivityLog('Developer', 'District Control', 'success', `${d.name}: ${accessType} access toggled`);
        return updated;
      }
      return d;
    }));
  };

  const addActivityLog = (user: string, action: string, result: 'success' | 'blocked' | 'warning', details: string) => {
    const newLog: ActivityLog = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleString(),
      user,
      action,
      result,
      details
    };
    setActivityLogs([newLog, ...activityLogs.slice(0, 99)]);
  };

  const getResultColor = (result: string) => {
    if (result === 'success') return 'text-green-600';
    if (result === 'blocked') return 'text-red-600';
    return 'text-yellow-600';
  };

  const getResultIcon = (result: string) => {
    if (result === 'success') return <CheckCircle size={16} />;
    if (result === 'blocked') return <XCircle size={16} />;
    return <AlertCircle size={16} />;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-3 md:p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6 md:mb-8">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6 md:mb-8 pb-4 md:pb-6 border-b border-slate-700">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 mb-1 md:mb-2">
              Developer Admin Dashboard
            </h1>
            <p className="text-slate-400 text-sm md:text-base">Complete system administration and monitoring</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenHierarchy}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 md:px-6 py-2 md:py-3 rounded-lg font-semibold text-sm md:text-base"
            >
              <MapPin size={18} className="md:w-5 md:h-5" /> Urus Hierarki
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 md:px-6 py-2 md:py-3 rounded-lg font-semibold text-sm md:text-base"
            >
              <LogOut size={18} className="md:w-5 md:h-5" /> Logout
            </button>
          </div>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mb-6 p-4 bg-green-100 border border-green-500 text-green-800 rounded-lg flex items-center gap-3">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            {successMessage}
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex gap-2 md:gap-4 border-b border-slate-700 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setActiveTab('system')}
            className={`flex items-center gap-2 px-3 md:px-4 py-3 font-semibold border-b-2 whitespace-nowrap text-sm md:text-base ${
              activeTab === 'system'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            <Settings size={18} className="md:w-5 md:h-5" /> <span className="hidden sm:inline">System Settings</span><span className="sm:hidden">System</span>
          </button>
          <button
            onClick={() => setActiveTab('districts')}
            className={`flex items-center gap-2 px-3 md:px-4 py-3 font-semibold border-b-2 whitespace-nowrap text-sm md:text-base ${
              activeTab === 'districts'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            <MapPin size={18} className="md:w-5 md:h-5" /> Districts
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 px-3 md:px-4 py-3 font-semibold border-b-2 whitespace-nowrap text-sm md:text-base ${
              activeTab === 'logs'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            <Activity size={18} className="md:w-5 md:h-5" /> <span className="hidden sm:inline">Activity Logs</span><span className="sm:hidden">Logs</span>
          </button>
          <button
            onClick={() => setActiveTab('tools')}
            className={`flex items-center gap-2 px-3 md:px-4 py-3 font-semibold border-b-2 whitespace-nowrap text-sm md:text-base ${
              activeTab === 'tools'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            <Download size={18} className="md:w-5 md:h-5" /> <span className="hidden sm:inline">Data Tools</span><span className="sm:hidden">Tools</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto">
        {/* System Settings Tab */}
        {activeTab === 'system' && (
          <div className="space-y-6">
            {/* System Status */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-sm">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <BarChart3 className="text-cyan-600" size={24} /> System Status
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-700/50 p-4 rounded-lg">
                  <p className="text-slate-400 text-sm mb-2">Maintenance</p>
                  <p className={`font-bold text-lg ${maintenanceEnabled ? 'text-red-600' : 'text-green-600'}`}>
                    {maintenanceEnabled ? 'ACTIVE' : 'OFF'}
                  </p>
                </div>
                <div className="bg-slate-700/50 p-4 rounded-lg">
                  <p className="text-slate-400 text-sm mb-2">User Access</p>
                  <p className={`font-bold text-lg ${userAccessEnabled ? 'text-green-600' : 'text-red-600'}`}>
                    {userAccessEnabled ? 'OPEN' : 'CLOSED'}
                  </p>
                </div>
                <div className="bg-slate-700/50 p-4 rounded-lg">
                  <p className="text-slate-400 text-sm mb-2">Admin Access</p>
                  <p className={`font-bold text-lg ${adminAccessEnabled ? 'text-green-600' : 'text-red-600'}`}>
                    {adminAccessEnabled ? 'OPEN' : 'CLOSED'}
                  </p>
                </div>
                <div className="bg-slate-700/50 p-4 rounded-lg">
                  <p className="text-slate-400 text-sm mb-2">District Access</p>
                  <p className={`font-bold text-lg ${districtAccessEnabled ? 'text-green-600' : 'text-red-600'}`}>
                    {districtAccessEnabled ? 'OPEN' : 'CLOSED'}
                  </p>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Maintenance Mode */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <AlertCircle className="text-amber-600" size={24} />
                  <h3 className="text-xl font-bold">Maintenance Mode</h3>
                </div>
                <p className="text-slate-400 mb-4">Show maintenance page to all users</p>
                <button
                  onClick={handleMaintenanceToggle}
                  className={`w-full py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 ${
                    maintenanceEnabled
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-gray-300 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  {maintenanceEnabled ? (
                    <>
                      <AlertCircle size={20} /> MAINTENANCE ACTIVE
                    </>
                  ) : (
                    <>
                      <Clock size={20} /> ENABLE MAINTENANCE
                    </>
                  )}
                </button>
              </div>

              {/* User Access Control */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <Users className="text-blue-600" size={24} />
                  <h3 className="text-xl font-bold">User Access</h3>
                </div>
                <p className="text-slate-400 mb-4">Control public user registration & login</p>
                <button
                  onClick={handleUserAccessToggle}
                  className={`w-full py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 ${
                    userAccessEnabled
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-300 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  {userAccessEnabled ? (
                    <>
                      <Unlock size={20} /> ENABLED
                    </>
                  ) : (
                    <>
                      <Lock size={20} /> DISABLED
                    </>
                  )}
                </button>
              </div>

              {/* Admin Access Control */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <Lock className="text-purple-600" size={24} />
                  <h3 className="text-xl font-bold">Admin Access</h3>
                </div>
                <p className="text-slate-400 mb-4">Control admin panel access</p>
                <button
                  onClick={handleAdminAccessToggle}
                  className={`w-full py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 ${
                    adminAccessEnabled
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-300 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  {adminAccessEnabled ? (
                    <>
                      <Unlock size={20} /> ENABLED
                    </>
                  ) : (
                    <>
                      <Lock size={20} /> DISABLED
                    </>
                  )}
                </button>
              </div>

              {/* District Access Control */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <MapPin className="text-indigo-600" size={24} />
                  <h3 className="text-xl font-bold">District Access</h3>
                </div>
                <p className="text-slate-400 mb-4">Control district panel access</p>
                <button
                  onClick={handleDistrictAccessToggle}
                  className={`w-full py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 ${
                    districtAccessEnabled
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-300 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  {districtAccessEnabled ? (
                    <>
                      <Unlock size={20} /> ENABLED
                    </>
                  ) : (
                    <>
                      <Lock size={20} /> DISABLED
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Database Configuration */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <Database className="text-cyan-600" size={24} />
                <h3 className="text-xl font-bold">Database Configuration</h3>
              </div>
              <p className="text-slate-400 mb-4">
                Current URL: <span className="text-cyan-600 font-mono text-sm break-all">{scriptUrl}</span>
              </p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="Enter Apps Script URL"
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg placeholder-slate-400 focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={handleUpdateUrl}
                  className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-semibold"
                >
                  Update Database URL
                </button>
              </div>
            </div>

            {/* Deployment Configuration for Firebase */}
            <div className="bg-gradient-to-r from-orange-900/30 to-red-900/30 border border-orange-700 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="text-orange-600" size={24} />
                  <h3 className="text-xl font-bold">Firebase Deployment Config</h3>
                </div>
                <button
                  onClick={handleDownloadConfig}
                  className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg font-semibold"
                >
                  <Download size={18} /> Download config.json
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="bg-slate-800 p-4 rounded-lg border border-orange-300">
                  <p className="text-sm font-semibold text-slate-300 mb-2">Current Configuration:</p>
                  <pre className="text-xs font-mono text-slate-200 bg-slate-700 p-3 rounded overflow-x-auto">
{JSON.stringify({
  maintenance: maintenanceEnabled,
  userAccess: userAccessEnabled,
  adminAccess: adminAccessEnabled,
  districtAccess: districtAccessEnabled,
  lastUpdated: new Date().toISOString()
}, null, 2)}
                  </pre>
                </div>

                <div className="bg-amber-100 border border-amber-400 rounded-lg p-4">
                  <p className="text-sm font-semibold text-amber-900 mb-2">📋 Cara Deploy ke Firebase:</p>
                  <ol className="text-sm text-amber-900 space-y-2 list-decimal list-inside">
                    <li>Klik butang <strong>"Download config.json"</strong> di atas</li>
                    <li>Copy file <code className="bg-amber-200 px-2 py-1 rounded">config.json</code> ke folder <code className="bg-amber-200 px-2 py-1 rounded">public/</code></li>
                    <li>Run command: <code className="bg-amber-200 px-2 py-1 rounded">npm run build</code></li>
                    <li>Deploy ke Firebase: <code className="bg-amber-200 px-2 py-1 rounded">firebase deploy</code></li>
                  </ol>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="bg-slate-800 p-3 rounded border border-slate-600">
                    <span className="font-semibold text-slate-300">Maintenance:</span>
                    <p className={`font-bold ${maintenanceEnabled ? 'text-red-600' : 'text-green-600'}`}>
                      {maintenanceEnabled ? 'ON' : 'OFF'}
                    </p>
                  </div>
                  <div className="bg-slate-800 p-3 rounded border border-slate-600">
                    <span className="font-semibold text-slate-300">User Access:</span>
                    <p className={`font-bold ${userAccessEnabled ? 'text-green-600' : 'text-red-600'}`}>
                      {userAccessEnabled ? 'OPEN' : 'CLOSED'}
                    </p>
                  </div>
                  <div className="bg-slate-800 p-3 rounded border border-slate-600">
                    <span className="font-semibold text-slate-300">Admin Access:</span>
                    <p className={`font-bold ${adminAccessEnabled ? 'text-green-600' : 'text-red-600'}`}>
                      {adminAccessEnabled ? 'OPEN' : 'CLOSED'}
                    </p>
                  </div>
                  <div className="bg-slate-800 p-3 rounded border border-slate-600">
                    <span className="font-semibold text-slate-300">District Access:</span>
                    <p className={`font-bold ${districtAccessEnabled ? 'text-green-600' : 'text-red-600'}`}>
                      {districtAccessEnabled ? 'OPEN' : 'CLOSED'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Security - Password Change */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <Lock className="text-green-600" size={24} />
                <h3 className="text-xl font-bold">Security</h3>
              </div>
              <p className="text-slate-400 mb-6">Manage developer credentials</p>
              
              {!showPasswordChange ? (
                <button
                  onClick={() => {
                    setShowPasswordChange(true);
                    setPasswordError('');
                  }}
                  className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold"
                >
                  Change Developer Password
                </button>
              ) : (
                <div className="bg-slate-700/50 p-6 rounded-lg space-y-4">
                  <h4 className="text-lg font-semibold text-green-600 mb-4">Change Developer Password</h4>
                  
                  {passwordError && (
                    <div className="p-3 bg-red-100 border border-red-500 text-red-800 rounded-lg text-sm">
                      {passwordError}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Current Password</label>
                    <div className="relative">
                      <input
                        type={showCurrentPass ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg placeholder-slate-400 focus:outline-none focus:border-green-500 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPass(!showCurrentPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                      >
                        {showCurrentPass ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">New Password</label>
                    <div className="relative">
                      <input
                        type={showNewPass ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg placeholder-slate-400 focus:outline-none focus:border-green-500 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPass(!showNewPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                      >
                        {showNewPass ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Confirm Password</label>
                    <div className="relative">
                      <input
                        type={showConfirmPass ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg placeholder-slate-400 focus:outline-none focus:border-green-500 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPass(!showConfirmPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                      >
                        {showConfirmPass ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={handleChangePassword}
                      className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold"
                    >
                      Save New Password
                    </button>
                    <button
                      onClick={() => {
                        setShowPasswordChange(false);
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                        setPasswordError('');
                      }}
                      className="flex-1 px-4 py-2 bg-gray-400 hover:bg-slate-600 text-white rounded-lg font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Districts Tab */}
        {activeTab === 'districts' && (
          <div className="space-y-6">
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-3">
                  <MapPin className="text-indigo-600" size={24} /> District Management
                </h2>
                <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold">
                  <Plus size={20} /> Add District
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-600">
                    <tr>
                      <th className="text-left py-3 px-4 font-semibold">District</th>
                      <th className="text-left py-3 px-4 font-semibold">Status</th>
                      <th className="text-left py-3 px-4 font-semibold">Payment</th>
                      <th className="text-left py-3 px-4 font-semibold">User Access</th>
                      <th className="text-left py-3 px-4 font-semibold">Admin Access</th>
                      <th className="text-left py-3 px-4 font-semibold">Users</th>
                      <th className="text-left py-3 px-4 font-semibold">Submissions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {districts.map((district) => (
                      <tr key={district.id} className="border-b border-slate-700 hover:bg-gray-50/50">
                        <td className="py-3 px-4 font-semibold">{district.name}</td>
                        <td className="py-3 px-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            district.status === 'active' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {district.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            district.paymentStatus === 'paid'
                              ? 'bg-green-100 text-green-800'
                              : district.paymentStatus === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {district.paymentStatus.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => toggleDistrictAccess(district.id, 'user')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                              district.userAccess
                                ? 'bg-green-100 text-green-800 hover:bg-green-200/50'
                                : 'bg-red-100 text-red-800 hover:bg-red-200/50'
                            }`}
                          >
                            {district.userAccess ? 'OPEN' : 'CLOSED'}
                          </button>
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => toggleDistrictAccess(district.id, 'admin')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                              district.adminAccess
                                ? 'bg-green-100 text-green-800 hover:bg-green-200/50'
                                : 'bg-red-100 text-red-800 hover:bg-red-200/50'
                            }`}
                          >
                            {district.adminAccess ? 'OPEN' : 'CLOSED'}
                          </button>
                        </td>
                        <td className="py-3 px-4">{district.usersCount}</td>
                        <td className="py-3 px-4">{district.submissionsCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-slate-400 text-center text-sm">
              💡 District management system ready for expansion - connect to backend API for full functionality
            </p>
          </div>
        )}

        {/* Activity Logs Tab */}
        {activeTab === 'logs' && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-sm">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <Activity className="text-green-600" size={24} /> Activity Logs
            </h2>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {activityLogs.map((log) => (
                <div key={log.id} className="bg-slate-700/50 p-4 rounded-lg border border-slate-600 hover:border-gray-300">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`flex items-center ${getResultColor(log.result)}`}>
                          {getResultIcon(log.result)}
                        </div>
                        <span className="font-semibold">{log.user}</span>
                        <span className="text-slate-400 text-sm">{log.action}</span>
                      </div>
                      <p className="text-slate-400 text-sm">{log.details}</p>
                      <p className="text-slate-500 text-xs mt-2">{log.timestamp}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                      log.result === 'success'
                        ? 'bg-green-100 text-green-800'
                        : log.result === 'blocked'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {log.result.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Data Tools Tab */}
        {activeTab === 'tools' && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <Download className="text-blue-600" size={24} />
                <h3 className="text-xl font-bold">Export Data</h3>
              </div>
              <p className="text-slate-400 mb-6">Export system data to CSV/Excel format</p>
              <button className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold">
                Export All Data
              </button>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <Trash2 className="text-red-600" size={24} />
                <h3 className="text-xl font-bold">Cleanup</h3>
              </div>
              <p className="text-slate-400 mb-6">Remove old records and clear cache</p>
              <button className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold">
                Cleanup Old Data
              </button>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <Database className="text-green-600" size={24} />
                <h3 className="text-xl font-bold">Backup</h3>
              </div>
              <p className="text-slate-400 mb-6">Create system backup for safety</p>
              <button className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold">
                Create Backup
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



