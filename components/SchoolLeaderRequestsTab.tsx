import React, { useState, useEffect } from 'react';
import {
  Users, CheckCircle, XCircle, Clock, AlertCircle, Loader,
  Mail, Phone, IdCard, Calendar, Briefcase, RefreshCw,
} from 'lucide-react';
import { LoadingSpinner } from './ui/LoadingSpinner';
import {
  listLeaderRequestsForSchool,
  approveLeaderRequest,
  rejectLeaderRequest,
  revokeLeaderAccess,
  type LeaderRequest,
} from '../services/leaderApprovalService';

interface SchoolLeaderRequestsTabProps {
  schoolId: string;
  schoolName: string;
  approverName: string;
}

type Filter = 'pending' | 'approved' | 'rejected' | 'all';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('ms-MY', {
      timeZone: 'Asia/Kuala_Lumpur',
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return dateStr;
  }
}

export const SchoolLeaderRequestsTab: React.FC<SchoolLeaderRequestsTabProps> = ({
  schoolId, schoolName, approverName,
}) => {
  const [requests, setRequests] = useState<LeaderRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data = await listLeaderRequestsForSchool(schoolId, filter === 'all' ? undefined : filter);
      setRequests(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRequests(); }, [schoolId, filter]);

  const handleApprove = async (req: LeaderRequest) => {
    if (!confirm(`Sahkan ${req.fullName} (${req.icNumber}) sebagai pemimpin sekolah ini?`)) return;
    setActionId(req.id);
    const res = await approveLeaderRequest(req.id, approverName);
    if (!res.success) alert(res.message || 'Gagal approve.');
    await loadRequests();
    setActionId(null);
  };

  const handleReject = async (req: LeaderRequest) => {
    const reason = prompt(`Sebab penolakan untuk ${req.fullName}:`);
    if (!reason?.trim()) return;
    setActionId(req.id);
    const res = await rejectLeaderRequest(req.id, approverName, reason);
    if (!res.success) alert(res.message || 'Gagal reject.');
    await loadRequests();
    setActionId(null);
  };

  const handleRevoke = async (req: LeaderRequest) => {
    const reason = prompt(`Sebab tarik balik akses ${req.fullName}:`);
    if (!reason?.trim()) return;
    setActionId(req.id);
    const res = await revokeLeaderAccess(req.id, approverName, reason);
    if (!res.success) alert(res.message || 'Gagal revoke.');
    await loadRequests();
    setActionId(null);
  };

  const counts = {
    pending: requests.filter((r) => r.schoolLinkStatus === 'pending').length,
    approved: requests.filter((r) => r.schoolLinkStatus === 'approved').length,
    rejected: requests.filter((r) => r.schoolLinkStatus === 'rejected').length,
  };

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="text-blue-900" /> Permintaan Akses Pemimpin
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Sahkan pemimpin yang ingin akses modul {schoolName}.
          </p>
        </div>
        <button
          onClick={loadRequests}
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-2 rounded-lg flex items-center gap-2 text-sm"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* PDPA Notice */}
      <div className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded-r mb-4 text-xs text-amber-800">
        <p className="font-bold mb-1">PDPA & Keselamatan Data</p>
        <p>Approve hanya pemimpin yang anda kenal & sahkan dari sekolah ini. Selepas approve, mereka boleh akses data sekolah termasuk No IC peserta.</p>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-slate-200 mb-3 overflow-x-auto">
        {[
          { id: 'pending' as Filter, label: 'Menunggu', count: counts.pending, icon: Clock, color: 'amber' },
          { id: 'approved' as Filter, label: 'Diterima', count: counts.approved, icon: CheckCircle, color: 'emerald' },
          { id: 'rejected' as Filter, label: 'Ditolak', count: counts.rejected, icon: XCircle, color: 'red' },
          { id: 'all' as Filter, label: 'Semua', count: requests.length, icon: Users, color: 'slate' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`flex-1 min-w-[110px] py-2.5 px-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition border-b-2 ${
              filter === t.id
                ? 'text-blue-900 border-amber-500 bg-amber-50'
                : 'text-slate-500 hover:text-slate-700 border-transparent'
            }`}
          >
            <t.icon size={14} />
            {t.label}
            <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded font-mono">{t.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Users size={40} className="mx-auto mb-3 text-slate-200" />
          <p className="text-sm font-semibold">Tiada permintaan</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const statusColor =
              req.schoolLinkStatus === 'approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
              req.schoolLinkStatus === 'rejected' ? 'bg-red-100 text-red-700 border-red-200' :
              'bg-amber-100 text-amber-700 border-amber-200';
            return (
              <div key={req.id} className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-sm transition">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h3 className="font-bold text-slate-800">{req.fullName}</h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase border ${statusColor}`}>
                        {req.schoolLinkStatus || 'tiada'}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        req.leaderType === 'guru' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                      }`}>
                        {req.leaderType}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <IdCard size={11} className="text-slate-400" />
                        <span className="font-mono">{req.icNumber}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Mail size={11} className="text-slate-400" />
                        <span className="truncate">{req.email}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Phone size={11} className="text-slate-400" />
                        <span>{req.phoneNumber}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar size={11} className="text-slate-400" />
                        <span>Mohon: {formatDate(req.schoolLinkRequestedAt)}</span>
                      </div>
                      {req.schoolLinkApprovedBy && (
                        <div className="flex items-center gap-1.5 col-span-2">
                          <Briefcase size={11} className="text-slate-400" />
                          <span>{req.schoolLinkStatus === 'approved' ? 'Diluluskan' : 'Ditolak'} oleh: {req.schoolLinkApprovedBy} pada {formatDate(req.schoolLinkApprovedAt)}</span>
                        </div>
                      )}
                    </div>
                    {req.schoolLinkRejectReason && (
                      <div className="mt-2 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
                        <span className="font-bold">Sebab Penolakan:</span> {req.schoolLinkRejectReason}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    {req.schoolLinkStatus === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(req)}
                          disabled={actionId === req.id}
                          className="text-xs font-bold px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"
                        >
                          {actionId === req.id ? <Loader size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(req)}
                          disabled={actionId === req.id}
                          className="text-xs font-bold px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                        >
                          <XCircle size={12} /> Reject
                        </button>
                      </>
                    )}
                    {req.schoolLinkStatus === 'approved' && (
                      <button
                        onClick={() => handleRevoke(req)}
                        disabled={actionId === req.id}
                        className="text-xs font-bold px-3 py-1.5 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1"
                      >
                        <AlertCircle size={12} /> Tarik Balik
                      </button>
                    )}
                    {req.schoolLinkStatus === 'rejected' && (
                      <button
                        onClick={() => handleApprove(req)}
                        disabled={actionId === req.id}
                        className="text-xs font-bold px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"
                      >
                        <CheckCircle size={12} /> Approve Semula
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};