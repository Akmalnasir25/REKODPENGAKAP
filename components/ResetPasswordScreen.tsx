import React, { useState } from 'react';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle, KeyRound } from 'lucide-react';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { validatePassword } from '../services/supabaseApi';
import { changePassword } from '../services/supabaseAuth';
import { LOGO_URL } from '../constants';

interface ResetPasswordScreenProps {
  /** Set jika pautan reset sudah tamat tempoh / tidak sah. */
  linkError?: string | null;
  /** Dipanggil selepas kata laluan berjaya ditukar (atau bila pengguna mahu kembali ke log masuk). */
  onDone: () => void;
}

export const ResetPasswordScreen: React.FC<ResetPasswordScreenProps> = ({ linkError, onDone }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const check = validatePassword(password);
    if (!check.valid) {
      setError(check.errors[0]);
      return;
    }
    if (password !== confirmPassword) {
      setError('Kata laluan tidak sepadan.');
      return;
    }

    setLoading(true);
    try {
      const result = await changePassword(password);
      if (result.status === 'success') {
        setSuccess(true);
      } else {
        setError(result.message || 'Gagal menukar kata laluan. Pautan mungkin telah tamat tempoh.');
      }
    } catch (err) {
      console.error(err);
      setError('Gagal menghubungi server. Pastikan talian internet stabil.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800 rounded-2xl shadow-2xl p-8 border border-slate-700">
        <div className="flex flex-col items-center mb-6">
          <img src={LOGO_URL} alt="Logo" className="w-16 h-16 object-contain mb-3" />
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <KeyRound size={20} className="text-amber-400" />
            Tetapkan Kata Laluan Baru
          </h1>
        </div>

        {linkError ? (
          <div className="text-center">
            <div className="bg-red-900/40 border border-red-700 text-red-200 rounded-lg p-4 mb-5 flex items-start gap-2 text-sm">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{linkError}</span>
            </div>
            <button
              onClick={onDone}
              className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold py-3 rounded-lg transition"
            >
              Kembali ke Log Masuk
            </button>
          </div>
        ) : success ? (
          <div className="text-center">
            <div className="bg-emerald-900/40 border border-emerald-700 text-emerald-200 rounded-lg p-4 mb-5 flex items-start gap-2 text-sm">
              <CheckCircle size={18} className="shrink-0 mt-0.5" />
              <span>Kata laluan berjaya ditukar. Sila log masuk semula dengan kata laluan baharu anda.</span>
            </div>
            <button
              onClick={onDone}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 rounded-lg transition"
            >
              Log Masuk
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-slate-400 text-sm text-center mb-2">
              Masukkan kata laluan baharu untuk akaun anda.
            </p>

            {error && (
              <div className="bg-red-900/40 border border-red-700 text-red-200 rounded-lg p-3 flex items-start gap-2 text-sm">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Kata Laluan Baru</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg py-3 pl-10 pr-10 text-white focus:outline-none focus:border-amber-500"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Sahkan Kata Laluan Baru</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg py-3 pl-10 pr-3 text-white focus:outline-none focus:border-amber-500"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-slate-900 font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2"
            >
              {loading ? <LoadingSpinner size="sm" color="border-slate-900" /> : <KeyRound size={18} />}
              {loading ? 'Memproses...' : 'Tukar Kata Laluan'}
            </button>

            <button
              type="button"
              onClick={onDone}
              className="w-full text-xs text-slate-500 hover:text-slate-300 transition"
            >
              Batal & kembali ke log masuk
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
