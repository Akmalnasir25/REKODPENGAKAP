import React, { useState } from 'react';
import { Settings, Power, Lock, Unlock, Users, Database, LogOut, AlertCircle, Eye, EyeOff, MapPin } from 'lucide-react';

interface DeveloperPanelProps {
  onLogout: () => void;
  scriptUrl: string;
  setScriptUrl: (url: string) => void;
  onOpenHierarchy?: () => void;
}

export function DeveloperPanel({ onLogout, scriptUrl, setScriptUrl, onOpenHierarchy }: DeveloperPanelProps) {
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(localStorage.getItem('maintenanceMode') === 'true');
  const [userAccessEnabled, setUserAccessEnabled] = useState(localStorage.getItem('userAccess') !== 'false');
  const [adminAccessEnabled, setAdminAccessEnabled] = useState(localStorage.getItem('adminAccess') !== 'false');
  const [districtAccessEnabled, setDistrictAccessEnabled] = useState(localStorage.getItem('districtAccess') !== 'false');
  const [urlInput, setUrlInput] = useState(scriptUrl);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleMaintenanceToggle = () => {
    const newState = !maintenanceEnabled;
    if (newState) {
      localStorage.setItem('maintenanceMode', 'true');
    } else {
      localStorage.removeItem('maintenanceMode');
    }
    setMaintenanceEnabled(newState);
    showSuccess(`Maintenance mode ${newState ? 'ENABLED' : 'DISABLED'}`);
  };

  const handleUserAccessToggle = () => {
    const newState = !userAccessEnabled;
    localStorage.setItem('userAccess', newState.toString());
    setUserAccessEnabled(newState);
    showSuccess(`User access ${newState ? 'ENABLED' : 'DISABLED'}`);
  };

  const handleAdminAccessToggle = () => {
    const newState = !adminAccessEnabled;
    localStorage.setItem('adminAccess', newState.toString());
    setAdminAccessEnabled(newState);
    showSuccess(`Admin access ${newState ? 'ENABLED' : 'DISABLED'}`);
  };

  const handleDistrictAccessToggle = () => {
    const newState = !districtAccessEnabled;
    localStorage.setItem('districtAccess', newState.toString());
    setDistrictAccessEnabled(newState);
    showSuccess(`District access ${newState ? 'ENABLED' : 'DISABLED'}`);
  };

  const handleUpdateUrl = () => {
    if (urlInput.trim()) {
      localStorage.setItem('SCRIPT_URL', urlInput.trim());
      setScriptUrl(urlInput.trim());
      showSuccess('Database URL updated successfully');
    }
  };

  const handleClearAllData = () => {
    localStorage.clear();
    setShowConfirmDelete(false);
    showSuccess('All local data cleared');
    setTimeout(() => window.location.reload(), 1000);
  };

  const handleChangePassword = () => {
    setPasswordError('');
    
    // Get stored credentials
    const storedPassword = localStorage.getItem('DEV_PASSWORD') || 'Dev@123456';
    
    // Validate inputs
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

    // Update password
    localStorage.setItem('DEV_PASSWORD', newPassword);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPasswordChange(false);
    showSuccess('Developer password updated successfully');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex justify-between items-center mb-8 pb-6 border-b border-slate-700">
          <div>
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 mb-2">
              Developer Control Panel
            </h1>
            <p className="text-slate-400">System administration and maintenance controls</p>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            <LogOut size={20} /> Logout
          </button>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mb-6 p-4 bg-green-900/30 border border-green-500 text-green-300 rounded-lg flex items-center gap-3">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            {successMessage}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Hierarchical System Management */}
        {onOpenHierarchy && (
          <div className="bg-gradient-to-br from-purple-900 to-indigo-900 border border-purple-500 rounded-xl p-6 hover:border-purple-400 transition-colors lg:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <MapPin className="text-purple-300" size={28} />
                  <h2 className="text-2xl font-bold">Pengurusan Sistem Hierarki</h2>
                </div>
                <p className="text-purple-200 mb-4">
                  Urus Negeri, Daerah dan Admin Regional untuk sistem seluruh negara
                </p>
              </div>
              <button
                onClick={onOpenHierarchy}
                className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 rounded-lg font-bold text-lg transition-colors flex items-center gap-3 shadow-lg hover:shadow-purple-500/50"
              >
                <MapPin size={24} />
                Buka Dashboard Hierarki
              </button>
            </div>
          </div>
        )}

        {/* Maintenance Mode Section */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 hover:border-amber-500/50 transition-colors">
          <div className="flex items-center gap-3 mb-4">
            <Power className="text-amber-400" size={24} />
            <h2 className="text-2xl font-bold">Maintenance Mode</h2>
          </div>
          <p className="text-slate-400 mb-6">
            Enable to show "Sistem Sedang Diselenggara" to public users. Admin can bypass with ?admin=true
          </p>
          <button
            onClick={handleMaintenanceToggle}
            className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
              maintenanceEnabled
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
            }`}
          >
            {maintenanceEnabled ? (
              <>
                <AlertCircle size={20} /> MAINTENANCE ENABLED
              </>
            ) : (
              <>
                <Power size={20} /> ENABLE MAINTENANCE
              </>
            )}
          </button>
        </div>

        {/* User Access Section */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 hover:border-blue-500/50 transition-colors">
          <div className="flex items-center gap-3 mb-4">
            <Users className="text-blue-400" size={24} />
            <h2 className="text-2xl font-bold">User Access</h2>
          </div>
          <p className="text-slate-400 mb-6">
            Control public user registration and dashboard access
          </p>
          <button
            onClick={handleUserAccessToggle}
            className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
              userAccessEnabled
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
            }`}
          >
            {userAccessEnabled ? (
              <>
                <Unlock size={20} /> USER ACCESS ENABLED
              </>
            ) : (
              <>
                <Lock size={20} /> USER ACCESS DISABLED
              </>
            )}
          </button>
        </div>

        {/* Admin Access Section */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 hover:border-purple-500/50 transition-colors">
          <div className="flex items-center gap-3 mb-4">
            <Lock className="text-purple-400" size={24} />
            <h2 className="text-2xl font-bold">Admin Access</h2>
          </div>
          <p className="text-slate-400 mb-6">
            Control system administrator access and permissions
          </p>
          <button
            onClick={handleAdminAccessToggle}
            className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
              adminAccessEnabled
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
            }`}
          >
            {adminAccessEnabled ? (
              <>
                <Unlock size={20} /> ADMIN ACCESS ENABLED
              </>
            ) : (
              <>
                <Lock size={20} /> ADMIN ACCESS DISABLED
              </>
            )}
          </button>
        </div>

        {/* District Access Section */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 hover:border-indigo-500/50 transition-colors">
          <div className="flex items-center gap-3 mb-4">
            <Settings className="text-indigo-400" size={24} />
            <h2 className="text-2xl font-bold">District Access</h2>
          </div>
          <p className="text-slate-400 mb-6">
            Control district administrator access
          </p>
          <button
            onClick={handleDistrictAccessToggle}
            className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
              districtAccessEnabled
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
            }`}
          >
            {districtAccessEnabled ? (
              <>
                <Unlock size={20} /> DISTRICT ACCESS ENABLED
              </>
            ) : (
              <>
                <Lock size={20} /> DISTRICT ACCESS DISABLED
              </>
            )}
          </button>
        </div>
      </div>

      {/* Database Configuration */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Database className="text-cyan-400" size={24} />
            <h2 className="text-2xl font-bold">Database Configuration</h2>
          </div>
          <p className="text-slate-400 mb-4">
            Current URL: <span className="text-cyan-400 font-mono text-sm break-all">{scriptUrl}</span>
          </p>
          <div className="space-y-3">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Enter Apps Script URL"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={handleUpdateUrl}
              className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-semibold transition-colors"
            >
              Update Database URL
            </button>
          </div>
        </div>
      </div>

      {/* Security - Developer Password */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Lock className="text-green-400" size={24} />
            <h2 className="text-2xl font-bold">Security</h2>
          </div>
          <p className="text-slate-400 mb-6">
            Manage developer credentials
          </p>
          
          {!showPasswordChange ? (
            <button
              onClick={() => {
                setShowPasswordChange(true);
                setPasswordError('');
              }}
              className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
            >
              Change Developer Password
            </button>
          ) : (
            <div className="bg-slate-700/50 p-6 rounded-lg space-y-4">
              <h3 className="text-lg font-semibold text-green-400 mb-4">Change Developer Password</h3>
              
              {passwordError && (
                <div className="p-3 bg-red-900/30 border border-red-500 text-red-300 rounded-lg text-sm">
                  {passwordError}
                </div>
              )}

              {/* Current Password */}
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPass ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg placeholder-slate-500 focus:outline-none focus:border-green-500 pr-10"
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

              {/* New Password */}
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNewPass ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg placeholder-slate-500 focus:outline-none focus:border-green-500 pr-10"
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

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPass ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg placeholder-slate-500 focus:outline-none focus:border-green-500 pr-10"
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

              {/* Buttons */}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleChangePassword}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
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
                  className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* System Status Summary */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <Settings size={24} /> System Status
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-700/50 p-4 rounded-lg">
              <p className="text-slate-400 text-sm mb-2">Maintenance</p>
              <p className={`font-bold text-lg ${maintenanceEnabled ? 'text-red-400' : 'text-green-400'}`}>
                {maintenanceEnabled ? 'ACTIVE' : 'OFF'}
              </p>
            </div>
            <div className="bg-slate-700/50 p-4 rounded-lg">
              <p className="text-slate-400 text-sm mb-2">User Access</p>
              <p className={`font-bold text-lg ${userAccessEnabled ? 'text-green-400' : 'text-red-400'}`}>
                {userAccessEnabled ? 'OPEN' : 'CLOSED'}
              </p>
            </div>
            <div className="bg-slate-700/50 p-4 rounded-lg">
              <p className="text-slate-400 text-sm mb-2">Admin Access</p>
              <p className={`font-bold text-lg ${adminAccessEnabled ? 'text-green-400' : 'text-red-400'}`}>
                {adminAccessEnabled ? 'OPEN' : 'CLOSED'}
              </p>
            </div>
            <div className="bg-slate-700/50 p-4 rounded-lg">
              <p className="text-slate-400 text-sm mb-2">District Access</p>
              <p className={`font-bold text-lg ${districtAccessEnabled ? 'text-green-400' : 'text-red-400'}`}>
                {districtAccessEnabled ? 'OPEN' : 'CLOSED'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="max-w-6xl mx-auto">
        <div className="bg-slate-800 border-2 border-red-600/50 rounded-xl p-6">
          <h2 className="text-2xl font-bold mb-4 text-red-400 flex items-center gap-2">
            <AlertCircle size={24} /> Danger Zone
          </h2>
          
          {!showConfirmDelete ? (
            <button
              onClick={() => setShowConfirmDelete(true)}
              className="w-full px-4 py-3 bg-red-600/20 border border-red-600 text-red-400 hover:bg-red-600/30 rounded-lg font-semibold transition-colors"
            >
              Clear All Local Data
            </button>
          ) : (
            <div className="space-y-3 p-4 bg-red-900/20 border border-red-600 rounded-lg">
              <p className="text-red-300 font-semibold">Are you sure? This will clear all local storage data.</p>
              <div className="flex gap-3">
                <button
                  onClick={handleClearAllData}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
                >
                  Yes, Clear All
                </button>
                <button
                  onClick={() => setShowConfirmDelete(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
