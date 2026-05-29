import React, { useState, useEffect } from 'react';
import {
  X, Users, CheckCircle, XCircle, AlertCircle, Loader,
  Award, Download, FileText, DollarSign, Phone, Mail,
  Calendar, MapPin, TrendingUp, PieChart, UserCheck, UserX,
  CreditCard, Search, ChevronLeft, Printer,
} from 'lucide-react';
import { LoadingSpinner } from '../../ui/LoadingSpinner';
import {
  listRegistrationsByCourse, cancelRegistration, verifyPayment,
  setResult, markAttendance, setCertificateStatus,
} from '../../../services/courseService';
import { generateAndUploadCertificate } from '../../../services/certificateService';
import type { Course, CourseRegistration } from '../../../types';

interface CourseStatsDashboardProps {
  course: Course;
  adminUser: string;
  onClose: () => void;
  onChanged: () => void;
}

type Tab = 'overview' | 'participants' | 'attendance' | 'results' | 'payments';

export const CourseStatsDashboard: React.FC<CourseStatsDashboardProps> = ({
  course, adminUser, onClose, onChanged,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [registrations, setRegistrations] = useState<CourseRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadRegistrations = async () => {
    setLoading(true);
    const data = await listRegistrationsByCourse(course.id);
    setRegistrations(data);
    setLoading(false);
  };

  useEffect(() => { loadRegistrations(); }, [course.id]);

  const activeRegs = registrations.filter((r) => r.status !== 'cancelled');
  const cancelledRegs = registrations.filter((r) => r.status === 'cancelled');

  const stats = {
    total: registrations.length,
    active: activeRegs.length,
    cancelled: cancelledRegs.length,
    registered: activeRegs.filter((r) => r.status === 'registered').length,
    attended: activeRegs.filter((r) => ['attended', 'passed', 'failed'].includes(r.status)).length,
    passed: activeRegs.filter((r) => r.status === 'passed').length,
    failed: activeRegs.filter((r) => r.status === 'failed').length,
    absent: activeRegs.filter((r) => r.status === 'absent').length,
    paid: activeRegs.filter((r) => r.paymentStatus === 'paid').length,
    unpaid: activeRegs.filter((r) => r.paymentStatus === 'unpaid').length,
    waived: activeRegs.filter((r) => r.paymentStatus === 'waived').length,
    certsGenerated: activeRegs.filter((r) => !!r.certificateUrl).length,
    guru: activeRegs.filter((r) => r.leader?.leaderType === 'guru').length,
    luar: activeRegs.filter((r) => r.leader?.leaderType === 'luar').length,
    revenue: activeRegs.filter((r) => r.paymentStatus === 'paid').length * course.feeAmount,
    quotaUsage: Math.round((activeRegs.length / course.quota) * 100),
  };

  const filteredRegs = activeRegs.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const leader = r.leader;
    return (
      leader?.fullName?.toLowerCase().includes(q) ||
      leader?.icNumber?.toLowerCase().includes(q) ||
      leader?.email?.toLowerCase().includes(q) ||
      leader?.schoolName?.toLowerCase().includes(q) ||
      leader?.daerahName?.toLowerCase().includes(q)
    );
  });

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

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return d; }
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'overview', label: 'Statistik', icon: PieChart },
    { id: 'participants', label: 'Senarai Nama', icon: Users, count: activeRegs.length },
    { id: 'attendance', label: 'Kehadiran', icon: UserCheck, count: stats.attended },
    { id: 'results', label: 'Keputusan', icon: Award, count: stats.passed + stats.failed },
    { id: 'payments', label: 'Bayaran', icon: CreditCard, count: stats.paid },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2 md:p-4 backdrop-blur-sm">
      <div className="bg-slate-50 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 to-emerald-950 text-white px-4 md:px-6 py-4 flex justify-between items-start gap-3 flex-shrink-0">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <button onClick={onClose} className="mt-1 p-1.5 hover:bg-white/10 rounded-lg transition flex-shrink-0">
              <ChevronLeft size={20} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[10px] font-mono bg-white/20 px-2 py-0.5 rounded">{course.code}</span>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                  course.status === 'open' ? 'bg-emerald-500' :
                  course.status === 'closed' ? 'bg-amber-500' :
                  course.status === 'completed' ? 'bg-blue-500' :
                  course.status === 'cancelled' ? 'bg-red-500' : 'bg-slate-500'
                }`}>{course.status}</span>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                  course.scope === 'negeri' ? 'bg-purple-500' : 'bg-blue-500'
                }`}>{course.scope}</span>
              </div>
              <h2 className="text-base md:text-lg font-bold leading-tight truncate">{course.name}</h2>
              <div className="flex flex-wrap gap-3 text-xs text-emerald-200 mt-1.5">
                <span className="flex items-center gap-1"><Calendar size={11} /> {formatDate(course.startDate)} - {formatDate(course.endDate)}</span>
                <span className="flex items-center gap-1"><MapPin size={11} /> {course.venue}</span>
                <span className="flex items-center gap-1"><Users size={11} /> {stats.active}/{course.quota} ({stats.quotaUsage}%)</span>
                {course.feeAmount > 0 && <span className="flex items-center gap-1"><DollarSign size={11} /> RM {course.feeAmount.toFixed(2)}</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-white overflow-x-auto flex-shrink-0">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-1 min-w-[100px] py-3 px-3 text-xs md:text-sm font-semibold flex items-center justify-center gap-1.5 border-b-2 transition whitespace-nowrap ${
                activeTab === t.id ? 'border-emerald-500 text-emerald-700 bg-emerald-50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}>
              <t.icon size={14} />
              {t.label}
              {t.count !== undefined && <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full font-mono">{t.count}</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {loading ? (
            <div className="flex justify-center py-16"><LoadingSpinner size="md" /></div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <OverviewTab stats={stats} course={course} />
              )}

              {(activeTab === 'participants' || activeTab === 'attendance' || activeTab === 'results' || activeTab === 'payments') && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Cari nama, IC, email, sekolah..."
                        className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <span className="text-xs text-slate-500 font-mono flex-shrink-0">{filteredRegs.length} rekod</span>
                  </div>

                  {filteredRegs.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-slate-200">
                      <Users size={40} className="mx-auto mb-3 text-slate-200" />
                      <p className="text-sm font-semibold">{searchQuery ? 'Tiada padanan carian' : 'Tiada pendaftaran'}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredRegs.map((r) => (
                        <ParticipantRow
                          key={r.id}
                          reg={r}
                          course={course}
                          activeTab={activeTab}
                          isProcessing={actionId === r.id}
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
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// OVERVIEW TAB - Statistik Lengkap
// ============================================================

function OverviewTab({ stats, course }: { stats: any; course: Course }) {
  return (
    <div className="space-y-5">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <StatCard icon={Users} color="blue" label="Jumlah Pendaftar" value={stats.active} sub={`daripada ${course.quota} kuota`} />
        <StatCard icon={UserCheck} color="emerald" label="Hadir" value={stats.attended} sub={`${stats.active > 0 ? Math.round((stats.attended / stats.active) * 100) : 0}% kadar kehadiran`} />
        <StatCard icon={Award} color="green" label="Lulus" value={stats.passed} sub={`${stats.attended > 0 ? Math.round((stats.passed / stats.attended) * 100) : 0}% kadar kelulusan`} />
        <StatCard icon={UserX} color="red" label="Gagal / Tidak Hadir" value={stats.failed + stats.absent} />
        <StatCard icon={XCircle} color="orange" label="Dibatalkan" value={stats.cancelled} />
      </div>

      {/* Breakdown Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status Breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-bold text-sm text-slate-700 mb-3 flex items-center gap-2">
            <TrendingUp size={14} className="text-emerald-600" /> Pecahan Status Pendaftaran
          </h3>
          <div className="space-y-2">
            <ProgressBar label="Berdaftar" count={stats.registered} total={stats.active} color="bg-slate-400" />
            <ProgressBar label="Hadir" count={stats.attended} total={stats.active} color="bg-blue-500" />
            <ProgressBar label="Lulus" count={stats.passed} total={stats.active} color="bg-emerald-500" />
            <ProgressBar label="Gagal" count={stats.failed} total={stats.active} color="bg-red-500" />
            <ProgressBar label="Tidak Hadir" count={stats.absent} total={stats.active} color="bg-amber-500" />
            <ProgressBar label="Dibatalkan" count={stats.cancelled} total={stats.total} color="bg-orange-400" />
          </div>
        </div>

        {/* Payment Breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-bold text-sm text-slate-700 mb-3 flex items-center gap-2">
            <CreditCard size={14} className="text-blue-600" /> Status Bayaran
          </h3>
          {course.feeAmount > 0 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Sudah Bayar" value={stats.paid} color="text-emerald-600" />
                <MiniStat label="Belum Bayar" value={stats.unpaid} color="text-red-600" />
                <MiniStat label="Bebas Yuran" value={stats.waived} color="text-slate-500" />
              </div>
              <div className="pt-3 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Jumlah Kutipan</span>
                  <span className="text-lg font-bold text-emerald-700">RM {stats.revenue.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-slate-500">Potensi Penuh</span>
                  <span className="text-xs font-semibold text-slate-400">RM {(stats.active * course.feeAmount).toFixed(2)}</span>
                </div>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 mt-2">
                <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${stats.active > 0 ? (stats.paid / stats.active) * 100 : 0}%` }} />
              </div>
              <p className="text-[10px] text-slate-400 mt-1 text-right">
                {stats.active > 0 ? Math.round((stats.paid / stats.active) * 100) : 0}% dikutip
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">Kursus percuma - tiada bayaran diperlukan.</p>
          )}
        </div>

        {/* Demographics */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-bold text-sm text-slate-700 mb-3 flex items-center gap-2">
            <PieChart size={14} className="text-purple-600" /> Demografi Peserta
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Pemimpin Guru" value={stats.guru} color="text-blue-600" />
            <MiniStat label="Pemimpin Luar" value={stats.luar} color="text-amber-600" />
          </div>
          <div className="flex gap-1 mt-3 h-3 rounded-full overflow-hidden">
            {stats.guru > 0 && <div className="bg-blue-500 h-full" style={{ width: `${(stats.guru / stats.active) * 100}%` }} />}
            {stats.luar > 0 && <div className="bg-amber-500 h-full" style={{ width: `${(stats.luar / stats.active) * 100}%` }} />}
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Guru ({stats.guru > 0 ? Math.round((stats.guru / stats.active) * 100) : 0}%)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Luar ({stats.luar > 0 ? Math.round((stats.luar / stats.active) * 100) : 0}%)</span>
          </div>
        </div>

        {/* Sijil */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-bold text-sm text-slate-700 mb-3 flex items-center gap-2">
            <Award size={14} className="text-amber-600" /> Sijil Digital
          </h3>
          {course.hasDigitalCertificate ? (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">Sijil Dijana</span>
                <span className="text-lg font-bold text-amber-600">{stats.certsGenerated}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">Menunggu</span>
                <span className="text-xs font-semibold text-slate-600">{stats.passed - stats.certsGenerated}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 mt-1">
                <div className="bg-amber-500 h-2 rounded-full transition-all" style={{ width: `${stats.passed > 0 ? (stats.certsGenerated / stats.passed) * 100 : 0}%` }} />
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">Sijil digital tidak diaktifkan untuk kursus ini.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// HELPER COMPONENTS
// ============================================================

function StatCard({ icon: Icon, color, label, value, sub }: { icon: React.ElementType; color: string; label: string; value: number; sub?: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', emerald: 'bg-emerald-50 text-emerald-600',
    green: 'bg-green-50 text-green-600', red: 'bg-red-50 text-red-600', orange: 'bg-orange-50 text-orange-600',
  };
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
      <div className="flex items-center gap-2 mb-1">
        <div className={`p-1.5 rounded-lg ${colorMap[color] || colorMap.blue}`}><Icon size={14} /></div>
        <p className="text-[10px] font-bold text-slate-500 uppercase leading-tight">{label}</p>
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function ProgressBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-slate-600">{label}</span>
        <span className="font-mono font-semibold text-slate-700">{count} <span className="text-slate-400 font-normal">({pct}%)</span></span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center p-2 bg-slate-50 rounded-lg">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-500 font-semibold">{label}</p>
    </div>
  );
}

// ============================================================
// PARTICIPANT ROW
// ============================================================

interface ParticipantRowProps {
  reg: CourseRegistration;
  course: Course;
  activeTab: Tab;
  isProcessing: boolean;
  onVerifyPayment: (s: 'paid' | 'unpaid' | 'waived') => void;
  onMarkAttendance: () => void;
  onSetResult: (s: 'passed' | 'failed' | 'absent', grade: string) => void;
  onGenerateCert: () => void;
  onApproveCert: () => void;
  onRejectCert: () => void;
  onCancelByAdmin: () => void;
}

const ParticipantRow: React.FC<ParticipantRowProps> = ({
  reg, course, activeTab, isProcessing,
  onVerifyPayment, onMarkAttendance, onSetResult, onGenerateCert, onApproveCert, onRejectCert, onCancelByAdmin,
}) => {
  const [grade, setGrade] = useState(reg.resultGrade || '');
  const leader = reg.leader;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 hover:shadow-sm transition">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-bold text-slate-800 text-sm">{leader?.fullName || 'Tanpa Nama'}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
              leader?.leaderType === 'guru' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
            }`}>{leader?.leaderType === 'guru' ? 'Guru' : 'Luar'}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
              reg.status === 'passed' ? 'bg-emerald-100 text-emerald-700' :
              reg.status === 'failed' ? 'bg-red-100 text-red-700' :
              reg.status === 'attended' ? 'bg-blue-100 text-blue-700' :
              reg.status === 'absent' ? 'bg-amber-100 text-amber-700' :
              reg.status === 'cancelled' ? 'bg-orange-100 text-orange-700' :
              'bg-slate-100 text-slate-600'
            }`}>{reg.status}</span>
            {reg.resultGrade && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-700">Gred: {reg.resultGrade}</span>}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
            <span className="flex items-center gap-1"><FileText size={10} /> {leader?.icNumber || '-'}</span>
            {leader?.email && <span className="flex items-center gap-1"><Mail size={10} /> {leader.email}</span>}
            {leader?.phoneNumber && <span className="flex items-center gap-1"><Phone size={10} /> {leader.phoneNumber}</span>}
          </div>
          {(leader?.schoolName || leader?.daerahName) && (
            <p className="text-xs text-slate-500 mt-0.5">
              {[leader?.schoolName, leader?.daerahName, leader?.negeriName].filter(Boolean).join(' | ')}
            </p>
          )}
        </div>
        {activeTab !== 'overview' && (
          <button onClick={onCancelByAdmin} disabled={isProcessing}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition disabled:opacity-50 flex-shrink-0" title="Batalkan">
            <XCircle size={14} />
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
        {activeTab === 'payments' && course.feeAmount > 0 && (
          <>
            <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${
              reg.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-700' :
              reg.paymentStatus === 'waived' ? 'bg-slate-100 text-slate-600' : 'bg-red-100 text-red-700'
            }`}><DollarSign size={10} className="inline -mt-0.5 mr-0.5" />{reg.paymentStatus}</span>
            {reg.paymentProofUrl && (
              <a href={reg.paymentProofUrl} target="_blank" rel="noopener noreferrer"
                className="text-[10px] font-bold px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200">Lihat Bukti</a>
            )}
            {reg.paymentStatus !== 'paid' && (
              <button onClick={() => onVerifyPayment('paid')} disabled={isProcessing}
                className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">Sahkan Bayar</button>
            )}
            {reg.paymentStatus !== 'waived' && (
              <button onClick={() => onVerifyPayment('waived')} disabled={isProcessing}
                className="text-[10px] font-bold px-2 py-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50">Bebas Yuran</button>
            )}
          </>
        )}

        {activeTab === 'attendance' && reg.status === 'registered' && (
          <button onClick={onMarkAttendance} disabled={isProcessing}
            className="text-[10px] font-bold px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
            <CheckCircle size={10} /> Tanda Hadir
          </button>
        )}

        {activeTab === 'results' && reg.status === 'attended' && (
          <>
            <input type="text" value={grade} onChange={(e) => setGrade(e.target.value)}
              placeholder="Gred" className="text-[10px] px-2 py-1 border border-slate-200 rounded w-16" />
            <button onClick={() => onSetResult('passed', grade)} disabled={isProcessing}
              className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">Lulus</button>
            <button onClick={() => onSetResult('failed', grade)} disabled={isProcessing}
              className="text-[10px] font-bold px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">Gagal</button>
          </>
        )}

        {reg.status === 'passed' && course.hasDigitalCertificate && !reg.certificateUrl && (
          <button onClick={onGenerateCert} disabled={isProcessing}
            className="text-[10px] font-bold px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1">
            {isProcessing ? <Loader size={10} className="animate-spin" /> : <Award size={10} />} Generate Sijil
          </button>
        )}
        {reg.certificateUrl && (reg as any).certificateStatus === 'pending' && (
          <>
            <button onClick={onApproveCert} disabled={isProcessing}
              className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">Approve</button>
            <button onClick={onRejectCert} disabled={isProcessing}
              className="text-[10px] font-bold px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">Reject</button>
          </>
        )}
        {reg.certificateUrl && (reg as any).certificateStatus !== 'pending' && (reg as any).certificateStatus !== 'rejected' && (
          <a href={reg.certificateUrl} target="_blank" rel="noopener noreferrer"
            className="text-[10px] font-bold px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600 flex items-center gap-1">
            <Download size={10} /> Sijil
          </a>
        )}
      </div>
    </div>
  );
};
