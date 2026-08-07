import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, RefreshCw, Medal, Users, X } from 'lucide-react';
import { SubmissionData, Badge, School as SchoolType } from '../types';
import { approveSchoolBadge, reopenSchoolBadge, getSubmittedSchools, approveDaerahLevel } from '../services/supabaseApi';
import { badgeStatusKey } from '../utils/dataProcessing';
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

  const handleApprove = async (schoolName: string, badgeName: string, isDaerahLevel: boolean, siri: number = 1) => {
    const label = isDaerahLevel ? 'Sahkan peringkat daerah' : 'Sahkan pendaftaran';
    const siriLabel = siri > 1 ? ` Siri ${siri}` : '';
    if (!confirm(`${label} '${badgeName}${siriLabel}' untuk ${schoolName}?`)) return;
    setActionLoading(`approve-${schoolName}-${badgeName}-${siri}`);
    try {
      // Setiap siri disahkan berasingan (migrasi 027) — kunci mesti membawa siri,
      // jika tidak pengesahan Siri 2 akan tertulis ke baris Siri 1.
      const res = isDaerahLevel
        ? await approveDaerahLevel(schoolName, badgeName, new Date().getFullYear(), siri)
        : await approveSchoolBadge(scriptUrl, schoolName, badgeStatusKey(badgeName, new Date().getFullYear(), siri));
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

  const handleReopen = async (schoolName: string, badgeName: string, siri: number = 1) => {
    const siriLabel = siri > 1 ? ` Siri ${siri}` : '';
    if (!confirm(`Tolak/Buka semula pendaftaran '${badgeName}${siriLabel}' untuk ${schoolName}?`)) return;
    setActionLoading(`reopen-${schoolName}-${badgeName}-${siri}`);
    try {
      const badgeKey = badgeStatusKey(badgeName, new Date().getFullYear(), siri);
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

  const [bulkApproving, setBulkApproving] = useState<string | null>(null);

  const handleBulkApproveByBadge = async (badgeName: string, items: any[]) => {
    const pending = items.filter((item: any) => {
      const daerah = item.school?.daerah?.code || '';
      const isDaerahStep = !!daerahCode && !!item.badge?.requires_daerah_approval && (item.badge?.scope === 'negeri');
      return !item.daerah_approved || !isDaerahStep;
    });
    if (pending.length === 0) { alert('Semua sudah disahkan.'); return; }
    if (!confirm(`Sahkan pukal ${pending.length} sekolah untuk "${badgeName}"?`)) return;
    setBulkApproving(badgeName);
    let successCount = 0;
    let failCount = 0;
    for (const item of pending) {
      const schoolName = item.school?.name || '';
      const daerah = item.school?.daerah?.code || '';
      const isDaerahStep = !!daerahCode && !!item.badge?.requires_daerah_approval && (item.badge?.scope === 'negeri');
      const siri = item.siri ?? 1;
      try {
        const res = isDaerahStep
          ? await approveDaerahLevel(schoolName, badgeName, new Date().getFullYear(), siri)
          : await approveSchoolBadge(scriptUrl, schoolName, badgeStatusKey(badgeName, new Date().getFullYear(), siri));
        if (res.status === 'success') successCount++;
        else failCount++;
      } catch { failCount++; }
    }
    setBulkApproving(null);
    alert(`Selesai: ${successCount} berjaya, ${failCount} gagal.`);
    await fetchSubmitted();
    onRefresh();
  };

  const handleBulkApproveAll = async () => {
    const allItems = submittedList.filter((item: any) => {
      const daerah = item.school?.daerah?.code || '';
      const isDaerahStep = !!daerahCode && !!item.badge?.requires_daerah_approval && (item.badge?.scope === 'negeri');
      return !item.daerah_approved || !isDaerahStep;
    });
    if (allItems.length === 0) { alert('Tiada pendaftaran menunggu pengesahan.'); return; }
    if (!confirm(`Sahkan pukal SEMUA ${allItems.length} pendaftaran merentas semua program?\n\nTindakan ini tidak boleh dibatalkan.`)) return;
    setBulkApproving('__ALL__');
    let successCount = 0;
    let failCount = 0;
    for (const item of allItems) {
      const schoolName = item.school?.name || '';
      const badgeName = item.badge?.name || '';
      const daerah = item.school?.daerah?.code || '';
      const isDaerahStep = !!daerahCode && !!item.badge?.requires_daerah_approval && (item.badge?.scope === 'negeri');
      const siri = item.siri ?? 1;
      try {
        const res = isDaerahStep
          ? await approveDaerahLevel(schoolName, badgeName, new Date().getFullYear(), siri)
          : await approveSchoolBadge(scriptUrl, schoolName, badgeStatusKey(badgeName, new Date().getFullYear(), siri));
        if (res.status === 'success') successCount++;
        else failCount++;
      } catch { failCount++; }
    }
    setBulkApproving(null);
    alert(`Selesai: ${successCount} berjaya, ${failCount} gagal.`);
    await fetchSubmitted();
    onRefresh();
  };

  const grouped = submittedList.reduce((acc: Record<string, any[]>, item: any) => {
    const badgeName = item.badge?.name || 'Tidak Diketahui';
    if (!acc[badgeName]) acc[badgeName] = [];
    acc[badgeName].push(item);
    return acc;
  }, {});

  const getParticipantCount = (schoolName: string, badgeName: string, siri: number = 1) => {
    const currentYear = new Date().getFullYear();
    return data.filter(d =>
      d.school === schoolName &&
      d.badge === badgeName &&
      (d.siri || 1) === siri &&
      new Date(d.date).getFullYear() === currentYear
    ).length;
  };

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
          <CheckCircle size={20} className="text-green-600" /> Pengesahan Pendaftaran
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={fetchSubmitted} disabled={loading} className="text-blue-600 hover:bg-blue-50 p-2 rounded transition" title="Muat semula">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-500 mb-4">
        Senarai sekolah yang telah menghantar pendaftaran (status: submitted) dan menunggu pengesahan.
      </p>

      {!loading && submittedList.length > 0 && (
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={handleBulkApproveAll}
            disabled={bulkApproving === '__ALL__'}
            className="px-4 py-2 bg-green-700 text-white text-xs font-bold rounded-lg hover:bg-green-800 transition disabled:opacity-50 flex items-center gap-2 shadow"
          >
            {bulkApproving === '__ALL__' ? <LoadingSpinner size="sm" color="border-white" /> : <CheckCircle size={14} />}
            Sahkan Pukal Semua ({submittedList.length})
          </button>
          <span className="text-[10px] text-slate-400">Tindakan ini akan sahkan semua pendaftaran yang menunggu.</span>
        </div>
      )}

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
          <div className="flex items-center justify-between mb-3 bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
            <div className="flex items-center gap-2">
              <Medal size={16} className="text-amber-600" />
              <span className="font-bold text-slate-700">{badgeName}</span>
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">{items.length} sekolah</span>
            </div>
            {items.length > 1 && (
              <button
                onClick={() => handleBulkApproveByBadge(badgeName, items)}
                disabled={bulkApproving === badgeName}
                className="px-3 py-1 bg-green-600 text-white text-[10px] font-bold rounded hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-1"
              >
                {bulkApproving === badgeName ? <LoadingSpinner size="sm" color="border-white" /> : <CheckCircle size={10} />}
                Sahkan Semua
              </button>
            )}
          </div>

          <div className="space-y-2">
            {items.map((item: any, idx: number) => {
              const schoolName = item.school?.name || 'Tidak Diketahui';
              const daerah = item.school?.daerah?.code || '';
              const siri = item.siri ?? 1;
              const participantCount = getParticipantCount(schoolName, badgeName, siri);
              const submittedDate = item.submitted_at ? new Date(item.submitted_at).toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
              const isApproving = actionLoading === `approve-${schoolName}-${badgeName}-${siri}`;
              const isReopening = actionLoading === `reopen-${schoolName}-${badgeName}-${siri}`;
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
                      {siri > 1 && <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-semibold">Siri {siri}</span>}
                      {daerah && <span className="bg-slate-100 px-2 py-0.5 rounded">{daerah}</span>}
                      <span>Dihantar: {submittedDate}</span>
                      {daerahDoneLabel}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprove(schoolName, badgeName, isDaerahApproveStep, siri)}
                      disabled={isApproving}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-1"
                      title={isDaerahApproveStep ? 'Sahkan peringkat daerah, kemudian negeri akan sahkan' : 'Sahkan pendaftaran'}
                    >
                      {isApproving ? <LoadingSpinner size="sm" color="border-white" /> : <CheckCircle size={14} />}
                      {isDaerahApproveStep ? 'Sahkan (Daerah)' : 'Sahkan'}
                    </button>
                    <button
                      onClick={() => handleReopen(schoolName, badgeName, siri)}
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
