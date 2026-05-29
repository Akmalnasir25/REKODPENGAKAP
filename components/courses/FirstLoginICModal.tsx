import React, { useState } from 'react';
import { IdCard, AlertCircle, Save, Loader, X } from 'lucide-react';
import {
  updateLeaderProfile, saveLeaderSession, getLeaderSession,
} from '../../services/leaderAuthService';
import type { LeaderSession } from '../../types';

interface FirstLoginICModalProps {
  session: LeaderSession;
  onComplete: (newSession: LeaderSession) => void;
  onSkip?: () => void;
  allowSkip?: boolean;
}

/**
 * Modal first-login untuk pemimpin yang belum isi IC.
 * Force user isi IC sebelum boleh guna sistem (default).
 * Boleh skip jika allowSkip=true (cth untuk debugging).
 */
export const FirstLoginICModal: React.FC<FirstLoginICModalProps> = ({
  session, onComplete, onSkip, allowSkip = false,
}) => {
  const [icNumber, setIcNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    if (!icNumber.trim()) {
      setError('Sila masukkan No IC anda.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await updateLeaderProfile(session.leaderId, { icNumber });
      if (!res.success) {
        setError(res.message || 'Gagal simpan IC.');
        return;
      }

      // Update session
      const currentSession = getLeaderSession();
      if (currentSession) {
        const icClean = icNumber.replace(/\D/g, '') || icNumber.trim().toUpperCase();
        const updatedLeader: any = {
          id: currentSession.leaderId,
          email: currentSession.email,
          fullName: currentSession.fullName,
          icNumber: icClean,
          phoneNumber: currentSession.phoneNumber,
          leaderType: currentSession.leaderType,
          schoolId: currentSession.schoolId,
          schoolName: currentSession.schoolName,
          schoolCode: currentSession.schoolCode,
          schoolLinkStatus: currentSession.schoolLinkStatus,
          passwordHash: currentSession.passwordHash,
          negeriId: currentSession.negeriId,
          negeriName: currentSession.negeriName,
          daerahId: currentSession.daerahId,
          daerahName: currentSession.daerahName,
        };
        saveLeaderSession(updatedLeader);
        const newSession = getLeaderSession();
        if (newSession) onComplete(newSession);
      }
    } catch (err: any) {
      setError(err.message || 'Ralat sistem.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white px-5 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <AlertCircle size={20} />
            <h2 className="text-lg font-bold">Lengkapkan Profil</h2>
          </div>
          {allowSkip && onSkip && (
            <button onClick={onSkip} className="text-white/80 hover:text-white">
              <X size={20} />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded-r text-xs text-amber-800">
            <p className="font-bold mb-1">Selamat datang, {session.fullName}!</p>
            <p>Sila isi No Kad Pengenalan anda untuk teruskan menggunakan sistem. IC ini diperlukan untuk pengesahan kursus dan reset kata laluan.</p>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded-r text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              No Kad Pengenalan <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <IdCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={icNumber}
                onChange={(e) => setIcNumber(e.target.value)}
                placeholder="Cth: 901231101234"
                autoFocus
                className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1 italic">
              *12 digit (warga Malaysia) atau no pasport.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={submitting || !icNumber.trim()}
              className="flex-1 bg-blue-900 hover:bg-blue-800 text-white text-sm font-bold px-3 py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
              {submitting ? 'Menyimpan...' : 'Simpan & Teruskan'}
            </button>
            {allowSkip && onSkip && (
              <button
                onClick={onSkip}
                disabled={submitting}
                className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Nanti
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
