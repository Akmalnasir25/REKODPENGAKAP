import React, { useState, useEffect } from 'react';
import {
  Plus, Calendar, MapPin, Users, DollarSign, Edit2, Trash2,
  Eye, Search, Filter, Loader,
} from 'lucide-react';
import { LoadingSpinner } from '../../ui/LoadingSpinner';
import { listCourses, deleteCourse } from '../../../services/courseService';
import { supabase } from '../../../services/supabaseClient';
import type { Course, CourseScope, CourseStatus } from '../../../types';
import { CourseFormModal } from './CourseFormModal';
import { CourseParticipantsList } from './CourseParticipantsList';

interface CoursesAdminPanelProps {
  adminScope: 'negeri' | 'daerah' | 'developer';
  adminNegeriCode?: string | null;
  adminDaerahCode?: string | null;
  adminUser: string;
}

interface NegeriRow { id: string; code: string; name: string }
interface DaerahRow { id: string; code: string; name: string; negeri_id: string; negeriCode?: string }

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

const statusColor: Record<CourseStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  open: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-amber-100 text-amber-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
};

export const CoursesAdminPanel: React.FC<CoursesAdminPanelProps> = ({
  adminScope, adminNegeriCode, adminDaerahCode, adminUser,
}) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editCourse, setEditCourse] = useState<Course | null>(null);
  const [viewParticipants, setViewParticipants] = useState<Course | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CourseStatus | ''>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [negeriList, setNegeriList] = useState<NegeriRow[]>([]);
  const [daerahList, setDaerahList] = useState<DaerahRow[]>([]);

  // Lookup UUID dari kod
  const adminNegeriId = adminNegeriCode
    ? negeriList.find((n) => n.code === adminNegeriCode)?.id || null
    : null;
  const adminDaerahId = adminDaerahCode
    ? daerahList.find((d) => d.code === adminDaerahCode)?.id || null
    : null;

  // Tentukan scope yang admin boleh urus
  const allowedScope: CourseScope = adminScope === 'negeri' ? 'negeri' : 'daerah';

  // Load negeri & daerah lookup
  useEffect(() => {
    (async () => {
      const [{ data: negeriData }, { data: daerahData }] = await Promise.all([
        supabase.from('negeri').select('id, code, name').order('name'),
        supabase.from('daerah').select('id, code, name, negeri_id, negeri:negeri_id(code)').order('name'),
      ]);
      if (negeriData) setNegeriList(negeriData as NegeriRow[]);
      if (daerahData) {
        const mapped = (daerahData as any[]).map((d) => ({
          id: d.id, code: d.code, name: d.name,
          negeri_id: d.negeri_id,
          negeriCode: d.negeri?.code,
        }));
        setDaerahList(mapped);
      }
    })();
  }, []);

  const loadCourses = async () => {
    setLoading(true);
    try {
      const data = await listCourses({
        negeriId: adminScope === 'negeri' ? adminNegeriId || undefined : undefined,
        daerahId: adminScope === 'daerah' ? adminDaerahId || undefined : undefined,
      });
      // Filter ikut scope admin
      const filtered = adminScope === 'developer' ? data : data.filter((c) => {
        if (adminScope === 'negeri') {
          return c.scope === 'negeri' && c.negeriId === adminNegeriId;
        }
        if (adminScope === 'daerah') {
          return c.scope === 'daerah' && c.daerahId === adminDaerahId;
        }
        return true;
      });
      setCourses(filtered);
    } catch (err) {
      console.error('Load courses error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCourses(); }, [adminScope, adminNegeriId, adminDaerahId]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Padam kursus "${name}"? Semua pendaftaran berkaitan akan dipadam juga.`)) return;
    setDeletingId(id);
    try {
      await deleteCourse(id);
      await loadCourses();
    } finally {
      setDeletingId(null);
    }
  };

  const filteredCourses = courses.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Calendar className="text-emerald-600" /> Pengurusan Kursus Pemimpin
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Cipta dan urus kursus untuk pemimpin {adminScope === 'negeri' ? 'peringkat negeri' : adminScope === 'daerah' ? 'peringkat daerah' : 'semua peringkat'}.
          </p>
        </div>
        <button
          onClick={() => { setEditCourse(null); setShowForm(true); }}
          className="bg-emerald-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-emerald-700 transition flex items-center gap-2 shadow"
        >
          <Plus size={16} /> Cipta Kursus
        </button>
      </div>

      {/* Statistik Ringkasan */}
      {!loading && courses.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <Calendar size={14} className="text-blue-600" />
              <p className="text-[10px] font-bold text-slate-500 uppercase">Jumlah Kursus</p>
            </div>
            <p className="text-2xl font-bold text-slate-800">{courses.length}</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <Users size={14} className="text-emerald-600" />
              <p className="text-[10px] font-bold text-slate-500 uppercase">Jumlah Pendaftar</p>
            </div>
            <p className="text-2xl font-bold text-slate-800">
              {courses.reduce((sum, c) => sum + (c.registeredCount || 0), 0)}
            </p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <Calendar size={14} className="text-amber-600" />
              <p className="text-[10px] font-bold text-slate-500 uppercase">Kursus Terbuka</p>
            </div>
            <p className="text-2xl font-bold text-slate-800">
              {courses.filter((c) => c.status === 'open').length}
            </p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <Users size={14} className="text-purple-600" />
              <p className="text-[10px] font-bold text-slate-500 uppercase">Jumlah Kuota</p>
            </div>
            <p className="text-2xl font-bold text-slate-800">
              {courses.reduce((sum, c) => sum + c.quota, 0)}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap gap-2 items-center">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama atau kod kursus..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter size={14} className="text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CourseStatus | '')}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            <option value="">Semua Status</option>
            <option value="draft">Draf</option>
            <option value="open">Terbuka</option>
            <option value="closed">Tertutup</option>
            <option value="completed">Tamat</option>
            <option value="cancelled">Dibatalkan</option>
          </select>
        </div>
      </div>

      {/* Courses List */}
      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner size="md" /></div>
      ) : filteredCourses.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <Calendar size={40} className="mx-auto mb-3 text-slate-200" />
          <p className="text-sm font-semibold">Tiada kursus</p>
          <p className="text-xs mt-1">Klik "Cipta Kursus" untuk mula.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredCourses.map((c) => (
            <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-3 hover:shadow-sm transition">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      c.scope === 'negeri' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {c.scope === 'negeri' ? 'Negeri' : 'Daerah'}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">{c.code}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${statusColor[c.status]}`}>
                      {c.status}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-800 leading-tight">{c.name}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs">
                    <div className="flex items-center gap-1 text-slate-600">
                      <Calendar size={11} className="text-slate-400" />
                      <span>{formatDate(c.startDate)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-600">
                      <MapPin size={11} className="text-slate-400" />
                      <span className="truncate">{c.venue}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-600">
                      <Users size={11} className="text-slate-400" />
                      <span>{c.registeredCount || 0}/{c.quota}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-600">
                      <DollarSign size={11} className="text-slate-400" />
                      <span>{c.feeAmount > 0 ? `RM ${c.feeAmount.toFixed(2)}` : 'Percuma'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => setViewParticipants(c)}
                    title="Lihat Pendaftar"
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    onClick={() => { setEditCourse(c); setShowForm(true); }}
                    title="Edit"
                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(c.id, c.name)}
                    disabled={deletingId === c.id}
                    title="Padam"
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition disabled:opacity-50"
                  >
                    {deletingId === c.id ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <CourseFormModal
          course={editCourse}
          adminScope={adminScope}
          adminNegeriId={adminNegeriId}
          adminDaerahId={adminDaerahId}
          adminUser={adminUser}
          allowedScope={allowedScope}
          negeriList={negeriList}
          daerahList={daerahList}
          onClose={() => setShowForm(false)}
          onSaved={async () => { setShowForm(false); await loadCourses(); }}
        />
      )}

      {/* Participants Modal */}
      {viewParticipants && (
        <CourseParticipantsList
          course={viewParticipants}
          adminUser={adminUser}
          onClose={() => setViewParticipants(null)}
          onChanged={loadCourses}
        />
      )}
    </div>
  );
};