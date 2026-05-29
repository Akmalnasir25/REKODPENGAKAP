import React, { useState, useEffect, useMemo } from 'react';
import {
  Lock, UserPlus, LogIn, AlertCircle, Eye, EyeOff, RefreshCw,
  ArrowLeft, User, Mail, Phone, IdCard, Briefcase, MapPin, Users,
} from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import {
  registerLeader,
  loginLeader,
  resetLeaderPasswordByIC,
  saveLeaderSession,
} from '../../services/leaderAuthService';
import type { Negeri, Daerah, School } from '../../types';
import { APP_VERSION } from '../../constants';

interface LeaderAuthScreenProps {
  onLoginSuccess: () => void;
  onBack: () => void;
  schools?: School[];
  negeriList?: Negeri[];
  daerahList?: Daerah[];
}

type LeaderAuthMode = 'login' | 'register' | 'forgot_password';

export const LeaderAuthScreen: React.FC<LeaderAuthScreenProps> = ({
  onLoginSuccess,
  onBack,
  schools = [],
  negeriList = [],
  daerahList = [],
}) => {
  const [authMode, setAuthMode] = useState<LeaderAuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Register fields
  const [fullName, setFullName] = useState('');
  const [icNumber, setIcNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [leaderType, setLeaderType] = useState<'guru' | 'luar'>('guru');
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [selectedNegeriId, setSelectedNegeriId] = useState('');
  const [selectedDaerahId, setSelectedDaerahId] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Forgot password fields
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotIC, setForgotIC] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const filteredDaerah = useMemo(() => {
    if (!selectedNegeriId) return [] as Daerah[];
    const negeri = negeriList.find((n) => (n as any).id === selectedNegeriId);
    if (!negeri) return [];
    return daerahList.filter((d: any) => d.negeri_id === selectedNegeriId || d.negeriCode === (negeri as any).code);
  }, [selectedNegeriId, negeriList, daerahList]);

  // Reset daerah bila negeri berubah
  useEffect(() => {
    setSelectedDaerahId('');
  }, [selectedNegeriId]);

  // Auto-isi negeri/daerah dari sekolah jika guru pilih sekolah
  useEffect(() => {
    if (leaderType !== 'guru' || !selectedSchoolId) return;
    const sch = schools.find((s: any) => s.id === selectedSchoolId || s.schoolCode === selectedSchoolId);
    if (!sch) return;
    const negeri = negeriList.find((n: any) => n.code === (sch as any).negeriCode);
    if (negeri) {
      setSelectedNegeriId((negeri as any).id);
      const daerah = daerahList.find((d: any) =>
        d.code === (sch as any).daerahCode &&
        (d.negeri_id === (negeri as any).id || d.negeriCode === (negeri as any).code),
      );
      if (daerah) setSelectedDaerahId((daerah as any).id);
    }
  }, [selectedSchoolId, leaderType, schools, negeriList, daerahList]);

  const resetForm = () => {
    setError('');
    setSuccess('');
    setPassword('');
    setConfirmPassword('');
    setNewPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const switchMode = (mode: LeaderAuthMode) => {
    setAuthMode(mode);
    resetForm();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await loginLeader({ email: email.trim(), password });
      if (!res.success || !res.leader) {
        setError(res.message || 'Log masuk gagal.');
        return;
      }
      saveLeaderSession(res.leader);
      onLoginSuccess();
    } catch (err: any) {
      setError(err.message || 'Ralat sistem.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Kata laluan tidak sepadan.');
      return;
    }
    if (password.length < 8) {
      setError('Kata laluan mesti sekurang-kurangnya 8 aksara.');
      return;
    }
    if (!leaderType) {
      setError('Sila pilih jenis pemimpin.');
      return;
    }

    setLoading(true);
    try {
      const res = await registerLeader({
        email: email.trim(),
        password,
        icNumber: icNumber.trim(),
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        leaderType,
        schoolId: selectedSchoolId || null,
        negeriId: selectedNegeriId || null,
        daerahId: selectedDaerahId || null,
      });
      if (!res.success || !res.leader) {
        setError(res.message || 'Pendaftaran gagal.');
        return;
      }
      // Auto-login
      saveLeaderSession(res.leader);
      setSuccess('Akaun berjaya didaftarkan! Mengalihkan ke dashboard...');
      setTimeout(() => onLoginSuccess(), 1200);
    } catch (err: any) {
      setError(err.message || 'Ralat sistem.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (newPassword.length < 8) {
      setError('Kata laluan baru mesti sekurang-kurangnya 8 aksara.');
      return;
    }
    setLoading(true);
    try {
      const res = await resetLeaderPasswordByIC(forgotEmail.trim(), forgotIC.trim(), newPassword);
      if (!res.success) {
        setError(res.message || 'Gagal reset kata laluan.');
        return;
      }
      setSuccess('Kata laluan berjaya ditukar. Sila log masuk semula.');
      setTimeout(() => switchMode('login'), 1500);
    } catch (err: any) {
      setError(err.message || 'Ralat sistem.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    if (authMode === 'login') return handleLogin(e);
    if (authMode === 'register') return handleRegister(e);
    return handleForgotPassword(e);
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden font-sans" style={{ background: 'linear-gradient(180deg, #0F2F1A 0%, #051E10 45%, #02110A 100%)' }}>
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full blur-[120px] opacity-30" style={{ background: '#10b981' }}></div>
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-amber-600 rounded-full blur-[120px] opacity-15"></div>
      </div>

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden relative z-10 flex flex-col min-h-[600px] border border-emerald-900/30">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-900 text-white px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/15 p-2.5 rounded-lg">
              <Users size={26} className="text-amber-300" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Portal Pemimpin</h1>
              <p className="text-emerald-100 text-xs font-mono uppercase tracking-widest opacity-80">ScoutNadi - Kursus</p>
            </div>
          </div>
          <button
            onClick={onBack}
            className="bg-white/10 hover:bg-white/20 p-2 px-3 rounded-lg text-white text-xs flex items-center gap-2 transition border border-white/20"
          >
            <ArrowLeft size={14} /> Kembali
          </button>
        </div>

        {/* Form Content */}
        <div className="p-8 md:p-10 flex flex-col">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-800 mb-1">
              {authMode === 'login' ? 'Log Masuk Pemimpin' :
               authMode === 'register' ? 'Daftar Akaun Pemimpin' : 'Reset Kata Laluan'}
            </h2>
            <p className="text-slate-500 text-sm">
              {authMode === 'login' ? 'Akses portal kursus untuk daftar program & lihat sijil.' :
               authMode === 'register' ? 'Akaun individu untuk pemimpin (guru / luar) yang ingin mendaftar kursus.' :
               'Sahkan email & no IC anda untuk tukar kata laluan.'}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded-r mb-4 text-sm flex items-start gap-2">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 p-3 rounded-r mb-4 text-sm">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">            {/* LOGIN MODE */}
            {authMode === 'login' && (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@anda.com"
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Kata Laluan</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="��������"
                      className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </>
            )}
            {/* REGISTER MODE */}
            {authMode === 'register' && (
              <>
                {/* Jenis Pemimpin */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Jenis Pemimpin</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setLeaderType('guru')}
                      className={`flex flex-col items-center gap-1 py-3 rounded-lg border-2 transition ${
                        leaderType === 'guru'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      <Briefcase size={18} />
                      <span className="text-xs font-bold">Guru</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeaderType('luar')}
                      className={`flex flex-col items-center gap-1 py-3 rounded-lg border-2 transition ${
                        leaderType === 'luar'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      <User size={18} />
                      <span className="text-xs font-bold">Luar</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Nama Penuh</label>
                    <div className="relative">
                      <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
                        placeholder="Nama seperti dalam IC"
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">No IC</label>
                    <div className="relative">
                      <IdCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text" required value={icNumber} onChange={(e) => setIcNumber(e.target.value)}
                        placeholder="Cth: 901231101234"
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Email</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                        placeholder="email@anda.com"
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">No Telefon</label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="tel" required value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="0123456789"
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      />
                    </div>
                  </div>
                </div>
                {/* Sekolah (jika guru) */}
                {leaderType === 'guru' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                      Sekolah <span className="text-slate-300 font-normal">(opsyenal)</span>
                    </label>
                    <select
                      value={selectedSchoolId}
                      onChange={(e) => setSelectedSchoolId(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white"
                    >
                      <option value="">-- Tiada sekolah --</option>
                      {schools.map((s: any) => (
                        <option key={s.id || s.schoolCode} value={s.id || s.schoolCode}>
                          {s.schoolCode} - {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Negeri & Daerah */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Negeri</label>
                    <div className="relative">
                      <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <select
                        value={selectedNegeriId}
                        onChange={(e) => setSelectedNegeriId(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white"
                      >
                        <option value="">-- Pilih Negeri --</option>
                        {negeriList.map((n: any) => (
                          <option key={n.id} value={n.id}>{n.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Daerah</label>
                    <select
                      value={selectedDaerahId}
                      onChange={(e) => setSelectedDaerahId(e.target.value)}
                      disabled={!selectedNegeriId}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white disabled:bg-slate-50"
                    >
                      <option value="">-- Pilih Daerah --</option>
                      {filteredDaerah.map((d: any) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Password */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Kata Laluan</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'} required value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min 8 aksara"
                        className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Sahkan Kata Laluan</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'} required value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Ulangi kata laluan"
                        className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
            {/* FORGOT PASSWORD MODE */}
            {authMode === 'forgot_password' && (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Email Berdaftar</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email" required value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="email@anda.com"
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">No IC (Pengesahan)</label>
                  <div className="relative">
                    <IdCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text" required value={forgotIC}
                      onChange={(e) => setForgotIC(e.target.value)}
                      placeholder="Cth: 901231101234"
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Kata Laluan Baru</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'} required value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min 8 aksara"
                      className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full font-bold py-3 rounded-lg shadow-lg transition transform active:scale-[0.98] flex justify-center items-center gap-2 mt-2 bg-emerald-700 text-white hover:bg-emerald-800"
            >
              {loading ? <LoadingSpinner size="sm" color="border-white" /> : (
                authMode === 'login' ? <LogIn size={18} /> :
                authMode === 'register' ? <UserPlus size={18} /> : <RefreshCw size={18} />
              )}
              {loading ? 'Memproses...' : (
                authMode === 'login' ? 'Log Masuk' :
                authMode === 'register' ? 'Daftar Akaun' : 'Tukar Kata Laluan'
              )}
            </button>
          </form>

          <div className="mt-6 text-center space-y-2">
            {authMode === 'login' && (
              <>
                <p className="text-sm text-slate-600">
                  Belum ada akaun? <button onClick={() => switchMode('register')} className="text-emerald-700 font-bold hover:underline">Daftar di sini</button>
                </p>
                <button onClick={() => switchMode('forgot_password')} className="text-xs text-slate-500 hover:text-emerald-700 transition">
                  Lupa Kata Laluan?
                </button>
              </>
            )}
            {(authMode === 'register' || authMode === 'forgot_password') && (
              <button onClick={() => switchMode('login')} className="text-emerald-700 font-bold text-sm flex items-center justify-center gap-2 hover:underline w-full">
                <ArrowLeft size={16} /> Kembali ke Log Masuk
              </button>
            )}
            <p className="text-[10px] text-slate-300 mt-4 font-mono">{APP_VERSION.split(' ')[0]}</p>
          </div>
        </div>
      </div>
    </div>
  );
};