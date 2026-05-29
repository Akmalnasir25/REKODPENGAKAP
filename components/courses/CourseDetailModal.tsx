import React, { useState, useEffect } from 'react';
import {
  X, Calendar, MapPin, Users, DollarSign, FileText, AlertCircle,
  CheckCircle, Upload, Loader, Send, Clock,
} from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import {
  registerForCourse,
  cancelRegistration,
  uploadCourseFile,
  uploadPaymentProof,
} from '../../services/courseService';
import type { Course, CourseRegistration, LeaderSession } from '../../types';

interface CourseDetailModalProps {
  course: Course;
  leader: LeaderSession;
  existingRegistration: CourseRegistration | null;
  onClose: () => void;
  onRegistered: () => void;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('ms-MY', {
      day: 'numeric', month: 'long', year: 'numeric', weekday: 'short',
    });
  } catch {
    return dateStr;
  }
}

export const CourseDetailModal: React.FC<CourseDetailModalProps> = ({
  course, leader, existingRegistration, onClose, onRegistered,
}) => {
  const [step, setStep] = useState<'detail' | 'register' | 'payment'>('detail');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Document uploads (during registration)
  const [icFile, setIcFile] = useState<File | null>(null);
  const [otherFile, setOtherFile] = useState<File | null>(null);

  // Payment proof
  const [paymentFile, setPaymentFile] = useState<File | null>(null);

  const isFull = (course.registeredCount || 0) >= course.quota;
  const isActive = existingRegistration && existingRegistration.status !== 'cancelled';
  const needsPayment = course.feeAmount > 0 && existingRegistration?.paymentStatus === 'unpaid';

  useEffect(() => {
    setError('');
    setSuccess('');
  }, [step]);

  const handleRegister = async () => {
    setError('');
    setSubmitting(true);
    try {
      // Upload IC if provided
      const documents: Array<{ documentType: 'ic' | 'sijil' | 'lain'; fileUrl: string; fileName: string; fileSize?: number }> = [];

      if (icFile) {
        const upload = await uploadCourseFile('course-documents', icFile, `leader-${leader.leaderId}/ic`);
        if (!upload.success || !upload.url) {
          setError(upload.message || 'Gagal muat naik salinan IC.');
          setSubmitting(false);
          return;
        }
        documents.push({
          documentType: 'ic',
          fileUrl: upload.url,
          fileName: icFile.name,
          fileSize: icFile.size,
        });
      }

      if (otherFile) {
        const upload = await uploadCourseFile('course-documents', otherFile, `leader-${leader.leaderId}/other`);
        if (!upload.success || !upload.url) {
          setError(upload.message || 'Gagal muat naik dokumen sokongan.');
          setSubmitting(false);
          return;
        }
        documents.push({
          documentType: 'lain',
          fileUrl: upload.url,
          fileName: otherFile.name,
          fileSize: otherFile.size,
        });
      }

      const res = await registerForCourse({
        courseId: course.id,
        leaderId: leader.leaderId,
        documents,
      });

      if (!res.success) {
        setError(res.message || 'Gagal mendaftar.');
        return;
      }

      setSuccess('Anda berjaya didaftarkan untuk kursus ini!');
      setTimeout(() => onRegistered(), 1500);
    } catch (err: any) {
      setError(err.message || 'Ralat sistem.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!existingRegistration) return;
    if (!confirm('Anda pasti mahu batalkan pendaftaran kursus ini?')) return;
    setSubmitting(true);
    try {
      const res = await cancelRegistration(existingRegistration.id, leader.email, 'Dibatalkan oleh pemimpin');
      if (!res.success) {
        setError(res.message || 'Gagal batalkan pendaftaran.');
        return;
      }
      setSuccess('Pendaftaran telah dibatalkan.');
      setTimeout(() => onRegistered(), 1200);
    } catch (err: any) {
      setError(err.message || 'Ralat sistem.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadPayment = async () => {
    if (!existingRegistration || !paymentFile) return;
    setSubmitting(true);
    try {
      const upload = await uploadCourseFile(
        'course-documents',
        paymentFile,
        `leader-${leader.leaderId}/payment`,
      );
      if (!upload.success || !upload.url) {
        setError(upload.message || 'Gagal muat naik bukti pembayaran.');
        return;
      }
      const saved = await uploadPaymentProof(existingRegistration.id, upload.url);
      if (!saved.success) {
        setError(saved.message || 'Gagal simpan bukti pembayaran.');
        return;
      }
      setSuccess('Bukti pembayaran berjaya dimuat naik. Admin akan sahkan tidak lama lagi.');
      setTimeout(() => onRegistered(), 1500);
    } catch (err: any) {
      setError(err.message || 'Ralat sistem.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-900 text-white px-5 py-4 flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                course.scope === 'negeri' ? 'bg-purple-200 text-purple-900' : 'bg-blue-200 text-blue-900'
              }`}>
                {course.scope === 'negeri' ? 'Peringkat Negeri' : 'Peringkat Daerah'}
              </span>
              <span className="text-[10px] font-mono opacity-80">{course.code}</span>
            </div>
            <h2 className="text-lg font-bold leading-tight">{course.name}</h2>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded-r text-sm flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 p-3 rounded-r text-sm flex items-start gap-2">
              <CheckCircle size={16} className="shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {step === 'detail' && (
            <>
              {/* Description */}
              {course.description && (
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-1">Penerangan</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{course.description}</p>
                </div>
              )}

              {/* Info grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <InfoRow icon={Calendar} label="Tarikh">
                  {formatDate(course.startDate)}<br />
                  <span className="text-slate-400">hingga</span><br />
                  {formatDate(course.endDate)}
                </InfoRow>
                <InfoRow icon={MapPin} label="Tempat">
                  <span className="font-bold">{course.venue}</span>
                  {course.venueAddress && <><br /><span className="text-xs text-slate-500">{course.venueAddress}</span></>}
                </InfoRow>
                <InfoRow icon={Users} label="Kuota">
                  <span className="font-bold text-lg">{course.registeredCount || 0}</span>
                  <span className="text-slate-400">/{course.quota} peserta</span>
                </InfoRow>
                <InfoRow icon={DollarSign} label="Yuran">
                  {course.feeAmount > 0 ? (
                    <span className="font-bold text-amber-700">RM {course.feeAmount.toFixed(2)}</span>
                  ) : (
                    <span className="font-bold text-emerald-700">PERCUMA</span>
                  )}
                </InfoRow>
                {course.registrationDeadline && (
                  <InfoRow icon={Clock} label="Tarikh Tutup Pendaftaran">
                    {formatDate(course.registrationDeadline)}
                  </InfoRow>
                )}
              </div>
            </>
          )}
          {step === 'register' && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                <p className="font-bold mb-1">?? Pendaftaran Kursus</p>
                <p>Maklumat anda akan didaftarkan secara automatik. Anda boleh muat naik dokumen sokongan (opsyenal).</p>
              </div>

              <div className="space-y-3">
                <FileUploadField
                  label="Salinan IC (opsyenal)"
                  accept="image/*,.pdf"
                  file={icFile}
                  onChange={setIcFile}
                  hint="JPG, PNG atau PDF. Maks 5MB."
                />
                <FileUploadField
                  label="Dokumen Sokongan Lain (opsyenal)"
                  accept="image/*,.pdf"
                  file={otherFile}
                  onChange={setOtherFile}
                  hint="Cth: sijil terdahulu, surat sokongan."
                />
              </div>

              {course.feeAmount > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                  <p className="font-bold mb-1">?? Yuran Kursus: RM {course.feeAmount.toFixed(2)}</p>
                  <p>Bukti pembayaran boleh dimuat naik selepas anda berdaftar.</p>
                </div>
              )}
            </>
          )}

          {step === 'payment' && existingRegistration && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                <p className="font-bold mb-1">?? Muat Naik Bukti Pembayaran</p>
                <p>Yuran kursus: <b>RM {course.feeAmount.toFixed(2)}</b></p>
                <p className="mt-1">Sila muat naik resit / screenshot pembayaran. Admin akan sahkan dalam masa 24-48 jam.</p>
              </div>
              <FileUploadField
                label="Bukti Pembayaran"
                accept="image/*,.pdf"
                file={paymentFile}
                onChange={setPaymentFile}
                hint="Screenshot, resit atau slip pembayaran. JPG/PNG/PDF, maks 5MB."
              />
            </>
          )}
        </div>
        {/* Footer Actions */}
        <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex flex-wrap gap-2 justify-end">
          {step === 'detail' && !isActive && !isFull && course.status === 'open' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Tutup
              </button>
              <button
                onClick={() => setStep('register')}
                className="px-5 py-2 text-sm font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition flex items-center gap-2"
              >
                <Send size={14} /> Daftar Kursus
              </button>
            </>
          )}

          {step === 'detail' && isActive && (
            <>
              {needsPayment && (
                <button
                  onClick={() => setStep('payment')}
                  className="px-4 py-2 text-sm font-bold bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition flex items-center gap-2"
                >
                  <DollarSign size={14} /> Muat Naik Bayaran
                </button>
              )}
              <button
                onClick={handleCancel}
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 rounded-lg transition"
              >
                Batalkan Pendaftaran
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Tutup
              </button>
            </>
          )}

          {step === 'detail' && isFull && !isActive && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              Tutup
            </button>
          )}

          {step === 'register' && (
            <>
              <button
                onClick={() => setStep('detail')}
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Kembali
              </button>
              <button
                onClick={handleRegister}
                disabled={submitting}
                className="px-5 py-2 text-sm font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition flex items-center gap-2 disabled:opacity-50"
              >
                {submitting ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {submitting ? 'Memproses...' : 'Sahkan Pendaftaran'}
              </button>
            </>
          )}

          {step === 'payment' && (
            <>
              <button
                onClick={() => setStep('detail')}
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Kembali
              </button>
              <button
                onClick={handleUploadPayment}
                disabled={submitting || !paymentFile}
                className="px-5 py-2 text-sm font-bold bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition flex items-center gap-2 disabled:opacity-50"
              >
                {submitting ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
                {submitting ? 'Memuat naik...' : 'Hantar Bukti Bayaran'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface InfoRowProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  children: React.ReactNode;
}

const InfoRow: React.FC<InfoRowProps> = ({ icon: Icon, label, children }) => (
  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
    <div className="flex items-center gap-1.5 mb-1">
      <Icon size={12} className="text-slate-400" />
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</p>
    </div>
    <div className="text-sm text-slate-800">{children}</div>
  </div>
);

interface FileUploadFieldProps {
  label: string;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
  hint?: string;
}

const FileUploadField: React.FC<FileUploadFieldProps> = ({ label, accept, file, onChange, hint }) => (
  <div>
    <label className="block text-xs font-bold text-slate-600 mb-1.5">{label}</label>
    <label className="flex items-center gap-2 px-3 py-2.5 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition">
      <Upload size={16} className="text-slate-400" />
      <span className="text-sm text-slate-600 flex-1 truncate">
        {file ? file.name : 'Pilih fail untuk dimuat naik...'}
      </span>
      <input
        type="file"
        accept={accept}
        onChange={(e) => onChange(e.target.files?.[0] || null)}
        className="hidden"
      />
    </label>
    {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
  </div>
);