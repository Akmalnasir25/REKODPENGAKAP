import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, RefreshCw, Medal, Users, X } from 'lucide-react';
import { SubmissionData, Badge, School as SchoolType } from '../types';
import { approveSchoolBadge, reopenSchoolBadge, getSubmittedSchools, approveDaerahLevel } from '../services/supabaseApi';
import { LoadingSpinner } from './ui/LoadingSpinner';

interface PengesahanTabProps {
  daerahCode?: string;
  negeriCode?: string;
  scriptUrl: string;
  data: SubmissionData[];
  schools: SchoolType[];
  badges: Badge[];
  onRefresh: () => void;
}

export const PengesahanTab: React.FC<PengesahanTabProps> = ({ daerahCode, negeriCode, scriptUrl, data, schools, badges, onRefresh }) => {
  const [submittedList, setSubmittedList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchSubmitted = useCallback(async () => {
    setLoading(true);
    try {
      const results = await getSubmittedSchools(daerahCode, new Date().getFullYear(), negeriCode);
      setSubmittedList(results);
    } catch (e) {
      console.error('Failed to fetch submitted schools:', e);
    } finally {
      setLoading(false);
    }
  }, [daerahCode, negeriCode]);

  useEffect(() => {
    fetchSubmitted();
  }, [fetchSubmitted]);

  const handleApprove = async (schoolName: string, badgeName: string, isDaerahLevel: boolean) => {
    const label = isDaerahLevel ? 'Sahkan peringkat daerah' : 'Sahkan pendaftaran';
    if (!confirm(`${label} '${badgeName}' untuk ${schoolName}?`)) return;
    setActionLoading(`approve-${schoolName}-${badgeName}`);
    try {
      const res = isDaerahLevel
        ? await approveDaerahLevel(schoolName, badgeName)
        : await approveSchoolBadge(scriptUrl, schoolName, badgeName);
      if (res.status === 'success') {
        await fetchSubmitted();
        onRefresh();
      } else {
        alert('Gagal: ' + res.message);
      }
    } catch (e) {
      alert('Ralat sambungan.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReopen = async (schoolName: string, badgeName: string) => {
    if (!confirm(`Tolak/Buka semula pendaftaran '${badgeName}' untuk ${schoolName}?`)) return;
    setActionLoading(`reopen-${schoolName}-${badgeName}`);
    try {
      const badgeKey = `${badgeName}_${new Date().getFullYear()}`;
      const res = await reopenSchoolBadge(scriptUrl, schoolName, badgeKey);
      if (res.status === 'success') {
        await fetchSubmitted();
        onRefresh();
      } else {
        alert('Gagal: ' + res.message);
      }
    } catch (e) {
      alert('Ralat sambungan.');
    } finally {
      setActionLoading(null);
    }
  };

  const grouped = submittedList.reduce((acc: Record<string, any[]>, item: any) => {
    const badgeName = item.badge?.name || 'Tidak Diketahui';
    if (!acc[badgeName]) acc[badgeName] = [];
    acc[badgeName].push(item);
    return acc;
  }, {});

  const getParticipantCount = (schoolName: string, badgeName: string) => {
    const currentYear = new Date().getFullYear();
    return data.filter(d =>
      d.school === schoolName &&
      d.badge === badgeName &&
      new Date(d.date).getFullYear() === currentYear
    ).length;
  };

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
          <CheckCircle size={20} className="text-green-600" /> Pengesahan Pendaftaran
        </h2>
        <button onClick={fetchSubmitted} disabled={loading} className="text-blue-600 hover:bg-blue-50 p-2 rounded transition">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <p className="text-sm text-slate-500 mb-6">
        Senarai sekolah yang telah menghantar pendaftaran (status: submitted) dan menunggu pengesahan.
      </p>

      {loading && (
        <div className="flex justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      )}

      {!loading && Object.keys(grouped).length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <CheckCircle size={48} className="mx-auto mb-3 opacity-50" />
          <p className="font-medium">Tiada pendaftaran menunggu pengesahan.</p>
        </div>
      )}

      {!loading && Object.entries(grouped).map(([badgeName, items]) => (
        <div key={badgeName} className="mb-6">
          <div className="flex items-center gap-2 mb-3 bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
            <Medal size={16} className="text-amber-600" />
            <span className="font-bold text-slate-700">{badgeName}</span>
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">{items.length} sekolah</span>
          </div>

          <div className="space-y-2">
            {items.map((item: any, idx: number) => {
              const schoolName = item.school?.name || 'Tidak Diketahui';
              const daerah = item.school?.daerah?.code || '';
              const participantCount = getParticipantCount(schoolName, badgeName);
              const submittedDate = item.submitted_at ? new Date(item.submitted_at).toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
              const isApproving = actionLoading === `approve-${schoolName}-${badgeName}`;
              const isReopening = actionLoading === `reopen-${schoolName}-${badgeName}`;
              const isDaerahApproveStep = !!daerahCode && !!item.badge?.requires_daerah_approval && (item.badge?.scope === 'negeri');
              const daerahDoneLabel = item.daerah_approved
                ? <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded">Daerah disahkan</span>
                : null;

              return (
                <div key={idx} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-3 hover:shadow-sm transition">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800 text-sm">{schoolName}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1"><Users size={12} /> {participantCount} peserta</span>
                      <span className="flex items-center gap-1"><Medal size={12} /> {badgeName}</span>
                      {daerah && <span className="bg-slate-100 px-2 py-0.5 rounded">{daerah}</span>}
                      <span>Dihantar: {submittedDate}</span>
                      {daerahDoneLabel}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprove(schoolName, badgeName, isDaerahApproveStep)}
                      disabled={isApproving}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-1"
                      title={isDaerahApproveStep ? 'Sahkan peringkat daerah, kemudian negeri akan sahkan' : 'Sahkan pendaftaran'}
                    >
                      {isApproving ? <LoadingSpinner size="sm" color="border-white" /> : <CheckCircle size={14} />}
                      {isDaerahApproveStep ? 'Sahkan (Daerah)' : 'Sahkan'}
                    </button>
                    <button
                      onClick={() => handleReopen(schoolName, badgeName)}
                      disabled={isReopening}
                      className="px-3 py-1.5 bg-red-50 text-red-600 text-xs font-bold rounded-lg hover:bg-red-100 border border-red-200 transition disabled:opacity-50 flex items-center gap-1"
                    >
                      {isReopening ? <LoadingSpinner size="sm" color="border-red-500" /> : <X size={14} />}
                      Tolak/Buka Semula
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
