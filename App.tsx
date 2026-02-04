

import React, { useState, useEffect } from 'react';
import { UserForm } from './components/UserForm';
import { AdminPanel } from './components/AdminPanel';
import { AdminNegeriPanel } from './components/AdminNegeriPanel';
import { AdminDaerahPanel } from './components/AdminDaerahPanel';
import { AuthScreen } from './components/AuthScreen';
import { UserDashboard } from './components/UserDashboard';
import { MaintenancePage } from './components/MaintenancePage';
import { DeveloperPanel } from './components/DeveloperPanel';
import { DeveloperAdminDashboard } from './components/DeveloperAdminDashboard';
import { DeveloperDashboard } from './components/DeveloperDashboard';
import { fetchCloudData, deleteSubmission, loginAdmin, loginAdminRegional } from './services/api';
import { fetchServerCsrf } from './services/security';
import { DEFAULT_SERVER_URL, LOCAL_STORAGE_KEYS, LOGO_URL } from './constants';
import { SubmissionData, UserSession, Badge, School, UserProfile, Negeri, Daerah, AdminRegional } from './types';
import { WifiOff } from 'lucide-react';
import { generateCSRFToken, isSessionExpired, clearSessionActivity, updateSessionActivity } from './services/security';

// Helper functions for access control (independent of localStorage)
const getAccessState = async () => {
  // Priority: URL params > config.json (production) > localStorage (development)
  const params = new URLSearchParams(window.location.search);
  const userAccessParam = params.get('userAccess');
  const adminAccessParam = params.get('adminAccess');
  const districtAccessParam = params.get('districtAccess');
  const maintenanceParam = params.get('maintenance');
  
  // Try to fetch config.json for deployed instances (HIGHER PRIORITY than localStorage)
  let deployedConfig = null;
  try {
    const response = await fetch('/config.json?t=' + Date.now()); // Cache buster
    if (response.ok) {
      deployedConfig = await response.json();
      console.log('✅ Loaded config.json:', deployedConfig);
    }
  } catch (error) {
    console.log('ℹ️ Config file not found, using localStorage (development mode)');
  }
  
  // If config.json exists (production), use it. Otherwise fall back to localStorage (development)
  const useProduction = deployedConfig !== null;
  
  return {
    userAccess: userAccessParam ? userAccessParam === 'true' : 
                (useProduction ? deployedConfig.userAccess : localStorage.getItem('userAccess') !== 'false'),
    adminAccess: adminAccessParam ? adminAccessParam === 'true' : 
                 (useProduction ? deployedConfig.adminAccess : localStorage.getItem('adminAccess') !== 'false'),
    districtAccess: districtAccessParam ? districtAccessParam === 'true' : 
                    (useProduction ? deployedConfig.districtAccess : localStorage.getItem('districtAccess') !== 'false'),
    maintenance: maintenanceParam ? maintenanceParam === 'true' : 
                 (useProduction ? deployedConfig.maintenance : localStorage.getItem('maintenanceMode') === 'true')
  };
};

export default function App() {
  return <AppContent />;
}

function AppContent() {
  const [scriptUrl, setScriptUrl] = useState(DEFAULT_SERVER_URL);
  
  // Data State
  const [schoolsList, setSchoolsList] = useState<School[]>([]); 
  const [badges, setBadges] = useState<Badge[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [negeriList, setNegeriList] = useState<Negeri[]>([]);
  const [daerahList, setDaerahList] = useState<Daerah[]>([]);
  const [dashboardData, setDashboardData] = useState<SubmissionData[]>([]);
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(true);
  const [fetchingData, setFetchingData] = useState(false);
  const [connectionError, setConnectionError] = useState(false);

  // Auth State
  const [userSession, setUserSession] = useState<UserSession | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [adminRole, setAdminRole] = useState<'admin' | 'district' | null>(null);
  const [adminSession, setAdminSession] = useState<AdminRegional | null>(null);
  const [isDeveloperMode, setIsDeveloperMode] = useState(localStorage.getItem('developerSession') === 'true');

  // Access Control State
  const [accessState, setAccessState] = useState({
    userAccess: true,
    adminAccess: true,
    districtAccess: true,
    maintenance: false
  });

  // View State
  const [view, setView] = useState<'auth' | 'user_dashboard' | 'user_form' | 'admin' | 'developer' | 'developer_admin' | 'developer_hierarchy'>('auth');

  // Load access state on mount and when URL changes
  useEffect(() => {
    const loadAccessState = async () => {
      const state = await getAccessState();
      setAccessState(state);
    };
    loadAccessState();
    
    // Listen for URL parameter changes
    const handleUrlChange = () => {
      loadAccessState();
    };
    window.addEventListener('popstate', handleUrlChange);
    
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, []);

  // Initialization with Fallback Logic & Session Check
  const handleFetchData = async (url: string, role?: string, negeriCode?: string, daerahCode?: string): Promise<boolean> => {
    setFetchingData(true);
    setConnectionError(false);
    try {
      const result = await fetchCloudData(url, role, negeriCode, daerahCode);
      if (result && result.status === 'success') {
        if (result.schools) {
            setSchoolsList(result.schools
                .filter((s: any) => s !== null && s !== undefined) // SAFETY FILTER: Remove nulls
                .map((s: any) => {
                    if (typeof s === 'string') {
                        return { name: s, allowStudents: false, allowAssistants: false, allowExaminers: false };
                    }
                    return s;
            }));
        } else {
            setSchoolsList([]);
        }

        setDashboardData(result.submissions || []);
        
        if (result.badges) {
            setBadges(result.badges);
        } else if (result.badgeTypes) {
            setBadges(result.badgeTypes.map((b: string) => ({ name: b, isOpen: true })));
        } else {
            setBadges([]);
        }

        setUserProfiles(result.userProfiles || []);
        setNegeriList(result.negeriList || []);
        setDaerahList(result.daerahList || []);
        setIsRegistrationOpen(result.isRegistrationOpen !== undefined ? result.isRegistrationOpen : true);
        return true;
      } else {
        console.warn("Data fetched but status not success:", result);
        return false;
      }
    } catch (error) {
      console.error("Gagal ambil data:", error);
      setConnectionError(true);
      return false;
    } finally {
      setFetchingData(false);
    }
  };

  useEffect(() => {
    const initialize = async () => {
        let activeUrl = DEFAULT_SERVER_URL;
        
        // 1. Check URL Config
        const localUrl = localStorage.getItem(LOCAL_STORAGE_KEYS.SCRIPT_URL);
        const usingLocal = localUrl && localUrl.trim() !== "";
        if (usingLocal) activeUrl = localUrl!;
        setScriptUrl(activeUrl);
        
        // 2. Check User Session
        const savedSession = localStorage.getItem(LOCAL_STORAGE_KEYS.SESSION);
        let sessionRestored = false;
        if (savedSession) {
            try {
                const parsedSession = JSON.parse(savedSession);
                if (parsedSession && parsedSession.isLoggedIn) {
                    // Check if user access is enabled
                    const userAccessEnabled = localStorage.getItem('userAccess') !== 'false';
                    if (userAccessEnabled) {
                        setUserSession(parsedSession);
                        setView('user_dashboard');
                        sessionRestored = true;
                    } else {
                        // User access disabled, clear session
                        localStorage.removeItem(LOCAL_STORAGE_KEYS.SESSION);
                    }
                }
            } catch (e) {
                console.error("Failed to restore session", e);
                localStorage.removeItem(LOCAL_STORAGE_KEYS.SESSION);
            }
        }

        // 3. Fetch Data
        const success = await handleFetchData(activeUrl);
        
        if (!success && usingLocal && activeUrl !== DEFAULT_SERVER_URL) {
            console.warn("URL LocalStorage gagal. Mencuba URL Default...");
            setConnectionError(false);
            setScriptUrl(DEFAULT_SERVER_URL);
            await handleFetchData(DEFAULT_SERVER_URL);
        }

        setIsInitializing(false);
    };
    initialize();
  }, []);

  // Monitor access state changes from URL params or localStorage
  useEffect(() => {
    const handleStorageChange = async () => {
      const state = await getAccessState();
      setAccessState(state);
    };

    // Listen to URL changes
    const handlePopState = async () => {
      const state = await getAccessState();
      setAccessState(state);
    };

    // Listen to localStorage changes (from other tabs/windows)
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('popstate', handlePopState);

    // Periodic check for access changes
    const accessCheckInterval = setInterval(async () => {
      const state = await getAccessState();
      setAccessState(state);
    }, 2000); // Check every 2 seconds

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('popstate', handlePopState);
      clearInterval(accessCheckInterval);
    };
  }, []);

  // UPDATED: Now Async and calls API
  const handleAdminLogin = async (username: string, password: string): Promise<{success: boolean, message?: string}> => {
    try {
        // Check if admin or district access is disabled based on role hint
        const currentAccessState = await getAccessState();
        
        if (!currentAccessState.adminAccess && !currentAccessState.districtAccess) {
            return { success: false, message: 'Akses pentadbir sedang ditutup. Sila hubungi developer.' };
        }

        const csrfToken = generateCSRFToken();
        const result = await loginAdmin(scriptUrl, username, password, csrfToken);
        
        if (result.status === 'success') {
            // Check if the specific role is enabled
            const isDistrictRole = result.role === 'district';
            if (isDistrictRole && !currentAccessState.districtAccess) {
                return { success: false, message: 'Akses daerah sedang ditutup. Sila hubungi developer.' };
            }
            if (!isDistrictRole && !currentAccessState.adminAccess) {
                return { success: false, message: 'Akses pentadbir sedang ditutup. Sila hubungi developer.' };
            }

            setAdminRole(result.role); // 'admin' or 'district'
            setView('admin');
            setUserSession(null);
            localStorage.removeItem(LOCAL_STORAGE_KEYS.SESSION);
            handleFetchData(scriptUrl);
            return { success: true };
        } else {
            return { success: false, message: result.message || 'Log masuk admin gagal.' };
        }
    } catch (error) {
        return { success: false, message: 'Gagal menghubungi server. Sila semak Apps Script.' };
    }
  };

  const handleAdminRegionalLogin = async (username: string, password: string, role: 'negeri' | 'daerah'): Promise<{success: boolean, message?: string, adminData?: any}> => {
    try {
        const currentAccessState = await getAccessState();
        
        if (!currentAccessState.adminAccess) {
            return { success: false, message: 'Akses pentadbir sedang ditutup. Sila hubungi developer.' };
        }

        const csrfToken = generateCSRFToken();
        const result = await loginAdminRegional(scriptUrl, { username, password, role }, csrfToken);
        
        if (result.status === 'success' && result.admin) {
            setAdminSession(result.admin);
            setView('admin'); // Will be replaced with specific panel routing later
            setUserSession(null);
            setAdminRole(null); // Clear old admin role
            localStorage.removeItem(LOCAL_STORAGE_KEYS.SESSION);
            
            // Fetch data with hierarchical filtering
            const { negeriCode, daerahCode } = result.admin;
            await handleFetchData(scriptUrl, role, negeriCode, daerahCode);
            
            return { success: true, adminData: result.admin };
        } else {
            return { success: false, message: result.message || 'Log masuk admin gagal.' };
        }
    } catch (error) {
        console.error('Admin regional login error:', error);
        return { success: false, message: 'Gagal menghubungi server. Sila semak Apps Script.' };
    }
  };

  const handleDeveloperLogin = (username: string, password: string): {success: boolean, message?: string} => {
    // Hardcoded developer credentials
    const devUsername = 'DEVELOPER';
    const devPassword = localStorage.getItem('DEV_PASSWORD') || 'Dev@123456';
    
    if (username.trim().toUpperCase() === devUsername && password.trim() === devPassword) {
      localStorage.setItem('developerSession', 'true');
      setIsDeveloperMode(true);
      setView('developer');
      setUserSession(null);
      setAdminRole(null);
      localStorage.removeItem(LOCAL_STORAGE_KEYS.SESSION);
      return { success: true };
    }
    return { success: false, message: 'Invalid developer credentials' };
  };

  const handleUserLoginSuccess = (user: UserSession) => {
      setUserSession(user);
      localStorage.setItem(LOCAL_STORAGE_KEYS.SESSION, JSON.stringify(user)); // Persist Session
      setView('user_dashboard');
      handleFetchData(scriptUrl); 
  };

  const handleLogout = () => {
      setUserSession(null);
      setAdminRole(null);
      setIsDeveloperMode(false);
      localStorage.removeItem(LOCAL_STORAGE_KEYS.SESSION); // Clear Session
      localStorage.removeItem('developerSession');
      clearSessionActivity();
      setView('auth');
  };

  // Session Timeout & Activity Monitoring
  useEffect(() => {
    if (!userSession && !adminRole) return; // No session active

    // Add activity listeners
    const handleActivity = () => {
      updateSessionActivity();
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => document.addEventListener(event, handleActivity));

    // Check session timeout every minute
    const sessionCheckInterval = setInterval(() => {
      if (isSessionExpired()) {
        console.warn('Session expired due to inactivity');
        handleLogout();
        alert('Sesi anda telah tamat. Sila log masuk semula.');
      }
    }, 60000); // Check every minute

    return () => {
      events.forEach(event => document.removeEventListener(event, handleActivity));
      clearInterval(sessionCheckInterval);
    };
  }, [userSession, adminRole]);

  const handleRefreshData = () => {
      handleFetchData(scriptUrl);
  };

  const handleDeleteData = async (item: SubmissionData) => {
      if(!confirm(`Padam rekod peserta: ${item.student}?`)) return;
      try {
        const token = await fetchServerCsrf(scriptUrl);
        await deleteSubmission(scriptUrl, item, token || undefined);
          alert("Permintaan padam rekod dihantar.");
          setTimeout(handleRefreshData, 2000);
      } catch (err) {
          alert("Gagal memadam.");
      }
  };

  const renderContent = () => {
      // Check for maintenance mode using accessState (respects config.json priority)
      const isMaintenanceMode = accessState.maintenance;
      const isAdminAccess = new URLSearchParams(window.location.search).get('admin') === 'true';
      
      // Show maintenance page if enabled and user is not admin
      if (isMaintenanceMode && !isAdminAccess && !userSession) {
          return <MaintenancePage />;
      }

      if (isInitializing) {
          return (
              <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
                  <div className="relative">
                      <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                      <img src={LOGO_URL} className="w-10 h-10 object-contain absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" alt="Logo" />
                  </div>
                  <p className="text-white mt-4 font-mono text-sm animate-pulse tracking-widest uppercase">Memuatkan Sistem...</p>
              </div>
          );
      }

      switch (view) {
          case 'developer':
              return (
                <DeveloperPanel 
                    onLogout={handleLogout}
                    scriptUrl={scriptUrl}
                    setScriptUrl={setScriptUrl}
                    onOpenHierarchy={() => setView('developer_hierarchy')}
                />
              );

          case 'developer_hierarchy':
              return (
                <DeveloperDashboard 
                    scriptUrl={scriptUrl}
                    onLogout={handleLogout}
                    onBack={() => setView('developer_admin')}
                />
              );

          case 'developer_admin':
              return (
                <DeveloperAdminDashboard 
                    onLogout={handleLogout}
                    scriptUrl={scriptUrl}
                    setScriptUrl={setScriptUrl}
                    onOpenHierarchy={() => setView('developer_hierarchy')}
                />
              );

          case 'admin':
              // Check if this is regional admin (negeri/daerah) or old admin
              if (adminSession) {
                  // Regional Admin Login
                  if (adminSession.role === 'negeri') {
                      return (
                        <AdminNegeriPanel 
                            negeriCode={adminSession.negeriCode!}
                            negeriName={negeriList.find(n => n.code === adminSession.negeriCode)?.name || adminSession.negeriCode!}
                            adminSession={adminSession}
                            onBack={() => { setView('auth'); setAdminSession(null); }}
                            scriptUrl={scriptUrl}
                            setScriptUrl={setScriptUrl}
                            data={dashboardData}
                            schools={schoolsList}
                            badges={badges}
                            daerahList={daerahList}
                            isRegistrationOpen={isRegistrationOpen}
                            refreshData={() => handleFetchData(scriptUrl)}
                            deleteData={handleDeleteData}
                        />
                      );
                  } else if (adminSession.role === 'daerah') {
                      return (
                        <AdminDaerahPanel 
                            daerahCode={adminSession.daerahCode!}
                            daerahName={daerahList.find(d => d.code === adminSession.daerahCode)?.name || adminSession.daerahCode!}
                            negeriCode={adminSession.negeriCode!}
                            adminSession={adminSession}
                            onBack={() => { setView('auth'); setAdminSession(null); }}
                            scriptUrl={scriptUrl}
                            setScriptUrl={setScriptUrl}
                            data={dashboardData}
                            schools={schoolsList}
                            badges={badges}
                            isRegistrationOpen={isRegistrationOpen}
                            refreshData={() => handleFetchData(scriptUrl)}
                            deleteData={handleDeleteData}
                        />
                      );
                  }
              }
              
              // Old Admin System (backwards compatibility)
              const adminAccessEnabledCheck = accessState.adminAccess;
              const districtAccessEnabledCheck = accessState.districtAccess;
              
              if (!adminAccessEnabledCheck || !districtAccessEnabledCheck) {
                  if ((adminRole === 'admin' && !adminAccessEnabledCheck) || (adminRole === 'district' && !districtAccessEnabledCheck) || (!adminAccessEnabledCheck && !districtAccessEnabledCheck)) {
                      // Access disabled, force logout
                      handleLogout();
                      return <AuthScreen scriptUrl={scriptUrl} onLoginSuccess={handleUserLoginSuccess} onAdminLogin={handleAdminLogin} onAdminRegionalLogin={handleAdminRegionalLogin} onDeveloperLogin={handleDeveloperLogin} schools={schoolsList} negeriList={negeriList} daerahList={daerahList} isLoading={fetchingData} />;
                  }
              }
              
              return (
                <AdminPanel 
                    role={adminRole || 'admin'}
                    onBack={() => { setView('auth'); setAdminRole(null); }}
                    scriptUrl={scriptUrl}
                    setScriptUrl={setScriptUrl}
                    data={dashboardData}
                    schools={schoolsList}
                    badges={badges}
                    isRegistrationOpen={isRegistrationOpen}
                    refreshData={handleRefreshData}
                    deleteData={handleDeleteData}
                />
              );
          
          case 'user_dashboard':
              // Check if user access is disabled using accessState
              if (!accessState.userAccess || !userSession) {
                  if (userSession && !accessState.userAccess) {
                      // Clear session if user access was disabled
                      handleLogout();
                  }
                  return <AuthScreen scriptUrl={scriptUrl} onLoginSuccess={handleUserLoginSuccess} onAdminLogin={handleAdminLogin} onAdminRegionalLogin={handleAdminRegionalLogin} onDeveloperLogin={handleDeveloperLogin} schools={schoolsList} negeriList={negeriList} daerahList={daerahList} isLoading={fetchingData} />;
              }
              return (
                  <UserDashboard 
                      user={userSession}
                      allData={dashboardData}
                      schools={schoolsList}
                      badges={badges}
                      userProfiles={userProfiles}
                      isRegistrationOpen={isRegistrationOpen}
                      scriptUrl={scriptUrl} 
                      onLogout={handleLogout}
                      onNewRegistration={() => setView('user_form')}
                      onDelete={handleDeleteData}
                      onRefresh={handleRefreshData}
                  />
              );

          case 'user_form':
              // Check if user access is disabled using accessState
              if (!accessState.userAccess || !userSession) {
                  if (userSession && !accessState.userAccess) {
                      // Clear session if user access was disabled
                      handleLogout();
                  }
                  return <AuthScreen scriptUrl={scriptUrl} onLoginSuccess={handleUserLoginSuccess} onAdminLogin={handleAdminLogin} onAdminRegionalLogin={handleAdminRegionalLogin} onDeveloperLogin={handleDeveloperLogin} schools={schoolsList} negeriList={negeriList} daerahList={daerahList} isLoading={fetchingData} />;
              }
              return (
                  <UserForm 
                    schools={schoolsList} 
                    badgeTypes={badges}
                    scriptUrl={scriptUrl} 
                    isRegistrationOpen={isRegistrationOpen}
                    onAdminClick={() => {alert("Sila log keluar untuk akses admin.")}} 
                    isLoadingData={fetchingData}
                    refreshData={handleRefreshData}
                    userSession={userSession}
                    onBackToDashboard={() => setView('user_dashboard')}
                    existingData={dashboardData} 
                  />
              );

          case 'auth':
          default:
              return (
                <AuthScreen 
                    scriptUrl={scriptUrl} 
                    onLoginSuccess={handleUserLoginSuccess}
                    onAdminLogin={handleAdminLogin}
                    onAdminRegionalLogin={handleAdminRegionalLogin}
                    onDeveloperLogin={handleDeveloperLogin}
                    schools={schoolsList}
                    negeriList={negeriList}
                    daerahList={daerahList}
                    isLoading={fetchingData}
                />
              );
      }
  };

  return (
    <>
      {connectionError && (
        <div className="bg-red-600 text-white p-2 text-center text-xs font-bold flex justify-center items-center gap-2 animate-pulse fixed top-0 w-full z-50 shadow-md">
            <WifiOff size={14}/> Gagal menyambung ke database. Sila semak internet atau URL Database di Admin.
        </div>
      )}

      <div className={connectionError ? "mt-8" : ""}>
        {renderContent()}
      </div>
    </>
  );
}
