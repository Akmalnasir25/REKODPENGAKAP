import React, { useState } from 'react';
import {
  Calendar, MapPin, Clock, CheckCircle, XCircle, AlertCircle,
  Loader, Download, FileText, DollarSign,
} from 'lucide-react';
import { cancelRegistration } from '../../services/courseService';
import type { CourseRegistration } from '../../types';

interface MyCoursesTabProps {
  registrations: CourseRegistration[];
  onRefresh: () => void;
  leaderId: string;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

const statusLabel: Record<string, { label: string; color: string; icon: any }> = {
  registered: { label: 'Berdaftar', color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
  attended: { label: 'Hadir', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  absent: { label: 'Tidak Hadir', color: 'bg-amber-100 text-amber-700', icon: AlertCircle },
  passed: { label: 'Lulus', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  failed: { label: 'Gagal', color: 'bg-red-100 text-red-700', icon: XCircle },
  cancelled: { label: 'Dibatalkan', color: 'bg-slate-100 text-slate-500', icon: XCircle },
};

const paymentLabel: Record<string, { label: string; color: string }> = {
  unpaid: { label: 'Belum Bayar', color: 'bg-red-100 text-red-700' },
  paid: { label: 'Telah Bayar', color: 'bg-emerald-100 text-emerald-700' },
  waived: { label: 'Percuma', color: 'bg-slate-100 text-slate-600' },
};

export const MyCoursesTab: React.FC<MyCoursesTabProps> = ({ registrations, onRefresh, leaderId }) => {
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const sorted = [...registrations].sort((a, b) =>
    new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime(),
  );

  const handleCancel = async (regId: string) => {
    if (!confirm('Anda pasti mahu batalkan pendaftaran kursus ini?')) return;
    setCancellingId(regId);
    try {
      await cancelRegistration(regId, leaderId, 'Dibatalkan oleh pemimpin');
      onRefresh();
    } finally {
      setCancellingId(null);
    }
  };

  if (sorted.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Calendar size={40} className="mx-auto mb-3 text-slate-200" />
        <p className="text-sm font-semibold">Anda belum mendaftar mana-mana kursus</p>
        <p className="text-xs mt-1">Layari tab "Kursus Terbuka" untuk daftar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map((reg) => {
        const c = reg.course;
        if (!c) return null;
        const statusInfo = statusLabel[reg.status] || statusLabel.registered;
        const StatusIcon = statusInfo.icon;
        const payInfo = paymentLabel[reg.paymentStatus] || paymentLabel.unpaid;
        const canCancel = reg.status === 'registered';

        return (
          <div key={reg.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                    c.scope === 'negeri' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {c.scope === 'negeri' ? 'Negeri' : 'Daerah'}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">{c.code}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${statusInfo.color}`}>
                    <StatusIcon size={10} /> {statusInfo.label}
                  </span>
                  {c.feeAmount > 0 && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${payInfo.color}`}>
                      <DollarSign size={10} /> {payInfo.label}
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-slate-800 leading-tight">{c.name}</h3>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3 text-xs">
              <div className="flex items-center gap-1.5 text-slate-600">
                <Calendar size={12} className="text-slate-400" />
                <span>{formatDate(c.startDate)} - {formatDate(c.endDate)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-600">
                <MapPin size={12} className="text-slate-400" />
                <span className="truncate">{c.venue}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500">
                <Clock size={12} className="text-slate-400" />
                <span>Daftar: {formatDate(reg.registeredAt)}</span>
              </div>
              {reg.resultGrade && (
                <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                  <FileText size={12} className="text-emerald-500" />
                  <span>Keputusan: {reg.resultGrade}</span>
                </div>
              )}
            </div>

            {(reg.adminNotes || reg.cancelReason) && (
              <div className="mt-2 bg-slate-50 rounded-lg p-2 text-xs text-slate-600">
                {reg.adminNotes && <p><span className="font-bold">Nota Admin:</span> {reg.adminNotes}</p>}
                {reg.cancelReason && <p><span className="font-bold">Sebab Batal:</span> {reg.cancelReason}</p>}
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
              {reg.certificateUrl && (
                <a
                  href={reg.certificateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-bold bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition flex items-center gap-1.5"
                >
                  <Download size={12} /> Sijil
                </a>
              )}
              {canCancel && (
                <button
                  onClick={() => handleCancel(reg.id)}
                  disabled={cancellingId === reg.id}
                  className="px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 rounded-lg transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {cancellingId === reg.id ? <Loader size={12} className="animate-spin" /> : <XCircle size={12} />}
                  Batalkan
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
