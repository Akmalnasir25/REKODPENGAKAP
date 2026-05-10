import React, { useState, useMemo } from 'react';
import { Clock, Search, Download, Trash2, Filter, User, Shield, Code } from 'lucide-react';
import { getAuditLog, filterAuditLog, exportAuditCSV, clearAuditLog, getActionLabel, getActionColor, AuditEntry, AuditAction } from '../../services/auditService';

const getRoleIcon = (role: AuditEntry['actorRole']) => {
  switch (role) {
    case 'developer': return <Code size={12} className="text-purple-500" />;
    case 'admin': case 'negeri': case 'daerah': case 'district': return <Shield size={12} className="text-blue-500" />;
    default: return <User size={12} className="text-gray-500" />;
  }
};

const formatDateTime = (timestamp: number): string => {
  const d = new Date(timestamp);
  return `${d.toLocaleDateString('ms-MY')} ${d.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}`;
};

export const AuditTrailPanel: React.FC = () => {
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState<AuditAction | ''>('');
  const [filterRole, setFilterRole] = useState<AuditEntry['actorRole'] | ''>('');
  const [page, setPage] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const PAGE_SIZE = 25;

  const allEntries = useMemo(() => getAuditLog(), [refreshKey]);

  const filteredEntries = useMemo(() => {
    return filterAuditLog({
      search: search || undefined,
      action: filterAction || undefined,
      actorRole: filterRole || undefined,
    });
  }, [search, filterAction, filterRole, refreshKey]);

  const paginatedEntries = filteredEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filteredEntries.length / PAGE_SIZE);

  const handleExportCSV = () => {
    const csv = exportAuditCSV(filteredEntries);
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_trail_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (confirm('Padam semua rekod audit? Tindakan ini tidak boleh dibatalkan.')) {
      clearAuditLog();
      setRefreshKey(k => k + 1);
    }
  };

  const uniqueActions = useMemo(() => {
    const actions = new Set(allEntries.map(e => e.action));
    return Array.from(actions).sort();
  }, [allEntries]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <Clock size={18} className="text-blue-600" /> Jejak Audit
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">{filteredEntries.length} rekod aktiviti</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportCSV} disabled={filteredEntries.length === 0} className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-bold hover:bg-green-100 transition disabled:opacity-50">
            <Download size={12} /> CSV
          </button>
          <button onClick={handleClear} disabled={allEntries.length === 0} className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-bold hover:bg-red-100 transition disabled:opacity-50">
            <Trash2 size={12} /> Padam
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari pengguna, tindakan..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <select
          value={filterAction}
          onChange={e => { setFilterAction(e.target.value as any); setPage(0); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="">Semua Tindakan</option>
          {uniqueActions.map(a => (
            <option key={a} value={a}>{getActionLabel(a as AuditAction)}</option>
          ))}
        </select>
        <select
          value={filterRole}
          onChange={e => { setFilterRole(e.target.value as any); setPage(0); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="">Semua Peranan</option>
          <option value="user">Pengguna</option>
          <option value="admin">Admin</option>
          <option value="district">Daerah (Lama)</option>
          <option value="negeri">Admin Negeri</option>
          <option value="daerah">Admin Daerah</option>
          <option value="developer">Developer</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left font-bold text-gray-600 uppercase">Masa</th>
                <th className="px-4 py-2.5 text-left font-bold text-gray-600 uppercase">Pengguna</th>
                <th className="px-4 py-2.5 text-left font-bold text-gray-600 uppercase">Tindakan</th>
                <th className="px-4 py-2.5 text-left font-bold text-gray-600 uppercase">Butiran</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginatedEntries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400 italic">
                    Tiada rekod audit dijumpai.
                  </td>
                </tr>
              ) : (
                paginatedEntries.map(entry => (
                  <tr key={entry.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-500">
                      {formatDateTime(entry.timestamp)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {getRoleIcon(entry.actorRole)}
                        <span className="font-bold text-gray-800">{entry.actor}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getActionColor(entry.action)}`}>
                        {getActionLabel(entry.action)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 max-w-xs truncate" title={entry.details}>
                      {entry.details}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-gray-50">
            <span className="text-[10px] text-gray-500">
              Halaman {page + 1} / {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-2 py-1 text-[10px] font-bold bg-white border rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Sebelum
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-2 py-1 text-[10px] font-bold bg-white border rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Seterusnya
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
