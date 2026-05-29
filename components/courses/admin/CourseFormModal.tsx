import React, { useState, useEffect } from 'react';
import { X, Save, Loader, AlertCircle, Award, Upload } from 'lucide-react';
import { LoadingSpinner } from '../../ui/LoadingSpinner';
import { createCourse, updateCourse } from '../../../services/courseService';
import { listTemplates, type CertificateTemplate } from '../../../services/certificateTemplateService';
import { uploadToR2 } from '../../../services/r2Service';
import type { Course, CourseScope, CourseStatus } from '../../../types';

interface CourseFormModalProps {
  course: Course | null; // null = create mode
  adminScope: 'negeri' | 'daerah' | 'developer';
  adminNegeriId?: string | null;
  adminDaerahId?: string | null;
  adminUser: string;
  allowedScope: CourseScope;
  negeriList: Array<{ id: string; code: string; name: string }>;
  daerahList: Array<{ id: string; code: string; name: string; negeri_id?: string; negeriCode?: string }>;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

export const CourseFormModal: React.FC<CourseFormModalProps> = ({
  course, adminScope, adminNegeriId, adminDaerahId, adminUser,
  allowedScope, negeriList, daerahList, onClose, onSaved,
}) => {
  const isEdit = !!course;

  const [scope, setScope] = useState<CourseScope>(course?.scope || allowedScope);
  const [name, setName] = useState(course?.name || '');
  const [code, setCode] = useState(course?.code || '');
  const [description, setDescription] = useState(course?.description || '');
  const [negeriId, setNegeriId] = useState(course?.negeriId || adminNegeriId || '');
  const [daerahId, setDaerahId] = useState(course?.daerahId || adminDaerahId || '');
  const [startDate, setStartDate] = useState(course?.startDate || '');
  const [endDate, setEndDate] = useState(course?.endDate || '');
  const [venue, setVenue] = useState(course?.venue || '');
  const [venueAddress, setVenueAddress] = useState(course?.venueAddress || '');
  const [quota, setQuota] = useState(course?.quota || 30);
  const [feeAmount, setFeeAmount] = useState(course?.feeAmount || 0);
  const [registrationDeadline, setRegistrationDeadline] = useState(course?.registrationDeadline || '');
  const [status, setStatus] = useState<CourseStatus>(course?.status || 'open');

  // Certificate settings
  const [hasDigitalCertificate, setHasDigitalCertificate] = useState(course?.hasDigitalCertificate || false);
  const [certificateRequiresApproval, setCertificateRequiresApproval] = useState(course?.certificateRequiresApproval ?? true);
  const [certificateTemplateId, setCertificateTemplateId] = useState<string>(course?.certificateTemplateId || '');
  const [availableTemplates, setAvailableTemplates] = useState<CertificateTemplate[]>([]);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [customTemplateUrl, setCustomTemplateUrl] = useState<string>(course?.certificateTemplateUrl || '');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Filter daerah ikut negeri yang dipilih
  const filteredDaerah = daerahList.filter((d) =>
    d.negeri_id === negeriId || negeriList.find((n) => n.id === negeriId)?.code === d.negeriCode,
  );

  useEffect(() => {
    if (scope === 'negeri') setDaerahId('');
  }, [scope]);

  // Reset daerah jika negeri berubah
  useEffect(() => {
    if (course && course.daerahId === daerahId) return;
    setDaerahId('');
  }, [negeriId]);

  // Load templates yang sesuai dengan scope semasa
  useEffect(() => {
    if (!hasDigitalCertificate) return;
    let cancelled = false;
    (async () => {
      const filter: any = {};
      if (scope === 'negeri' && negeriId) filter.negeriId = negeriId;
      if (scope === 'daerah' && daerahId) filter.daerahId = daerahId;
      const templates = await listTemplates(filter);
      if (!cancelled) setAvailableTemplates(templates);
    })();
    return () => { cancelled = true; };
  }, [hasDigitalCertificate, scope, negeriId, daerahId]);

  const handleUploadTemplate = async (file: File) => {
    setUploadingTemplate(true);
    setError('');
    try {
      const res = await uploadToR2(file, {
        folder: `certificate-templates/course-${course?.id || 'new'}`,
        bucket: 'templates',
      });
      if (!res.success || !res.url) {
        setError(res.message || 'Gagal upload template.');
        return;
      }
      setCustomTemplateUrl(res.url);
      setCertificateTemplateId(''); // override template_id when custom uploaded
    } finally {
      setUploadingTemplate(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isEdit && course) {
        const res = await updateCourse(course.id, {
          name, description, startDate, endDate, venue, venueAddress,
          quota, feeAmount, registrationDeadline: registrationDeadline || null, status,
          hasDigitalCertificate,
          certificateRequiresApproval,
          certificateTemplateId: certificateTemplateId || null,
          certificateTemplateUrl: customTemplateUrl || null,
        } as any);
        if (!res.success) {
          setError(res.message || 'Gagal kemaskini kursus.');
          return;
        }
      } else {
        const res = await createCourse({
          code: code || undefined,
          name, description, scope,
          negeriId: scope === 'negeri' || scope === 'daerah' ? negeriId : null,
          daerahId: scope === 'daerah' ? daerahId : null,
          startDate, endDate, venue, venueAddress,
          quota, feeAmount,
          registrationDeadline: registrationDeadline || null,
          status,
          hasDigitalCertificate,
          certificateRequiresApproval,
          certificateTemplateId: certificateTemplateId || null,
          certificateTemplateUrl: customTemplateUrl || null,
          createdByRole: adminScope === 'negeri' ? 'negeri_admin' : adminScope === 'daerah' ? 'daerah_admin' : 'developer',
          createdBy: adminUser,
        } as any);
        if (!res.success) {
          setError(res.message || 'Gagal cipta kursus.');
          return;
        }
      }
      await onSaved();
    } catch (err: any) {
      setError(err.message || 'Ralat sistem.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-900 text-white px-5 py-4 flex justify-between items-center">
          <h2 className="text-lg font-bold">{isEdit ? 'Edit Kursus' : 'Cipta Kursus Baru'}</h2>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded-r text-sm flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" /><span>{error}</span>
            </div>
          )}

          {/* Scope Selection (cipta sahaja) */}
          {!isEdit && adminScope === 'developer' && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Peringkat Kursus *</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setScope('negeri')}
                  className={`py-2.5 rounded-lg border-2 text-sm font-bold transition ${scope === 'negeri' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-500'}`}>
                  Peringkat Negeri
                </button>
                <button type="button" onClick={() => setScope('daerah')}
                  className={`py-2.5 rounded-lg border-2 text-sm font-bold transition ${scope === 'daerah' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'}`}>
                  Peringkat Daerah
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Nama Kursus *</label>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Cth: Kursus Asas Kepemimpinan Pengakap"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                Kod Kursus {!isEdit && <span className="text-slate-300 font-normal">(auto jika kosong)</span>}
              </label>
              <input type="text" value={code} onChange={(e) => setCode(e.target.value)} disabled={isEdit}
                placeholder="KSPN-2026-001"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Penerangan</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="Objektif, modul, dan butiran lain..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
          </div>

          {/* Lokasi */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Negeri *</label>
              <select value={negeriId} onChange={(e) => setNegeriId(e.target.value)} required disabled={isEdit || adminScope !== 'developer'}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white disabled:bg-slate-50">
                <option value="">-- Pilih Negeri --</option>
                {negeriList.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
            {scope === 'daerah' && (
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Daerah *</label>
                <select value={daerahId} onChange={(e) => setDaerahId(e.target.value)} required disabled={isEdit || adminScope === 'daerah'}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white disabled:bg-slate-50">
                  <option value="">-- Pilih Daerah --</option>
                  {filteredDaerah.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {/* Tarikh */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tarikh Mula *</label>
              <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tarikh Tamat *</label>
              <input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tarikh Tutup Pendaftaran</label>
              <input type="date" value={registrationDeadline} onChange={(e) => setRegistrationDeadline(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>

          {/* Tempat */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Nama Tempat *</label>
              <input type="text" required value={venue} onChange={(e) => setVenue(e.target.value)}
                placeholder="Cth: Dewan Sekolah Menengah ABC"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Alamat Penuh</label>
              <input type="text" value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)}
                placeholder="Alamat lengkap (opsyenal)"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>

          {/* Kuota & Yuran */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Kuota *</label>
              <input type="number" required min={1} value={quota} onChange={(e) => setQuota(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Yuran (RM)</label>
              <input type="number" min={0} step="0.01" value={feeAmount} onChange={(e) => setFeeAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <p className="text-[10px] text-slate-400 mt-0.5">0 = percuma</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as CourseStatus)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
                <option value="draft">Draf (tidak dipaparkan)</option>
                <option value="open">Terbuka untuk pendaftaran</option>
                <option value="closed">Tertutup</option>
                <option value="completed">Tamat</option>
                <option value="cancelled">Dibatalkan</option>
              </select>
            </div>
          </div>
        </form>

        <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex justify-end gap-2">
          <button onClick={onClose} disabled={submitting}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition">
            Batal
          </button>
          <button onClick={handleSubmit as any} disabled={submitting}
            className="px-5 py-2 text-sm font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition flex items-center gap-2 disabled:opacity-50">
            {submitting ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
            {submitting ? 'Menyimpan...' : (isEdit ? 'Kemaskini' : 'Cipta Kursus')}
          </button>
        </div>
      </div>
    </div>
  );
};