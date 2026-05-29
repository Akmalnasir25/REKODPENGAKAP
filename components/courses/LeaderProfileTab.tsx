import React, { useState } from 'react';
import {
  User, Mail, Phone, IdCard, Briefcase, MapPin, Save, Loader,
  AlertCircle, CheckCircle, Edit2, X,
} from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import {
  updateLeaderProfile, saveLeaderSession, getLeaderSession,
} from '../../services/leaderAuthService';
import type { LeaderSession } from '../../types';

interface LeaderProfileTabProps {
  session: LeaderSession;
  onSessionUpdated?: (session: LeaderSession) => void;
}

export const LeaderProfileTab: React.FC<LeaderProfileTabProps> = ({ session, onSessionUpdated }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(session.fullName || '');
  const [icNumber, setIcNumber] = useState(session.icNumber || '');
  const [phoneNumber, setPhoneNumber] = useState(session.phoneNumber || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const startEdit = () => {
    setFullName(session.fullName || '');
    setIcNumber(session.icNumber || '');
    setPhoneNumber(session.phoneNumber || '');
    setError('');
    setSuccess('');
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setError('');
    setSuccess('');
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const res = await updateLeaderProfile(session.leaderId, {
        fullName,
        icNumber,
        phoneNumber,
      });
      if (!res.success) {
        setError(res.message || 'Gagal kemaskini profil.');
        return;
      }

      // Update session di localStorage
      const currentSession = getLeaderSession();
      if (currentSession) {
        const updatedLeader: any = {
          id: currentSession.leaderId,
          email: currentSession.email,
          fullName: fullName.trim(),
          icNumber: icNumber.trim() ? (icNumber.replace(/\D/g, '') || icNumber.trim().toUpperCase()) : '',
          phoneNumber: phoneNumber.trim(),
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
        if (newSession && onSessionUpdated) onSessionUpdated(newSession);
      }

      setSuccess('Profil berjaya dikemaskini.');
      setIsEditing(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Ralat sistem.');
    } finally {
      setSubmitting(false);
    }
  };

  const isMissingIC = !session.icNumber;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-800">Maklumat Akaun</h3>
        {!isEditing && (
          <button
            onClick={startEdit}
            className="bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-2 transition"
          >
            <Edit2 size={12} /> Edit Profil
          </button>
        )}
      </div>

      {/* Notice IC missing */}
      {isMissingIC && !isEditing && (
        <div className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded-r text-xs text-amber-800 flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold mb-1">Sila lengkapkan No IC anda</p>
            <p>No IC diperlukan untuk pengesahan kursus dan reset kata laluan. Klik "Edit Profil" untuk isi.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded-r text-sm flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 p-3 rounded-r text-sm flex items-start gap-2">
          <CheckCircle size={16} className="shrink-0 mt-0.5" /><span>{success}</span>
        </div>
      )}

      {isEditing ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Nama Penuh</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">No IC</label>
            <div className="relative">
              <IdCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={icNumber} onChange={(e) => setIcNumber(e.target.value)}
                placeholder="Cth: 901231101234"
                className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">No Telefon</label>
            <div className="relative">
              <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={submitting}
              className="flex-1 bg-blue-900 hover:bg-blue-800 text-white text-sm font-bold px-3 py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50">
              {submitting ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
              {submitting ? 'Menyimpan...' : 'Simpan'}
            </button>
            <button onClick={cancelEdit} disabled={submitting}
              className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-1.5">
              <X size={14} /> Batal
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <ProfileItem icon={User} label="Nama Penuh" value={session.fullName} />
          <ProfileItem icon={IdCard} label="No IC" value={session.icNumber || ''} placeholder="Belum diisi" />
          <ProfileItem icon={Mail} label="Email" value={session.email} />
          <ProfileItem icon={Phone} label="No Telefon" value={session.phoneNumber} />
          {session.schoolName && (
            <ProfileItem
              icon={Briefcase}
              label="Sekolah"
              value={session.schoolName}
              subtitle={session.schoolLinkStatus ? `Status: ${session.schoolLinkStatus}` : undefined}
            />
          )}
          {(session.negeriName || session.daerahName) && (
            <ProfileItem
              icon={MapPin}
              label="Lokasi"
              value={[session.daerahName, session.negeriName].filter(Boolean).join(', ')}
            />
          )}
        </div>
      )}
    </div>
  );
};

interface ProfileItemProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  placeholder?: string;
  subtitle?: string;
}

const ProfileItem: React.FC<ProfileItemProps> = ({ icon: Icon, label, value, placeholder, subtitle }) => (
  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
    <div className="bg-amber-100 p-2 rounded-lg">
      <Icon size={16} className="text-blue-900" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</p>
      {value ? (
        <p className="text-sm font-semibold text-slate-800 truncate">{value}</p>
      ) : (
        <p className="text-sm font-semibold text-amber-600 italic">{placeholder || 'Belum diisi'}</p>
      )}
      {subtitle && <p className="text-[10px] text-slate-400">{subtitle}</p>}
    </div>
  </div>
);