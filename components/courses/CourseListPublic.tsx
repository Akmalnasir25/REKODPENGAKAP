import React from 'react';
import { Calendar, MapPin, Users, DollarSign, Tag, ChevronRight, CheckCircle, Clock } from 'lucide-react';
import type { Course, CourseRegistration } from '../../types';
import { tarikhPendek } from '../../utils/tarikh';

interface CourseListPublicProps {
  courses: Course[];
  registrations: CourseRegistration[];
  onSelect: (course: Course) => void;
}

function formatDate(dateStr: string): string {
  try {
    return tarikhPendek(dateStr, false);
  } catch {
    return dateStr;
  }
}

function formatCurrency(amount: number): string {
  if (amount === 0) return 'Percuma';
  return `RM ${amount.toFixed(2)}`;
}

export const CourseListPublic: React.FC<CourseListPublicProps> = ({ courses, registrations, onSelect }) => {
  if (courses.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Calendar size={40} className="mx-auto mb-3 text-slate-200" />
        <p className="text-sm font-semibold">Tiada kursus terbuka pada masa ini</p>
        <p className="text-xs mt-1">Sila semak semula kemudian.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {courses.map((c) => {
        const reg = registrations.find((r) => r.courseId === c.id && r.status !== 'cancelled');
        const isFull = (c.registeredCount || 0) >= c.quota;
        const fillPercent = Math.min(100, ((c.registeredCount || 0) / c.quota) * 100);

        return (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-emerald-400 hover:shadow-md transition-all group"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                    c.scope === 'negeri' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {c.scope === 'negeri' ? 'Negeri' : 'Daerah'}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">{c.code}</span>
                </div>
                <h3 className="font-bold text-slate-800 group-hover:text-emerald-700 line-clamp-2 leading-snug">
                  {c.name}
                </h3>
              </div>
              <ChevronRight size={18} className="text-slate-300 group-hover:text-emerald-600 shrink-0" />
            </div>

            <div className="space-y-1.5 mt-3">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Calendar size={12} className="text-slate-400" />
                <span>{formatDate(c.startDate)} - {formatDate(c.endDate)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <MapPin size={12} className="text-slate-400" />
                <span className="truncate">{c.venue}</span>
              </div>
              {(c.negeriName || c.daerahName) && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Tag size={12} className="text-slate-400" />
                  <span>{c.scope === 'negeri' ? c.negeriName : `${c.daerahName}, ${c.negeriName}`}</span>
                </div>
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="text-xs">
                  <span className="font-bold text-slate-700">{c.registeredCount || 0}</span>
                  <span className="text-slate-400">/{c.quota}</span>
                </div>
                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${isFull ? 'bg-red-400' : fillPercent > 75 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                    style={{ width: `${fillPercent}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {c.feeAmount > 0 ? (
                  <span className="text-xs font-bold text-amber-700 flex items-center gap-1">
                    <DollarSign size={11} />{formatCurrency(c.feeAmount)}
                  </span>
                ) : (
                  <span className="text-xs font-bold text-emerald-700">PERCUMA</span>
                )}
              </div>
            </div>

            {reg && (
              <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                <CheckCircle size={10} />
                <span>Anda telah berdaftar - status: {reg.status}</span>
              </div>
            )}
            {isFull && !reg && (
              <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-red-700 bg-red-50 px-2 py-1 rounded">
                <Clock size={10} /> Kuota Penuh
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};
