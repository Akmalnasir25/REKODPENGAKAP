import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, FileWarning, Search, ShieldAlert, UserX } from 'lucide-react';
import { SubmissionData, School } from '../types';

interface AdminDataAuditProps {
  data: SubmissionData[];
  schools: School[];
}

type AuditFilter = 'all' | 'missingId' | 'missingIc' | 'missingBoth' | 'missingIdThreeYears';

const isBlank = (value?: string) => !value || !String(value).trim() || String(value).trim() === '-';
const getYear = (date: string) => new Date(date).getFullYear();
const isStudentRecord = (item: SubmissionData) => {
  const role = (item.role || 'PESERTA').toUpperCase();
  return role !== 'PEMIMPIN' && !role.includes('PENOLONG') && role !== 'PENGUJI';
};

export const AdminDataAudit: React.FC<AdminDataAuditProps> = ({ data, schools }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<AuditFilter>('all');

  const auditData = useMemo(() => {
    const uniqueKeys = new Set<string>();

    return data.filter(item => {
      if (item.school === '__SYSTEM_YEAR_MARKER__') return false;
      if (!item.student || typeof item.student !== 'string' || !item.student.trim()) return false;
      if (!isStudentRecord(item)) return false;

      const year = getYear(item.date);
      if (Number.isNaN(year)) return false;

      const cleanName = item.student.trim().toUpperCase();
      const cleanIC = item.icNumber ? String(item.icNumber).trim() : '';
      const uniqueKey = cleanIC && cleanIC.length > 4
        ? `${cleanIC}_${item.badge}_${year}`
        : `${cleanName}_${item.school}_${item.badge}_${year}`;

      if (uniqueKeys.has(uniqueKey)) return false;
      uniqueKeys.add(uniqueKey);

      return true;
    });
  }, [data]);

  const missingIdRecords = useMemo(() => auditData.filter(item => isBlank(item.id)), [auditData]);
  const missingIcRecords = useMemo(() => auditData.filter(item => isBlank(item.icNumber)), [auditData]);
  const missingBothRecords = useMemo(() => auditData.filter(item => isBlank(item.id) && isBlank(item.icNumber)), [auditData]);

  const missingIdThreeYears = useMemo(() => {
    const studentMap = new Map<string, {
      name: string;
      ic: string;
      school: string;
      schoolCode: string;
      years: Set<number>;
      records: SubmissionData[];
    }>();

    missingIdRecords.forEach(item => {
      const name = item.student.trim().toUpperCase();
      const ic = item.icNumber ? String(item.icNumber).trim() : '';
      const key = ic && ic.length > 4 ? `${ic}_${name}` : `${name}_${item.school}`;
      const year = getYear(item.date);

      if (!studentMap.has(key)) {
        studentMap.set(key, {
          name,
          ic: ic || '-',
          school: item.school,
          schoolCode: item.schoolCode || '',
          years: new Set<number>(),
          records: []
        });
      }

      const entry = studentMap.get(key)!;
      entry.years.add(year);
      entry.records.push(item);
    });

    return Array.from(studentMap.values())
      .filter(entry => {
        const years = Array.from(entry.years).sort((a, b) => a - b);
        for (let i = 0; i <= years.length - 3; i++) {
          if (years[i + 1] === years[i] + 1 && years[i + 2] === years[i] + 2) return true;
        }
        return false;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [missingIdRecords]);

  const filteredRecords = useMemo(() => {
    let records = auditData;
    if (activeFilter === 'missingId') records = missingIdRecords;
    if (activeFilter === 'missingIc') records = missingIcRecords;
    if (activeFilter === 'missingBoth') records = missingBothRecords;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      records = records.filter(item =>
        item.student.toLowerCase().includes(q) ||
        item.school.toLowerCase().includes(q) ||
        (item.schoolCode || '').toLowerCase().includes(q) ||
        (item.badge || '').toLowerCase().includes(q) ||
        (item.icNumber || '').toLowerCase().includes(q)
      );
    }

    return records.sort((a, b) => getYear(b.date) - getYear(a.date) || a.student.localeCompare(b.student));
  }, [activeFilter, auditData, missingBothRecords, missingIcRecords, missingIdRecords, searchQuery]);

  const filteredThreeYearData = useMemo(() => {
    if (!searchQuery) return missingIdThreeYears;
    const q = searchQuery.toLowerCase();
    return missingIdThreeYears.filter(item =>
      item.name.toLowerCase().includes(q) ||
      item.school.toLowerCase().includes(q) ||
      item.schoolCode.toLowerCase().includes(q) ||
      item.ic.toLowerCase().includes(q)
    );
  }, [missingIdThreeYears, searchQuery]);

  const cards = [
    { key: 'all' as AuditFilter, label: 'Semua Peserta Diaudit', value: auditData.length, icon: CheckCircle, color: 'blue' },
    { key: 'missingId' as AuditFilter, label: 'Tiada No. Keahlian / ID', value: missingIdRecords.length, icon: UserX, color: 'amber' },
    { key: 'missingIc' as AuditFilter, label: 'Tiada No. Kad Pengenalan', value: missingIcRecords.length, icon: FileWarning, color: 'orange' },
    { key: 'missingBoth' as AuditFilter, label: 'Tiada ID dan KP', value: missingBothRecords.length, icon: AlertTriangle, color: 'red' },
    { key: 'missingIdThreeYears' as AuditFilter, label: 'Tiada ID 3 Tahun Berturut', value: missingIdThreeYears.length, icon: ShieldAlert, color: 'purple' },
  ];

  const badgeClass = (color: string, active: boolean) => {
    const styles: Record<string, string> = {
      blue: active ? 'bg-blue-900 text-white border-blue-900' : 'bg-blue-50 text-blue-800 border-blue-200',
      amber: active ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50 text-amber-800 border-amber-200',
      orange: active ? 'bg-orange-600 text-white border-orange-600' : 'bg-orange-50 text-orange-800 border-orange-200',
      red: active ? 'bg-red-600 text-white border-red-600' : 'bg-red-50 text-red-800 border-red-200',
      purple: active ? 'bg-purple-700 text-white border-purple-700' : 'bg-purple-50 text-purple-800 border-purple-200',
    };
    return styles[color];
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow border border-gray-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="font-bold text-gray-800 flex items-center gap-2 text-lg">
              <ShieldAlert size={20} className="text-red-700" /> Audit Data Peserta
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Semak rekod peserta yang tidak lengkap seperti tiada nombor keahlian/ID, tiada nombor kad pengenalan, dan tiada ID 3 tahun berturut.
            </p>
          </div>
          <div className="relative w-full lg:w-80">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="w-full pl-9 p-2 border rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-1 focus:ring-red-500 outline-none transition"
              placeholder="Cari nama, sekolah, program, KP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-6">
          {cards.map(card => {
            const Icon = card.icon;
            const active = activeFilter === card.key;
            return (
              <button
                key={card.key}
                onClick={() => setActiveFilter(card.key)}
                className={`text-left p-4 rounded-xl border transition shadow-sm hover:shadow-md ${badgeClass(card.color, active)}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wide opacity-80">{card.label}</p>
                    <p className="text-2xl font-black mt-1">{card.value}</p>
                  </div>
                  <Icon size={22} className="opacity-80" />
                </div>
              </button>
            );
          })}
        </div>

        {activeFilter === 'missingIdThreeYears' ? (
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm text-left">
              <thead className="bg-purple-50 uppercase text-xs text-purple-900 font-bold">
                <tr>
                  <th className="px-4 py-3 border-b">Peserta</th>
                  <th className="px-4 py-3 border-b">Sekolah</th>
                  <th className="px-4 py-3 border-b text-center">Tahun Tiada ID</th>
                  <th className="px-4 py-3 border-b text-center">Jumlah Tahun</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredThreeYearData.map((item, index) => (
                  <tr key={`${item.name}_${index}`} className="hover:bg-purple-50/50">
                    <td className="px-4 py-3">
                      <div className="font-bold text-gray-800 text-xs uppercase">{item.name}</div>
                      <div className="text-[10px] text-gray-500 font-mono">KP: {item.ic}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-gray-700">{item.school}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{item.schoolCode || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-wrap justify-center gap-1">
                        {Array.from(item.years).sort((a, b) => a - b).map(year => (
                          <span key={year} className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-[10px] font-bold">{year}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center font-black text-purple-900">{item.years.size}</td>
                  </tr>
                ))}
                {filteredThreeYearData.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-12 text-center text-gray-400 italic">Tiada peserta dikesan tiada ID 3 tahun berturut.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-100 uppercase text-xs text-slate-700 font-bold">
                <tr>
                  <th className="px-4 py-3 border-b">Peserta</th>
                  <th className="px-4 py-3 border-b">Sekolah</th>
                  <th className="px-4 py-3 border-b">Program</th>
                  <th className="px-4 py-3 border-b text-center">Tahun</th>
                  <th className="px-4 py-3 border-b">No. Keahlian / ID</th>
                  <th className="px-4 py-3 border-b">No. KP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRecords.map((item, index) => (
                  <tr key={`${item.student}_${item.school}_${item.badge}_${index}`} className="hover:bg-red-50/30">
                    <td className="px-4 py-3">
                      <div className="font-bold text-gray-800 text-xs uppercase">{item.student}</div>
                      <div className="text-[10px] text-gray-500">{item.role || 'PESERTA'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-gray-700">{item.school}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{item.schoolCode || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-700">{item.badge || '-'}</td>
                    <td className="px-4 py-3 text-center text-xs font-bold">{getYear(item.date)}</td>
                    <td className={`px-4 py-3 text-xs font-mono ${isBlank(item.id) ? 'text-red-700 font-bold bg-red-50' : 'text-gray-600'}`}>
                      {isBlank(item.id) ? 'TIADA ID' : item.id}
                    </td>
                    <td className={`px-4 py-3 text-xs font-mono ${isBlank(item.icNumber) ? 'text-red-700 font-bold bg-red-50' : 'text-gray-600'}`}>
                      {isBlank(item.icNumber) ? 'TIADA KP' : item.icNumber}
                    </td>
                  </tr>
                ))}
                {filteredRecords.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400 italic">Tiada rekod dijumpai.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
