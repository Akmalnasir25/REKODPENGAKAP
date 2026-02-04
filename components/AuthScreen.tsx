

import React, { useState } from 'react';
import { Lock, UserPlus, LogIn, AlertCircle, Eye, EyeOff, Key, RefreshCw, HelpCircle, ArrowLeft, User, School as SchoolIcon, Code, Shield } from 'lucide-react';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { loginUser, registerUser, resetPassword, validatePassword } from '../services/api';
import { UserSession, School, Negeri, Daerah } from '../types';
import { APP_VERSION, LOGO_URL } from '../constants';
import { checkLoginAttempts, recordLoginAttempt, fetchServerCsrf } from '../services/security';

interface AuthScreenProps {
  scriptUrl: string;
  onLoginSuccess: (user: UserSession) => void;
  onAdminLogin: (username: string, pass: string) => Promise<{success: boolean, message?: string}>;
  onAdminRegionalLogin?: (username: string, pass: string, role: 'negeri' | 'daerah') => Promise<{success: boolean, message?: string, adminData?: any}>;
  onDeveloperLogin?: (username: string, pass: string) => {success: boolean, message?: string};
  schools: School[];
  negeriList?: Negeri[];
  daerahList?: Daerah[];
  isLoading?: boolean;
}

type AuthMode = 'login' | 'register' | 'forgot_password' | 'developer';

export const AuthScreen: React.FC<AuthScreenProps> = ({ 
  scriptUrl, 
  onLoginSuccess, 
  onAdminLogin, 
  onAdminRegionalLogin,
  onDeveloperLogin, 
  schools = [], 
  negeriList = [], 
  daerahList = [], 
  isLoading = false 
}) => {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Form State
  const [schoolName, setSchoolName] = useState('');
  const [schoolCode, setSchoolCode] = useState(''); // Also used as Admin Username
  const [selectedNegeri, setSelectedNegeri] = useState('');
  const [selectedDaerah, setSelectedDaerah] = useState('');
  
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [secretKey, setSecretKey] = useState('');
  const [loginType, setLoginType] = useState<'user' | 'admin_daerah' | 'admin_negeri' | 'developer'>('user');

  const resetForm = () => {
      setSchoolName('');
      setSchoolCode('');
      setSelectedNegeri('');
      setSelectedDaerah('');
      setPassword('');
      setConfirmPassword('');
      setSecretKey('');
      setError('');
  };

  const switchMode = (mode: AuthMode) => {
      resetForm();
      setAuthMode(mode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!scriptUrl && loginType === 'user') {
        setError('URL Database belum ditetapkan. Sila hubungi Admin.');
        return;
    }

    // Check rate limiting for login attempts
    if (authMode === 'login') {
        const { canAttempt, timeRemaining } = checkLoginAttempts();
        if (!canAttempt) {
            const minutes = Math.ceil(timeRemaining / 60);
            setError(`Terlalu banyak percubaan log masuk. Sila tunggu ${minutes} minit sebelum cuba lagi.`);
            return;
        }
    }

    setLoading(true);

    try {
        if (authMode === 'developer') {
            // DEVELOPER LOGIN HANDLER
            if (!onDeveloperLogin) {
                setError('Developer login is not available.');
                setLoading(false);
                return;
            }
            if (!schoolCode || !password) { 
                setError('Sila isikan Nama Pengguna dan Kata Laluan.'); 
                setLoading(false); 
                return; 
            }
            const res = onDeveloperLogin(schoolCode, password);
            if (!res.success) {
                setError(res.message || 'Log masuk developer gagal.');
                setLoading(false);
            } else {
                // Success is handled by App.tsx setting view
            }
            return;
        }

        if (authMode === 'login') {
            // Handle different login types
            if (loginType === 'developer') {
                // DEVELOPER LOGIN
                if (!onDeveloperLogin) {
                    setError('Developer login is not available.');
                    setLoading(false);
                    return;
                }
                if (!schoolCode || !password) { 
                    setError('Sila isikan Nama Pengguna dan Kata Laluan.'); 
                    setLoading(false); 
                    return; 
                }
                const res = onDeveloperLogin(schoolCode, password);
                if (!res.success) {
                    setError(res.message || 'Log masuk developer gagal.');
                    setLoading(false);
                }
                return;
            } else if (loginType === 'admin_negeri' || loginType === 'admin_daerah') {
                // ADMIN REGIONAL LOGIN (Negeri/Daerah)
                if (!onAdminRegionalLogin) {
                    setError('Admin regional login is not available.');
                    setLoading(false);
                    return;
                }
                if (!schoolCode || !password) {
                    setError('Sila isikan Nama Pengguna dan Kata Laluan.');
                    setLoading(false);
                    return;
                }
                const role = loginType === 'admin_negeri' ? 'negeri' : 'daerah';
                const res = await onAdminRegionalLogin(schoolCode, password, role);
                if (!res.success) {
                    recordLoginAttempt(false);
                    setError(res.message || 'Log masuk admin gagal.');
                    setLoading(false);
                } else {
                    recordLoginAttempt(true);
                }
                return;
            }

            // USER LOGIN logic
            if (!schoolCode || !password) { 
                setError('Sila isikan Kod Sekolah dan Kata Laluan.'); 
                setLoading(false); 
                return; 
            }

            // Check if user access is disabled
            const userAccessParamValue = new URLSearchParams(window.location.search).get('userAccess');
            const userAccessEnabled = userAccessParamValue ? userAccessParamValue === 'true' : localStorage.getItem('userAccess') !== 'false';
            if (!userAccessEnabled) {
                setError('Akses pengguna sedang ditutup. Sila hubungi pentadbir sistem.');
                setLoading(false);
                return;
            }

            // obtain server-issued CSRF token
            const serverToken = await fetchServerCsrf(scriptUrl);
            if (!serverToken) { setError('Gagal mendapatkan token CSRF daripada server. Sila cuba lagi.'); setLoading(false); return; }
            const result = await loginUser(scriptUrl, { schoolCode, password, csrfToken: serverToken });
            if (result.status === 'success' && result.user) {
                recordLoginAttempt(true);
                onLoginSuccess(result.user);
            } else {
                recordLoginAttempt(false);
                let errorMessage = result.message || 'Log masuk gagal.';
                if (errorMessage === 'Salah info.' || errorMessage === 'Salah info') {
                    errorMessage = 'Kod sekolah dan kata laluan tidak sepadan.';
                }
                setError(errorMessage);
            }
        } else if (authMode === 'register') {
            // REGISTER logic
            if (!schoolName) { setError('Sila pilih nama sekolah.'); setLoading(false); return; }
            if (!schoolCode) { setError('Sila masukkan Kod Sekolah.'); setLoading(false); return; }
            if (!secretKey) { setError('Sila cipta Kata Kunci Keselamatan.'); setLoading(false); return; }

            // Check if user access is disabled
            const userAccessParamReg = new URLSearchParams(window.location.search).get('userAccess');
            const userAccessEnabledReg = userAccessParamReg ? userAccessParamReg === 'true' : localStorage.getItem('userAccess') !== 'false';
            if (!userAccessEnabledReg) {
                setError('Pendaftaran sedang ditutup. Sila hubungi pentadbir sistem.');
                setLoading(false);
                return;
            }

            if (password !== confirmPassword) {
                setError('Kata laluan dan pengesahan kata laluan tidak sama.');
                setLoading(false);
                return;
            }

            // Validate password strength
            const passwordValidation = validatePassword(password);
            if (!passwordValidation.valid) {
                setError(passwordValidation.errors.join('\n'));
                setLoading(false);
                return;
            }

            // obtain server-issued CSRF token
            const regToken = await fetchServerCsrf(scriptUrl);
            if (!regToken) { setError('Gagal dapatkan token CSRF. Sila cuba lagi.'); setLoading(false); return; }

            const result = await registerUser(scriptUrl, { 
                schoolName, 
                schoolCode, 
                password, 
                secretKey 
            }, regToken);

            if (result.status === 'success') {
                alert('Pendaftaran berjaya! Sila log masuk.');
                switchMode('login');
            } else {
                setError(result.message || 'Pendaftaran gagal.');
            }
        } else if (authMode === 'forgot_password') {
            // RESET PASSWORD logic
            if (!schoolCode) { setError('Sila masukkan Kod Sekolah.'); setLoading(false); return; }
            if (!secretKey) { setError('Sila masukkan Kata Kunci Keselamatan anda.'); setLoading(false); return; }
            if (!password) { setError('Sila masukkan kata laluan baharu.'); setLoading(false); return; }
            
            if (password !== confirmPassword) {
                setError('Kata laluan baharu dan pengesahan tidak sama.');
                setLoading(false);
                return;
            }

            // obtain CSRF token for reset
            const resetToken = await fetchServerCsrf(scriptUrl);
            if (!resetToken) { setError('Gagal dapatkan token CSRF. Sila cuba lagi.'); setLoading(false); return; }

            const result = await resetPassword(scriptUrl, {
                schoolCode,
                secretKey,
                newPassword: password
            }, resetToken);

            if (result.status === 'success') {
                alert('Kata laluan berjaya ditukar! Sila log masuk dengan kata laluan baharu.');
                switchMode('login');
            } else {
                setError(result.message || 'Gagal menukar kata laluan.');
            }
        }
    } catch (err) {
        console.error(err);
        setError('Gagal menghubungi server. Pastikan talian internet stabil.');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      
      {/* Background Ambience */}
      <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 opacity-90"></div>
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-600 rounded-full blur-[120px] opacity-20 animate-pulse"></div>
          <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-amber-600 rounded-full blur-[120px] opacity-10"></div>
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
      </div>

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden relative z-10 flex flex-col md:flex-row min-h-[600px] border border-slate-700/50">
        
        {/* LEFT PANEL */}
        <div className="md:w-5/12 bg-slate-900 text-white p-10 flex flex-col relative overflow-hidden border-r border-slate-800">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 via-amber-600 to-amber-800"></div>
            
            {/* Main Content Centered */}
            <div className="relative z-10 flex-1 flex flex-col justify-center items-center w-full">
                <div className="flex flex-col items-center justify-center mb-8 bg-white/5 px-6 py-2 rounded-full border border-white/10 backdrop-blur-sm shadow-lg">
                    <span className="text-[10px] md:text-xs font-bold tracking-[0.2em] text-amber-500 uppercase text-center">PERSEKUTUAN PENGAKAP MALAYSIA</span>
                </div>
                <img src={LOGO_URL} alt="Logo Perkhemahan" className="h-32 w-auto object-contain mb-8 drop-shadow-2xl hover:scale-105 transition-transform duration-500"/>
                <h1 className="text-3xl font-black text-white leading-tight mb-3 tracking-tight text-center">
                    PENGAKAP DAERAH <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">KINTA UTARA</span>
                </h1>
                <p className="text-slate-400 text-sm font-light leading-relaxed max-w-xs mx-auto text-center">Sistem Pendaftaran & Pengurusan Data Keahlian Berpusat.</p>
            </div>
            
            {/* Footer */}
            <div className="relative z-10 w-full mt-auto border-t border-slate-800 pt-6">
                <div className="flex flex-col items-center justify-center gap-1.5 w-full">
                    <span className="uppercase tracking-[0.2em] font-bold text-slate-500 text-[10px]">Design By Akmal Nasir<sup className="ml-0.5">&trade;</sup></span>
                    <span className="font-mono text-slate-600 text-[9px] opacity-60 tracking-widest">{APP_VERSION.split(' ')[0]}</span>
                </div>
            </div>

            <div className="absolute inset-0 opacity-10 pointer-events-none">
                <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path d="M0 100 L100 0 L100 100 Z" fill="url(#grad1)" />
                    <defs>
                        <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#000000" />
                        <stop offset="100%" stopColor="#1e293b" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>
        </div>

        {/* RIGHT PANEL (FORM) */}
        <div className="md:w-7/12 bg-white p-8 md:p-12 flex flex-col justify-center relative">
            
            {/* Header Form */}
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-800 mb-1 flex items-center gap-2">
                    {authMode === 'developer' ? 'Developer Console' :
                     authMode === 'login' ? 'Log Masuk Sistem' : 
                     authMode === 'register' ? 'Daftar Akaun Baru' : 'Pemulihan Akaun'}
                </h2>
                <p className="text-slate-500 text-sm">
                    {authMode === 'developer' ? 'Akses console developer untuk pentadbiran sistem.' :
                     authMode === 'login' ? 'Sila masukkan kelayakan anda untuk meneruskan.' : 
                     authMode === 'register' ? 'Isikan maklumat sekolah untuk mendaftar.' : 'Masukkan kata kunci keselamatan untuk reset kata laluan.'}
                </p>
            </div>

            {error && (
                <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-r mb-6 text-sm flex items-start gap-2 animate-[fadeIn_0.3s_ease-out]">
                    <AlertCircle size={18} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
                
                {/* DEVELOPER LOGIN FORM */}
                {authMode === 'developer' && (
                    <>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                                Nama Pengguna Developer
                            </label>
                            <div className="relative">
                                <Code className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input 
                                    type="text" 
                                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition bg-slate-50 focus:bg-white font-mono uppercase"
                                    placeholder="DEVELOPER"
                                    value={schoolCode}
                                    onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                                Kata Laluan
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input 
                                    type={showPassword ? "text" : "password"}
                                    className="w-full pl-10 pr-10 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition bg-slate-50 focus:bg-white"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <button 
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            <p className="text-[10px] text-purple-600 mt-1 italic">*Akses penuh ke kontrol sistem</p>
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                setAuthMode('login');
                                resetForm();
                            }}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition-colors"
                        >
                            <ArrowLeft size={16} /> Kembali ke Log Masuk
                        </button>
                    </>
                )}

                {authMode === 'register' && (
                    <>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Negeri</label>
                            <div className="relative">
                                <SchoolIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <select 
                                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-slate-50 focus:bg-white"
                                    value={selectedNegeri}
                                    onChange={(e) => {
                                        setSelectedNegeri(e.target.value);
                                        setSelectedDaerah(''); // Reset daerah when negeri changes
                                        setSchoolName(''); // Reset school when negeri changes
                                    }}
                                    required
                                >
                                    <option value="">-- Pilih Negeri --</option>
                                    {negeriList.map((n, i) => <option key={i} value={n.code}>{n.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Daerah</label>
                            <div className="relative">
                                <SchoolIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <select 
                                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-slate-50 focus:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                                    value={selectedDaerah}
                                    onChange={(e) => {
                                        setSelectedDaerah(e.target.value);
                                        setSchoolName(''); // Reset school when daerah changes
                                    }}
                                    disabled={!selectedNegeri}
                                    required
                                >
                                    <option value="">-- Pilih Daerah --</option>
                                    {daerahList
                                        .filter(d => d.negeriCode === selectedNegeri)
                                        .map((d, i) => <option key={i} value={d.code}>{d.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nama Sekolah</label>
                            <div className="relative">
                                <SchoolIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <select 
                                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-slate-50 focus:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                                    value={schoolName}
                                    onChange={(e) => setSchoolName(e.target.value)}
                                    disabled={!selectedDaerah}
                                    required
                                >
                                    <option value="">-- Pilih Sekolah --</option>
                                    {schools
                                        .filter(s => {
                                            // Filter schools: must match both negeriCode AND daerahCode
                                            if (!selectedNegeri || !selectedDaerah) return false;
                                            return s.negeriCode === selectedNegeri && s.daerahCode === selectedDaerah;
                                        })
                                        .map((s, i) => <option key={i} value={s.name}>{s.name}</option>)}
                                </select>
                            </div>
                            {selectedDaerah && schools.filter(s => s.negeriCode === selectedNegeri && s.daerahCode === selectedDaerah).length === 0 && (
                                <p className="text-amber-600 text-xs mt-1">
                                    ⚠️ Tiada sekolah bagi daerah ini. Sila hubungi Admin Daerah untuk tambah sekolah.
                                </p>
                            )}
                        </div>
                    </>
                )}

                {/* LOGIN TYPE SELECTOR - Only show in login mode */}
                {authMode === 'login' && (
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                            Jenis Log Masuk
                        </label>
                        <div className="relative">
                            <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <select 
                                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-slate-50 focus:bg-white"
                                value={loginType}
                                onChange={(e) => setLoginType(e.target.value as 'user' | 'admin_daerah' | 'admin_negeri' | 'developer')}
                            >
                                <option value="user">👤 Pengguna Sekolah</option>
                                <option value="admin_daerah">🏛️ Admin Daerah</option>
                                <option value="admin_negeri">🏢 Admin Negeri</option>
                                <option value="developer">⚙️ Developer</option>
                            </select>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 italic">
                            {loginType === 'user' && '*Untuk sekolah yang telah berdaftar'}
                            {loginType === 'admin_daerah' && '*Akses pengurusan sekolah dalam daerah anda'}
                            {loginType === 'admin_negeri' && '*Akses pengurusan semua daerah dalam negeri anda'}
                            {loginType === 'developer' && '*Akses penuh ke seluruh sistem'}
                        </p>
                    </div>
                )}

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                        {loginType === 'developer' ? 'Nama Pengguna Developer' : 
                         loginType === 'admin_negeri' ? 'Nama Pengguna Admin Negeri' :
                         loginType === 'admin_daerah' ? 'Nama Pengguna Admin Daerah' :
                         'Kod Sekolah'}
                    </label>
                    <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type="text" 
                            className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-slate-50 focus:bg-white font-mono placeholder:font-sans uppercase"
                            placeholder={
                                loginType === 'developer' ? 'DEVELOPER' :
                                loginType === 'admin_negeri' ? 'ADMIN_PRK' :
                                loginType === 'admin_daerah' ? 'ADMIN_PRK_KU' :
                                "KOD SEKOLAH (CTH: ABA1234)"
                            }
                            value={schoolCode}
                            onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                            required
                        />
                    </div>
                </div>

                {authMode === 'register' || authMode === 'forgot_password' ? (
                     <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                            Kata Kunci Keselamatan 
                            <span title="Frasa rahsia peribadi untuk reset password (Contoh: Warna Kereta)" className="cursor-help">
                                <HelpCircle size={12} />
                            </span>
                        </label>
                        <div className="relative">
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input 
                                type="text" 
                                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-slate-50 focus:bg-white"
                                placeholder="Cth: Nama Kucing Saya"
                                value={secretKey}
                                onChange={(e) => setSecretKey(e.target.value)}
                                required
                            />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 italic">*Tetapkan frasa rahsia yang hanya anda tahu. Ia digunakan jika anda lupa kata laluan.</p>
                    </div>
                ) : null}

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                        {authMode === 'forgot_password' ? 'Kata Laluan Baru' : 'Kata Laluan'}
                    </label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type={showPassword ? "text" : "password"}
                            className="w-full pl-10 pr-10 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-slate-50 focus:bg-white"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        <button 
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                    
                    {/* PASSWORD STRENGTH INDICATOR (untuk register & forgot_password) */}
                    {(authMode === 'register' || authMode === 'forgot_password') && password && (
                        <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <p className="text-[10px] font-bold text-slate-600 uppercase mb-2 flex items-center gap-1">
                                Keperluan Kata Laluan:
                            </p>
                            {(() => {
                                const validation = validatePassword(password);
                                return (
                                    <ul className="space-y-1 text-[10px]">
                                        <li className={`flex items-center gap-1.5 ${password.length >= 6 ? 'text-green-600 font-semibold' : 'text-slate-400'}`}>
                                            <span>{password.length >= 6 ? '✓' : '○'}</span> Minimum 6 aksara ({password.length})
                                        </li>
                                        <li className={`flex items-center gap-1.5 ${/[A-Z]/.test(password) ? 'text-green-600 font-semibold' : 'text-slate-400'}`}>
                                            <span>{/[A-Z]/.test(password) ? '✓' : '○'}</span> 1 huruf besar (A-Z)
                                        </li>
                                        <li className={`flex items-center gap-1.5 ${/[a-z]/.test(password) ? 'text-green-600 font-semibold' : 'text-slate-400'}`}>
                                            <span>{/[a-z]/.test(password) ? '✓' : '○'}</span> 1 huruf kecil (a-z)
                                        </li>
                                        <li className={`flex items-center gap-1.5 ${/\d/.test(password) ? 'text-green-600 font-semibold' : 'text-slate-400'}`}>
                                            <span>{/\d/.test(password) ? '✓' : '○'}</span> 1 nombor (0-9)
                                        </li>
                                        <li className={`flex items-center gap-1.5 ${/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) ? 'text-green-600 font-semibold' : 'text-slate-400'}`}>
                                            <span>{/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) ? '✓' : '○'}</span> 1 karakter khas (!@#$% dll)
                                        </li>
                                    </ul>
                                );
                            })()}
                        </div>
                    )}
                </div>

                {(authMode === 'register' || authMode === 'forgot_password') && (
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                            Sahkan Kata Laluan {authMode === 'forgot_password' ? 'Baru' : ''}
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input 
                                type={showConfirmPassword ? "text" : "password"}
                                className="w-full pl-10 pr-10 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-slate-50 focus:bg-white"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                            <button 
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                )}

                <button 
                    type="submit" 
                    disabled={loading || isLoading}
                    className={`w-full font-bold py-3 rounded-lg shadow-lg transition transform active:scale-[0.98] flex justify-center items-center gap-2 mt-4 ${
                        authMode === 'developer' 
                            ? 'bg-purple-600 text-white hover:bg-purple-700'
                            : 'bg-blue-900 text-white hover:bg-blue-800'
                    }`}
                >
                    {loading || isLoading ? <LoadingSpinner size="sm" color="border-white" /> : (authMode === 'developer' ? <Code size={18} /> : (authMode === 'login' ? <LogIn size={18} /> : (authMode === 'forgot_password' ? <RefreshCw size={18} /> : <UserPlus size={18} />)))}
                    {loading ? 'Memproses...' : (authMode === 'developer' ? 'Akses Console' : (authMode === 'login' ? 'Log Masuk' : (authMode === 'forgot_password' ? 'Tukar Kata Laluan' : 'Daftar Akaun')))}
                </button>
            </form>

            <div className="mt-6 text-center space-y-3">
                {authMode === 'login' && loginType === 'user' && (
                    <>
                        <p className="text-sm text-slate-600">
                            Belum ada akaun? <button onClick={() => switchMode('register')} className="text-blue-600 font-bold hover:underline">Daftar Sekolah</button>
                        </p>
                        <button onClick={() => switchMode('forgot_password')} className="text-xs text-slate-500 hover:text-blue-600 transition">
                            Lupa Kata Laluan?
                        </button>
                    </>
                )}
                {(authMode === 'register' || authMode === 'forgot_password') && (
                    <button onClick={() => switchMode('login')} className="text-blue-600 font-bold text-sm flex items-center justify-center gap-2 hover:underline w-full">
                        <ArrowLeft size={16} /> Kembali ke Log Masuk
                    </button>
                )}
            </div>
        </div>

        {/* Hidden Developer Icon - Bottom Right Corner */}
        {authMode === 'login' && (
          <button
            type="button"
            onClick={() => {
              setAuthMode('developer');
              resetForm();
            }}
            className="absolute bottom-4 right-4 w-8 h-8 rounded-full bg-slate-300/10 hover:bg-slate-300/20 border border-slate-300/10 hover:border-slate-300/30 flex items-center justify-center text-slate-400 hover:text-slate-300 transition-all duration-200 group"
            title="Developer Console"
          >
            <Code size={16} className="opacity-60 group-hover:opacity-100" />
          </button>
        )}
      </div>
    </div>
  );
};