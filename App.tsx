

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
import { ToastProvider } from './components/ui/Toast';
import { fetchCloudData, deleteSubmission } from './services/supabaseApi';
import { DEFAULT_SERVER_URL, LOCAL_STORAGE_KEYS, LOGO_URL } from './constants';
import { SubmissionData, UserSession, Badge, School, UserProfile, Negeri, Daerah, AdminRegional } from './types';
import { WifiOff } from 'lucide-react';
import { generateCSRFToken, isSessionExpired, clearSessionActivity, updateSessionActivity } from './services/security';
import { getViewFromHash, pushViewToHash, replaceViewInHash, onHashNavigation } from './services/router';
import { AppDataProvider, AuthProvider, ThemeProvider } from './context/AppContext';
import { NotificationProvider } from './context/NotificationContext';
import { I18nProvider } from './i18n';
import { logAudit } from './services/auditService';
import { loginAdminSupabase } from './services/supabaseAuth';

// Helper functions for access control (independent of localStorage)
const getAccessState = async () => {
  // Priority: config.json in deployed builds, localStorage only while running Vite dev.
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
  
  // If config.json exists, use it. Otherwise allow local overrides only in dev mode.
  const useProduction = deployedConfig !== null;
  const allowLocalOverrides = Boolean((import.meta as any).env?.DEV);
  
  return {
    userAccess: useProduction ? deployedConfig.userAccess : (allowLocalOverrides ? localStorage.getItem('userAccess') !== 'false' : true),
    adminAccess: useProduction ? deployedConfig.adminAccess : (allowLocalOverrides ? localStorage.getItem('adminAccess') !== 'false' : true),
    districtAccess: useProduction ? deployedConfig.districtAccess : (allowLocalOverrides ? localStorage.getItem('districtAccess') !== 'false' : true),
    maintenance: useProduction ? deployedConfig.maintenance : (allowLocalOverrides ? localStorage.getItem('maintenanceMode') === 'true' : false)
  };
};

const ADMIN_SESSION_KEY = 'ADMIN_SESSION_DATA';
const DEVELOPER_SESSION_KEY = 'DEVELOPER_SESSION_DATA';
const isLocalPreview = () => ['4002', '4173'].includes(window.location.port) || ['localhost', '127.0.0.1'].includes(window.location.hostname);

export default function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppDataProvider initialScriptUrl={DEFAULT_SERVER_URL}>
            <NotificationProvider>
              <ToastProvider>
                <AppContent />
              </ToastProvider>
            </NotificationProvider>
          </AppDataProvider>
        </AuthProvider>
      </ThemeProvider>
    </I18nProvider>
  );
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
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);

  // Access Control State
  const [accessState, setAccessState] = useState({
    userAccess: true,
    adminAccess: true,
    districtAccess: true,
    maintenance: false
  });

  // View State
  const [view, setView] = useState<'auth' | 'user_dashboard' | 'user_form' | 'admin' | 'developer' | 'developer_admin' | 'developer_hierarchy'>('auth');

  // URL Router Sync - push view changes to URL hash
  const navigateTo = (newView: typeof view) => {
    setView(newView);
    pushViewToHash(newView);
  };

  // Listen for browser back/forward buttons
  useEffect(() => {
    const cleanup = onHashNavigation((hashView) => {
      setView(hashView);
    });
    return cleanup;
  }, []);

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
        const urlParams = new URLSearchParams(window.location.search);
        const urlScriptParam = urlParams.get('scriptUrl');
        const localUrl = localStorage.getItem(LOCAL_STORAGE_KEYS.SCRIPT_URL);
        const usingUrlParam = Boolean(urlScriptParam && urlScriptParam.trim() !== "");
        const usingLocal = Boolean(localUrl && localUrl.trim() !== "");
        if (usingUrlParam) {
            activeUrl = urlScriptParam!.trim();
            localStorage.setItem(LOCAL_STORAGE_KEYS.SCRIPT_URL, activeUrl);
        } else if (usingLocal) {
            activeUrl = localUrl!;
        }
        setScriptUrl(activeUrl);
        
        // 2. Check User Session
        const savedSession = localStorage.getItem(LOCAL_STORAGE_KEYS.SESSION);
        let sessionRestored = false;
        if (savedSession) {
            try {
                const parsedSession = JSON.parse(savedSession);
                if (parsedSession && parsedSession.isLoggedIn) {
                    // Verify Supabase auth session is still valid
                    const { supabase } = await import('./services/supabaseClient');
                    const { data: { session: supaSession } } = await supabase.auth.getSession();
                    if (!supaSession) {
                        // Supabase session expired, clear local session
                        console.warn('Supabase session expired, clearing local session');
                        localStorage.removeItem(LOCAL_STORAGE_KEYS.SESSION);
                    } else {
                        // Check if user access is enabled from hardened access state.
                        const currentAccessState = await getAccessState();
                        const userAccessEnabled = currentAccessState.userAccess;
                        if (userAccessEnabled) {
                            setUserSession(parsedSession);
                            replaceViewInHash('user_dashboard');
                            setView('user_dashboard');
                            sessionRestored = true;
                        } else {
                            // User access disabled, clear session
                            localStorage.removeItem(LOCAL_STORAGE_KEYS.SESSION);
                        }
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

        const result = await loginAdminSupabase({ email: username, password }, 'admin');
        
        if (result.status === 'success' && result.admin) {
            setAdminRole('admin');
            setAdminSession(null);
            localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(result.admin));
            navigateTo('admin');
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
        const isPreviewMode = ['4002', '4173'].includes(window.location.port) || ['localhost', '127.0.0.1'].includes(window.location.hostname);
        
        if (!currentAccessState.adminAccess) {
            return { success: false, message: 'Akses pentadbir sedang ditutup. Sila hubungi developer.' };
        }

        if (isPreviewMode) {
            const normalizedUsername = username.trim().toUpperCase() || (role === 'negeri' ? 'PREVIEW_ADMIN_NEGERI' : 'PREVIEW_ADMIN_DAERAH');
            const previewNegeriCode = negeriList[0]?.code || 'PRK';
            const previewDaerahCode = role === 'daerah' ? (daerahList.find(d => d.negeriCode === previewNegeriCode)?.code || daerahList[0]?.code || 'KU') : undefined;
            const previewAdmin: AdminRegional = {
                username: normalizedUsername,
                role,
                fullName: role === 'negeri' ? 'Preview Admin Negeri' : 'Preview Admin Daerah',
                negeriCode: previewNegeriCode,
                daerahCode: previewDaerahCode,
                authToken: 'PREVIEW_BYPASS_TOKEN',
                expiresAt: Date.now() + (24 * 60 * 60 * 1000),
                scope: {
                    canManageNegeri: role === 'negeri',
                    canManageDaerah: true,
                    canManageSchools: true,
                    canManageBadges: true,
                    canViewAllNegeri: role === 'negeri',
                    canViewAllDaerah: true,
                    negeriAccess: [previewNegeriCode],
                    daerahAccess: role === 'negeri' ? 'ALL_IN_NEGERI' : [previewDaerahCode || 'KU']
                }
            };

            setAdminSession(previewAdmin);
            localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(previewAdmin));
            navigateTo('admin');
            setUserSession(null);
            setAdminRole(null);
            localStorage.removeItem(LOCAL_STORAGE_KEYS.SESSION);
            await handleFetchData(scriptUrl, role, previewNegeriCode, previewDaerahCode);
            return { success: true, adminData: previewAdmin };
        }

        const result = await loginAdminSupabase({ email: username, password }, role);
        
        if (result.status === 'success' && result.admin) {
            setAdminSession(result.admin);
            localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(result.admin));
            navigateTo('admin'); // Will be replaced with specific panel routing later
            setUserSession(null);
            setAdminRole(null); // Clear old admin role
            localStorage.removeItem(LOCAL_STORAGE_KEYS.SESSION);
            
            // Fetch GAS data with Supabase admin scope
            const { negeriCode, daerahCode } = result.admin;
            await handleFetchData(scriptUrl, role, negeriCode, daerahCode);
            
            return { success: true, adminData: result.admin };
        } else {
            return { success: false, message: result.message || 'Log masuk admin Supabase gagal.' };
        }
    } catch (error) {
        console.error('Admin regional login error:', error);
        return { success: false, message: 'Gagal menghubungi server. Sila semak Apps Script.' };
    }
  };

  const handleDeveloperLogin = async (username: string, password: string): Promise<{success: boolean, message?: string}> => {
    try {
      const isPreviewMode = ['4002', '4173'].includes(window.location.port) || ['localhost', '127.0.0.1'].includes(window.location.hostname);

      if (isPreviewMode) {
        localStorage.setItem(DEVELOPER_SESSION_KEY, JSON.stringify({
          role: 'developer',
          username: username.trim().toUpperCase() || 'DEVELOPER',
          authToken: 'PREVIEW_DEVELOPER_TOKEN',
          expiresAt: Date.now() + (24 * 60 * 60 * 1000)
        }));
        setIsDeveloperMode(true);
        navigateTo('developer');
        setUserSession(null);
        setAdminRole(null);
        setAdminSession(null);
        localStorage.removeItem(LOCAL_STORAGE_KEYS.SESSION);
        localStorage.removeItem(ADMIN_SESSION_KEY);
        return { success: true };
      }

      const result = await loginAdminSupabase({ email: username, password }, 'developer');
      if (result.status === 'success' && result.admin) {
        localStorage.setItem(DEVELOPER_SESSION_KEY, JSON.stringify({
          role: 'developer',
          username: result.admin.email || username.trim().toLowerCase(),
          authToken: result.admin.authToken,
          expiresAt: result.admin.expiresAt,
          email: result.admin.email,
          fullName: result.admin.fullName
        }));
        setIsDeveloperMode(true);
        navigateTo('developer');
        setUserSession(null);
        setAdminRole(null);
        setAdminSession(null);
        localStorage.removeItem(LOCAL_STORAGE_KEYS.SESSION);
        localStorage.removeItem(ADMIN_SESSION_KEY);
        await handleFetchData(scriptUrl);
        return { success: true };
      }
      return { success: false, message: result.message || 'Log masuk developer Supabase gagal.' };
    } catch (error) {
      return { success: false, message: 'Gagal menghubungi server developer.' };
    }
  };

  const handleUserLoginSuccess = (user: UserSession) => {
      setUserSession(user);
      localStorage.setItem(LOCAL_STORAGE_KEYS.SESSION, JSON.stringify(user)); // Persist Session
      navigateTo('user_dashboard');
      handleFetchData(scriptUrl);
      logAudit('LOGIN', user.schoolCode, 'user', `Log masuk: ${user.schoolName} (${user.schoolCode})`);
  };

  const handleLogout = async () => {
      const actor = userSession?.schoolCode || adminSession?.username || (isDeveloperMode ? 'DEVELOPER' : 'UNKNOWN');
      const role = isDeveloperMode ? 'developer' : adminSession ? adminSession.role : adminRole || 'user';
      logAudit('LOGOUT', actor, role as any, `Log keluar`);
      
      // Sign out from Supabase if logged in
      const { supabase } = await import('./services/supabaseClient');
      await supabase.auth.signOut();
      
      setUserSession(null);
      setAdminRole(null);
      setAdminSession(null);
      setIsDeveloperMode(false);
      localStorage.removeItem(LOCAL_STORAGE_KEYS.SESSION); // Clear Session
      localStorage.removeItem(ADMIN_SESSION_KEY);
      localStorage.removeItem(DEVELOPER_SESSION_KEY);
      clearSessionActivity();
      navigateTo('auth');
  };

  // Session Timeout & Activity Monitoring
  useEffect(() => {
    if (!userSession && !adminRole && !adminSession && !isDeveloperMode) return; // No session active

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
  }, [userSession, adminRole, adminSession, isDeveloperMode]);

  const handleRefreshData = () => {
      handleFetchData(scriptUrl);
  };

  const handleDeleteData = async (item: SubmissionData) => {
      if(!confirm(`Padam rekod peserta: ${item.student}?`)) return;
      try {
        const result = await deleteSubmission(scriptUrl, item);
        if (result.status === 'success') {
          const actor = userSession?.schoolCode || adminSession?.username || 'ADMIN';
          const role = isDeveloperMode ? 'developer' : adminSession ? adminSession.role : adminRole || 'user';
          logAudit('DELETE_RECORD', actor, role as any, `Padam rekod: ${item.student} (${item.badge}) dari ${item.school}`);
          alert("Rekod berjaya dipadam.");
          setTimeout(handleRefreshData, 1000);
        } else {
          alert(result.message || "Gagal memadam rekod.");
        }
      } catch (error) {
        alert("Ralat semasa memadam rekod.");
      }
  };


  const renderContent = () => {
      // Check for maintenance mode using accessState (respects config.json priority)
      const isMaintenanceMode = accessState.maintenance;
      const isAdminAccess = Boolean(adminRole || adminSession || isDeveloperMode);
      
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
                    onOpenHierarchy={() => navigateTo('developer_hierarchy')}
                />
              );

          case 'developer_hierarchy':
              return (
                <DeveloperDashboard 
                    scriptUrl={scriptUrl}
                    onLogout={handleLogout}
                    onBack={() => navigateTo('developer_admin')}
                />
              );

          case 'developer_admin':
              return (
                <DeveloperAdminDashboard 
                    onLogout={handleLogout}
                    scriptUrl={scriptUrl}
                    setScriptUrl={setScriptUrl}
                    onOpenHierarchy={() => navigateTo('developer_hierarchy')}
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
                            onBack={() => { navigateTo('auth'); setAdminSession(null); }}
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
                            onBack={() => { navigateTo('auth'); setAdminSession(null); }}
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
                      return <AuthScreen scriptUrl={scriptUrl} onLoginSuccess={handleUserLoginSuccess} onAdminLogin={handleAdminLogin} onAdminRegionalLogin={handleAdminRegionalLogin} onDeveloperLogin={handleDeveloperLogin} schools={schoolsList} negeriList={negeriList} daerahList={daerahList} userAccessEnabled={accessState.userAccess} isLoading={fetchingData} />;
                  }
              }
              
              return (
                <AdminPanel 
                    role={adminRole || 'admin'}
                    onBack={() => { navigateTo('auth'); setAdminRole(null); }}
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
                  return <AuthScreen scriptUrl={scriptUrl} onLoginSuccess={handleUserLoginSuccess} onAdminLogin={handleAdminLogin} onAdminRegionalLogin={handleAdminRegionalLogin} onDeveloperLogin={handleDeveloperLogin} schools={schoolsList} negeriList={negeriList} daerahList={daerahList} userAccessEnabled={accessState.userAccess} isLoading={fetchingData} />;
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
                      onNewRegistration={() => navigateTo('user_form')}
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
                  return <AuthScreen scriptUrl={scriptUrl} onLoginSuccess={handleUserLoginSuccess} onAdminLogin={handleAdminLogin} onAdminRegionalLogin={handleAdminRegionalLogin} onDeveloperLogin={handleDeveloperLogin} schools={schoolsList} negeriList={negeriList} daerahList={daerahList} userAccessEnabled={accessState.userAccess} isLoading={fetchingData} />;
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
                    onBackToDashboard={() => navigateTo('user_dashboard')}
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
                    userAccessEnabled={accessState.userAccess}
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
