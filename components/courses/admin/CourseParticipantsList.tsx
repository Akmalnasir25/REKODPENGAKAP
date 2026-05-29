import React, { useState, useEffect } from 'react';
import {
  X, Users, CheckCircle, XCircle, AlertCircle, Loader,
  Award, Download, FileText, DollarSign, Phone, Mail,
} from 'lucide-react';
import { LoadingSpinner } from '../../ui/LoadingSpinner';
import {
  listRegistrationsByCourse, cancelRegistration, verifyPayment,
  setResult, markAttendance, setCertificateStatus,
} from '../../../services/courseService';
import { generateAndUploadCertificate } from '../../../services/certificateService';
import type { Course, CourseRegistration } from '../../../types';

interface CourseParticipantsListProps {
  course: Course;
  adminUser: string;
  onClose: () => void;
  onChanged: () => void;
}

type Tab = 'all' | 'attendance' | 'results';

export const CourseParticipantsList: React.FC<CourseParticipantsListProps> = ({
  course, adminUser, onClose, onChanged,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [registrations, setRegistrations] = useState<CourseRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadRegistrations = async () => {
    setLoading(true);
    const data = await listRegistrationsByCourse(course.id);
    setRegistrations(data);
    setLoading(false);
  };

  useEffect(() => { loadRegistrations(); }, [course.id]);

  const handleVerifyPayment = async (regId: string, status: 'paid' | 'unpaid' | 'waived') => {
    setActionId(regId);
    await verifyPayment(regId, status, adminUser);
    await loadRegistrations();
    onChanged();
    setActionId(null);
  };

  const handleMarkAttendance = async (regId: string, leaderId: string) => {
    setActionId(regId);
    await markAttendance(course.id, leaderId, regId, 'manual', adminUser);
    await loadRegistrations();
    onChanged();
    setActionId(null);
  };

  const handleSetResult = async (regId: string, status: 'passed' | 'failed' | 'absent', grade: string) => {
    setActionId(regId);
    await setResult(regId, status, grade || null, null);
    await loadRegistrations();
    onChanged();
    setActionId(null);
  };

  const handleGenerateCert = async (reg: CourseRegistration) => {
    if (!reg.leader) return;
    setActionId(reg.id);
    const res = await generateAndUploadCertificate(reg, course, reg.leader);
    if (!res.success) {
      alert(res.message || 'Gagal generate sijil.');
      setActionId(null);
      await loadRegistrations();
      onChanged();
      return;
    }
    // Set status: kalau requires approval -> pending, jika tidak -> auto-released
    const nextStatus = course.certificateRequiresApproval ? 'pending' : 'released';
    await setCertificateStatus(reg.id, nextStatus, adminUser);
    await loadRegistrations();
    onChanged();
    setActionId(null);
  };

  const handleApproveCert = async (regId: string) => {
    setActionId(regId);
    await setCertificateStatus(regId, 'released', adminUser);
    await loadRegistrations();
    onChanged();
    setActionId(null);
  };

  const handleRejectCert = async (regId: string) => {
    const reason = prompt('Sebab penolakan sijil:');
    if (!reason) return;
    setActionId(regId);
    await setCertificateStatus(regId, 'rejected', adminUser, reason);
    await loadRegistrations();
    onChanged();
    setActionId(null);
  };

  const handleCancelByAdmin = async (regId: string) => {
    const reason = prompt('Sebab pembatalan:');
    if (!reason) return;
    setActionId(regId);
    await cancelRegistration(regId, adminUser, reason);
    await loadRegistrations();
    onChanged();
    setActionId(null);
  };

  const activeRegs = registrations.filter((r) => r.status !== 'cancelled');

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-900 text-white px-5 py-4 flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-mono opacity-80 uppercase">{course.code}</p>
            <h2 className="text-lg font-bold leading-tight">{course.name}</h2>
            <p className="text-xs text-emerald-100 mt-1 flex items-center gap-2">
              <Users size={12} /> {activeRegs.length} pendaftar aktif daripada {course.quota} kuota
            </p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex border-b border-slate-200 bg-slate-50">
          {[
            { id: 'all' as Tab, label: 'Semua Pendaftar', count: activeRegs.length },
            { id: 'attendance' as Tab, label: 'Kehadiran', count: activeRegs.filter((r) => r.status === 'attended' || r.status === 'passed' || r.status === 'failed').length },
            { id: 'results' as Tab, label: 'Keputusan', count: activeRegs.filter((r) => r.status === 'passed' || r.status === 'failed').length },
          ].map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-3 px-4 text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition ${
                activeTab === t.id ? 'border-emerald-500 text-emerald-700 bg-white' : 'border-transparent text-slate-500'
              }`}>
              {t.label} <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded font-mono">{t.count}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-12"><LoadingSpinner /></div>
          ) : activeRegs.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users size={40} className="mx-auto mb-3 text-slate-200" />
              <p className="text-sm font-semibold">Tiada pendaftaran lagi</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeRegs.map((r) => (
                <RegistrationRow
                  key={r.id}
                  reg={r}
                  course={course}
                  isProcessing={actionId === r.id}
                  activeTab={activeTab}
                  onVerifyPayment={(s) => handleVerifyPayment(r.id, s)}
                  onMarkAttendance={() => handleMarkAttendance(r.id, r.leaderId)}
                  onSetResult={(s, g) => handleSetResult(r.id, s, g)}
                  onGenerateCert={() => handleGenerateCert(r)}
                  onApproveCert={() => handleApproveCert(r.id)}
                  onRejectCert={() => handleRejectCert(r.id)}
                  onCancelByAdmin={() => handleCancelByAdmin(r.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Registration Row Component
// ============================================================

interface RowProps {
  reg: CourseRegistration;
  course: Course;
  isProcessing: boolean;
  activeTab: 'all' | 'attendance' | 'results';
  onVerifyPayment: (s: 'paid' | 'unpaid' | 'waived') => void;
  onMarkAttendance: () => void;
  onSetResult: (s: 'passed' | 'failed' | 'absent', grade: string) => void;
  onGenerateCert: () => void;
  onApproveCert: () => void;
  onRejectCert: () => void;
  onCancelByAdmin: () => void;
}

const RegistrationRow: React.FC<RowProps> = ({
  reg, course, isProcessing, activeTab,
  onVerifyPayment, onMarkAttendance, onSetResult, onGenerateCert, onApproveCert, onRejectCert, onCancelByAdmin,
}) => {
  const [grade, setGrade] = useState(reg.resultGrade || '');
  const leader = reg.leader;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 hover:shadow-sm transition">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-bold text-slate-800">{leader?.fullName}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
              leader?.leaderType === 'guru' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {leader?.leaderType === 'guru' ? 'Guru' : 'Luar'}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
              reg.status === 'passed' ? 'bg-emerald-100 text-emerald-700' :
              reg.status === 'failed' ? 'bg-red-100 text-red-700' :
              reg.status === 'attended' ? 'bg-blue-100 text-blue-700' :
              reg.status === 'absent' ? 'bg-amber-100 text-amber-700' :
              'bg-slate-100 text-slate-600'
            }`}>{reg.status}</span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
            <span className="flex items-center gap-1"><FileText size={10} /> {leader?.icNumber}</span>
            {leader?.email && <span className="flex items-center gap-1"><Mail size={10} /> {leader.email}</span>}
            {leader?.phoneNumber && <span className="flex items-center gap-1"><Phone size={10} /> {leader.phoneNumber}</span>}
          </div>
          {(leader?.schoolName || leader?.daerahName) && (
            <p className="text-xs text-slate-500 mt-0.5">
              {[leader?.schoolName, leader?.daerahName, leader?.negeriName].filter(Boolean).join(' | ')}
            </p>
          )}
        </div>
        <button onClick={onCancelByAdmin} disabled={isProcessing}
          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition disabled:opacity-50" title="Batalkan pendaftaran">
          <XCircle size={14} />
        </button>
      </div>

      {/* Action buttons by tab */}
      <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
        {activeTab === 'all' && course.feeAmount > 0 && (
          <>
            <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${
              reg.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-700' :
              reg.paymentStatus === 'waived' ? 'bg-slate-100 text-slate-600' :
              'bg-red-100 text-red-700'
            }`}>
              <DollarSign size={10} className="inline -mt-0.5 mr-0.5" />{reg.paymentStatus}
            </span>
            {reg.paymentProofUrl && (
              <a href={reg.paymentProofUrl} target="_blank" rel="noopener noreferrer"
                className="text-[10px] font-bold px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200">
                Lihat Bukti
              </a>
            )}
            {reg.paymentStatus !== 'paid' && (
              <button onClick={() => onVerifyPayment('paid')} disabled={isProcessing}
                className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                Sahkan Bayar
              </button>
            )}
            {reg.paymentStatus !== 'waived' && (
              <button onClick={() => onVerifyPayment('waived')} disabled={isProcessing}
                className="text-[10px] font-bold px-2 py-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50">
                Bebas Yuran
              </button>
            )}
          </>
        )}

        {(activeTab === 'attendance' || activeTab === 'all') && reg.status === 'registered' && (
          <button onClick={onMarkAttendance} disabled={isProcessing}
            className="text-[10px] font-bold px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
            <CheckCircle size={10} /> Tanda Hadir
          </button>
        )}

        {(activeTab === 'results' || activeTab === 'all') && reg.status === 'attended' && (
          <>
            <input type="text" value={grade} onChange={(e) => setGrade(e.target.value)}
              placeholder="Gred (cth: A)"
              className="text-[10px] px-2 py-1 border border-slate-200 rounded w-20" />
            <button onClick={() => onSetResult('passed', grade)} disabled={isProcessing}
              className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
              Lulus
            </button>
            <button onClick={() => onSetResult('failed', grade)} disabled={isProcessing}
              className="text-[10px] font-bold px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
              Gagal
            </button>
          </>
        )}

        {reg.status === 'passed' && course.hasDigitalCertificate && !reg.certificateUrl && (
          <button onClick={onGenerateCert} disabled={isProcessing}
            className="text-[10px] font-bold px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1">
            {isProcessing ? <Loader size={10} className="animate-spin" /> : <Award size={10} />}
            {course.certificateRequiresApproval ? 'Generate & Tunggu Approve' : 'Generate Sijil'}
          </button>
        )}
        {reg.status === 'passed' && !course.hasDigitalCertificate && (
          <span className="text-[10px] font-semibold px-2 py-1 rounded bg-slate-100 text-slate-500 flex items-center gap-1">
            <AlertCircle size={10} /> Tiada sijil digital
          </span>
        )}
        {/* Sijil sudah generate, tunggu approval */}
        {reg.certificateUrl && (reg as any).certificateStatus === 'pending' && (
          <>
            <span className="text-[10px] font-bold px-2 py-1 rounded bg-amber-100 text-amber-800 flex items-center gap-1">
              <Loader size={10} /> Menunggu Approve
            </span>
            <button onClick={onApproveCert} disabled={isProcessing}
              className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1">
              <CheckCircle size={10} /> Approve & Release
            </button>
            <button onClick={onRejectCert} disabled={isProcessing}
              className="text-[10px] font-bold px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
              Reject
            </button>
            <a href={reg.certificateUrl} target="_blank" rel="noopener noreferrer"
              className="text-[10px] font-bold px-2 py-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300 flex items-center gap-1">
              <Download size={10} /> Preview
            </a>
          </>
        )}
        {/* Sijil released - boleh download */}
        {reg.certificateUrl && (reg as any).certificateStatus !== 'pending' && (reg as any).certificateStatus !== 'rejected' && (
          <a href={reg.certificateUrl} target="_blank" rel="noopener noreferrer"
            className="text-[10px] font-bold px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600 flex items-center gap-1">
            <Download size={10} /> Sijil
          </a>
        )}
        {(reg as any).certificateStatus === 'rejected' && (
          <span className="text-[10px] font-bold px-2 py-1 rounded bg-red-100 text-red-700 flex items-center gap-1">
            <AlertCircle size={10} /> Sijil Ditolak
          </span>
        )}
      </div>
    </div>
  );
};