import React from 'react';
import { Award, Download, Calendar, MapPin } from 'lucide-react';
import type { CourseRegistration } from '../../types';

interface MyCertificatesTabProps {
  registrations: CourseRegistration[];
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export const MyCertificatesTab: React.FC<MyCertificatesTabProps> = ({ registrations }) => {
  // Hanya papar sijil yang sudah released ATAU yang tiada approval flow tapi sudah ada URL
  const certs = registrations.filter((r) => {
    if (r.status !== 'passed') return false;
    if (!r.certificateUrl) return false;
    // Jika kursus perlukan approval, hanya papar bila sudah released
    if (r.certificateStatus === 'pending' || r.certificateStatus === 'rejected') return false;
    return true;
  });

  if (certs.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Award size={40} className="mx-auto mb-3 text-slate-200" />
        <p className="text-sm font-semibold">Belum ada sijil</p>
        <p className="text-xs mt-1">Sijil akan tersedia selepas anda lulus kursus.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {certs.map((reg) => {
        const c = reg.course;
        if (!c) return null;
        return (
          <div
            key={reg.id}
            className="bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-300 rounded-xl p-4 hover:shadow-md transition relative overflow-hidden"
          >
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-amber-200 rounded-full opacity-30" />
            <div className="relative">
              <div className="flex items-start gap-3">
                <div className="bg-amber-500 text-white p-2 rounded-lg shadow">
                  <Award size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-mono text-amber-800 uppercase tracking-wider">{c.code}</p>
                  <h3 className="font-bold text-slate-800 leading-tight line-clamp-2">{c.name}</h3>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-xs text-slate-700">
                <div className="flex items-center gap-1.5">
                  <Calendar size={11} className="text-amber-600" />
                  <span>{formatDate(c.startDate)} - {formatDate(c.endDate)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin size={11} className="text-amber-600" />
                  <span className="truncate">{c.venue}</span>
                </div>
                {reg.resultGrade && (
                  <div className="mt-2">
                    <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-1 rounded">
                      Keputusan: {reg.resultGrade}
                    </span>
                  </div>
                )}
              </div>

              <a
                href={reg.certificateUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 w-full px-3 py-2 text-xs font-bold bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition flex items-center justify-center gap-1.5"
              >
                <Download size={12} /> Muat Turun Sijil
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
};
