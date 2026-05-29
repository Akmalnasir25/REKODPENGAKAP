import React, { useState, useEffect } from 'react';
import {
  LogOut, Calendar, Award, BookOpen, User, Search, School,
} from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { clearLeaderSession } from '../../services/leaderAuthService';
import { listCourses, listRegistrationsByLeader } from '../../services/courseService';
import type { Course, CourseRegistration, LeaderSession } from '../../types';
import { CourseListPublic } from './CourseListPublic';
import { CourseDetailModal } from './CourseDetailModal';
import { MyCoursesTab } from './MyCoursesTab';
import { MyCertificatesTab } from './MyCertificatesTab';
import { LeaderProfileTab } from './LeaderProfileTab';

interface LeaderDashboardProps {
  session: LeaderSession;
  onLogout: () => void;
  onSwitchToSchoolModule?: () => void;
}

type Tab = 'browse' | 'my_courses' | 'certificates' | 'profile';

export const LeaderDashboard: React.FC<LeaderDashboardProps> = ({ session, onLogout, onSwitchToSchoolModule }) => {
  const [activeTab, setActiveTab] = useState<Tab>('browse');
  const [courses, setCourses] = useState<Course[]>([]);
  const [registrations, setRegistrations] = useState<CourseRegistration[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [coursesData, regsData] = await Promise.all([
        listCourses({
          status: 'open',
          leaderNegeriId: session.negeriId || undefined,
          leaderDaerahId: session.daerahId || undefined,
        }),
        listRegistrationsByLeader(session.leaderId),
      ]);
      setCourses(coursesData);
      setRegistrations(regsData);
    } catch (err) {
      console.error('Load data error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [session.leaderId]);

  const handleLogout = () => {
    clearLeaderSession();
    onLogout();
  };

  const handleRegistrationSuccess = () => {
    setSelectedCourse(null);
    loadData();
  };

  const filteredCourses = courses.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.venue.toLowerCase().includes(q)
    );
  });

  const myActiveCount = registrations.filter((r) => r.status === 'registered' || r.status === 'attended').length;
  const myCertCount = registrations.filter((r) => r.status === 'passed' && r.certificateUrl).length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-slate-900 text-white shadow-lg border-b-4 border-amber-500">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-white/15 p-2 rounded-lg">
              <Award size={24} className="text-amber-300" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Portal Pemimpin</h1>
              <p className="text-amber-100 text-xs">{session.fullName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {session.schoolId && session.schoolName && onSwitchToSchoolModule && (
              <>
                {session.schoolLinkStatus === 'approved' && (
                  <button
                    onClick={onSwitchToSchoolModule}
                    className="bg-amber-500 hover:bg-amber-600 p-2 px-3 rounded-lg text-white text-xs flex items-center gap-2 transition shadow font-bold"
                    title={`Akses modul pengurusan sekolah ${session.schoolName}`}
                  >
                    <School size={14} /> <span className="hidden sm:inline">Modul Sekolah</span>
                  </button>
                )}
                {session.schoolLinkStatus === 'pending' && (
                  <span
                    className="bg-amber-500/20 border border-amber-400/40 p-2 px-3 rounded-lg text-amber-200 text-xs flex items-center gap-2"
                    title={`Menunggu approval admin sekolah ${session.schoolName}`}
                  >
                    <School size={14} /> <span className="hidden sm:inline">Modul Sekolah (Pending)</span>
                  </span>
                )}
                {session.schoolLinkStatus === 'rejected' && (
                  <span
                    className="bg-red-500/20 border border-red-400/40 p-2 px-3 rounded-lg text-red-200 text-xs flex items-center gap-2"
                    title="Permintaan link sekolah ditolak"
                  >
                    <School size={14} /> <span className="hidden sm:inline">Akses Ditolak</span>
                  </span>
                )}
              </>
            )}
            <button
              onClick={handleLogout}
              className="bg-white/10 hover:bg-white/20 p-2 px-3 rounded-lg text-white text-xs flex items-center gap-2 transition border border-white/20"
            >
              <LogOut size={14} /> <span className="hidden sm:inline">Log Keluar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="max-w-6xl mx-auto px-4 py-4 grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen size={14} className="text-blue-600" />
            <p className="text-[10px] font-bold text-slate-500 uppercase">Kursus Terbuka</p>
          </div>
          <p className="text-2xl font-bold text-slate-800">{courses.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-1">
            <Calendar size={14} className="text-blue-600" />
            <p className="text-[10px] font-bold text-slate-500 uppercase">Kursus Saya</p>
          </div>
          <p className="text-2xl font-bold text-slate-800">{myActiveCount}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-1">
            <Award size={14} className="text-amber-600" />
            <p className="text-[10px] font-bold text-slate-500 uppercase">Sijil</p>
          </div>
          <p className="text-2xl font-bold text-slate-800">{myCertCount}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-4">
        <div className="bg-white rounded-t-xl border border-slate-200 border-b-0 flex overflow-x-auto">
          {[
            { id: 'browse' as Tab, label: 'Kursus Terbuka', icon: BookOpen },
            { id: 'my_courses' as Tab, label: 'Kursus Saya', icon: Calendar },
            { id: 'certificates' as Tab, label: 'Sijil Saya', icon: Award },
            { id: 'profile' as Tab, label: 'Profil', icon: User },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 min-w-[110px] py-3 px-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
                activeTab === t.id
                  ? 'text-blue-900 border-amber-500 bg-amber-50'
                  : 'text-slate-500 hover:text-slate-700 border-transparent'
              }`}
            >
              <t.icon size={14} />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
      {/* Tab Content */}
      <div className="max-w-6xl mx-auto px-4 pb-8">
        <div className="bg-white rounded-b-xl border border-slate-200 p-4 md:p-6 min-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="md" color="border-blue-900" />
            </div>
          ) : (
            <>
              {activeTab === 'browse' && (
                <>
                  <div className="mb-4 relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari kursus mengikut nama, kod atau tempat..."
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                    />
                  </div>
                  <CourseListPublic
                    courses={filteredCourses}
                    registrations={registrations}
                    onSelect={(c) => setSelectedCourse(c)}
                  />
                </>
              )}
              {activeTab === 'my_courses' && (
                <MyCoursesTab
                  registrations={registrations}
                  onRefresh={loadData}
                  leaderId={session.leaderId}
                />
              )}
              {activeTab === 'certificates' && (
                <MyCertificatesTab registrations={registrations} />
              )}
              {activeTab === 'profile' && (
                <LeaderProfileTab session={session} />
              )}
            </>
          )}
        </div>
      </div>

      {/* Course Detail Modal */}
      {selectedCourse && (
        <CourseDetailModal
          course={selectedCourse}
          leader={session}
          existingRegistration={registrations.find((r) => r.courseId === selectedCourse.id) || null}
          onClose={() => setSelectedCourse(null)}
          onRegistered={handleRegistrationSuccess}
        />
      )}
    </div>
  );
};

interface ProfileItemProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}

const ProfileItem: React.FC<ProfileItemProps> = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
    <div className="bg-amber-100 p-2 rounded-lg">
      <Icon size={16} className="text-blue-900" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold text-slate-800 truncate">{value}</p>
    </div>
  </div>
);