import React, { createContext, useContext, useState, useCallback } from 'react';
import { SubmissionData, UserSession, Badge, School, UserProfile, Negeri, Daerah, AdminRegional } from '../types';

// ============ APP DATA CONTEXT ============
interface AppDataState {
  schools: School[];
  badges: Badge[];
  userProfiles: UserProfile[];
  negeriList: Negeri[];
  daerahList: Daerah[];
  submissions: SubmissionData[];
  isRegistrationOpen: boolean;
  scriptUrl: string;
  isLoading: boolean;
  connectionError: boolean;
}

interface AppDataContextType extends AppDataState {
  setSchools: (schools: School[]) => void;
  setBadges: (badges: Badge[]) => void;
  setUserProfiles: (profiles: UserProfile[]) => void;
  setNegeriList: (list: Negeri[]) => void;
  setDaerahList: (list: Daerah[]) => void;
  setSubmissions: (data: SubmissionData[]) => void;
  setIsRegistrationOpen: (open: boolean) => void;
  setScriptUrl: (url: string) => void;
  setIsLoading: (loading: boolean) => void;
  setConnectionError: (error: boolean) => void;
}

const AppDataContext = createContext<AppDataContextType | null>(null);

export const AppDataProvider: React.FC<{ children: React.ReactNode; initialScriptUrl: string }> = ({ children, initialScriptUrl }) => {
  const [schools, setSchools] = useState<School[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [negeriList, setNegeriList] = useState<Negeri[]>([]);
  const [daerahList, setDaerahList] = useState<Daerah[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionData[]>([]);
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(true);
  const [scriptUrl, setScriptUrl] = useState(initialScriptUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionError, setConnectionError] = useState(false);

  return (
    <AppDataContext.Provider value={{
      schools, setSchools,
      badges, setBadges,
      userProfiles, setUserProfiles,
      negeriList, setNegeriList,
      daerahList, setDaerahList,
      submissions, setSubmissions,
      isRegistrationOpen, setIsRegistrationOpen,
      scriptUrl, setScriptUrl,
      isLoading, setIsLoading,
      connectionError, setConnectionError,
    }}>
      {children}
    </AppDataContext.Provider>
  );
};

export const useAppData = (): AppDataContextType => {
  const context = useContext(AppDataContext);
  if (!context) throw new Error('useAppData must be used within AppDataProvider');
  return context;
};

// ============ AUTH CONTEXT ============
interface AuthState {
  userSession: UserSession | null;
  adminRole: 'admin' | 'district' | null;
  adminSession: AdminRegional | null;
  isDeveloperMode: boolean;
  isInitializing: boolean;
}

interface AuthContextType extends AuthState {
  setUserSession: (session: UserSession | null) => void;
  setAdminRole: (role: 'admin' | 'district' | null) => void;
  setAdminSession: (session: AdminRegional | null) => void;
  setIsDeveloperMode: (mode: boolean) => void;
  setIsInitializing: (init: boolean) => void;
  isAuthenticated: boolean;
  currentRole: 'user' | 'admin' | 'district' | 'negeri' | 'daerah' | 'developer' | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userSession, setUserSession] = useState<UserSession | null>(null);
  const [adminRole, setAdminRole] = useState<'admin' | 'district' | null>(null);
  const [adminSession, setAdminSession] = useState<AdminRegional | null>(null);
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  const isAuthenticated = Boolean(userSession || adminRole || adminSession || isDeveloperMode);
  
  const currentRole = isDeveloperMode ? 'developer' 
    : adminSession?.role === 'negeri' ? 'negeri'
    : adminSession?.role === 'daerah' ? 'daerah'
    : adminRole ? adminRole 
    : userSession ? 'user' 
    : null;

  return (
    <AuthContext.Provider value={{
      userSession, setUserSession,
      adminRole, setAdminRole,
      adminSession, setAdminSession,
      isDeveloperMode, setIsDeveloperMode,
      isInitializing, setIsInitializing,
      isAuthenticated,
      currentRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

// ============ THEME CONTEXT ============
type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: ThemeMode;
  isDark: boolean;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('theme') as ThemeMode;
    return saved || 'light';
  });

  const getSystemPreference = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

  const isDark = theme === 'dark' || (theme === 'system' && getSystemPreference());

  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Apply to document
    if (newTheme === 'dark' || (newTheme === 'system' && getSystemPreference())) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(isDark ? 'light' : 'dark');
  }, [isDark, setTheme]);

  // Apply theme on mount
  React.useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Listen for system preference changes
  React.useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (mq.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, isDark, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
