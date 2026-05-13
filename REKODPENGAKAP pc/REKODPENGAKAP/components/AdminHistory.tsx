
import React, { useMemo, useState } from 'react';
import { SubmissionData, School } from '../types';
import { History, LayoutList, ArrowRight, School as SchoolIcon, Eye, EyeOff, Search, Users } from 'lucide-react';

interface AdminHistoryProps {
  data: SubmissionData[];
  schools: School[];
  onRefresh: () => void;
}

export const AdminHistory: React.FC<AdminHistoryProps> = ({ data, schools, onRefresh }) => {
  const [showDrafts, setShowDrafts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const currentYear = new Date().getFullYear();

  // 1. FILTER DATA
  const sourceData = useMemo(() => {
    // Unique key tracker to prevent duplicates in history
    const uniqueKeys = new Set<string>();

    const cleanData = data.filter(d => {
        // Exclude system markers
        if (d.school === '__SYSTEM_YEAR_MARKER__') return false;
        
        // FILTER: ONLY STUDENTS (Peserta & Penerima Rambu)
        // Exclude Leaders, Assistants, Examiners
        const role = (d.role || 'PESERTA').toUpperCase();
        if (role === 'PEMIMPIN' || role.includes('PENOLONG') || role === 'PENGUJI') {
            return false;
        }

        // Must have valid name
        if (!d.student || typeof d.student !== 'string' || !d.student.trim()) return false;

        // DEDUPLICATION:
        // Identify record uniqueness: IC + Badge + Year
        const year = new Date(d.date).getFullYear();
        const cleanName = d.student.trim().toUpperCase();
        const cleanIC = d.icNumber ? String(d.icNumber).trim() : '';
        const uniqueKey = cleanIC && cleanIC.length > 4
            ? `${cleanIC}_${d.badge}_${year}`
            : `${cleanName}_${d.school}_${d.badge}_${year}`;

        if (uniqueKeys.has(uniqueKey)) return false;
        uniqueKeys.add(uniqueKey);

        return true; 
    });

    if (showDrafts) return cleanData;

    return cleanData.filter(item => {
        // SAFETY FIX: Ensure 's' exists before accessing 's.name'
        const schoolConfig = schools.find(s => s && s.name === item.school);
        
        if (!schoolConfig || !schoolConfig.approvedBadges) return false;

        const itemYear = new Date(item.date).getFullYear();
        const badgeYearKey = `${item.badge}_${itemYear}`;

        // Ensure array
        const approvedList = Array.isArray(schoolConfig.approvedBadges) ? schoolConfig.approvedBadges : [];

        return approvedList.includes(badgeYearKey) || approvedList.includes(item.badge);
    });
  }, [data, schools, showDrafts]);

  // 2. GROUP BY STUDENT (COHORT TRACKING)
  const studentHistory = useMemo(() => {
      // Map: Key = IC_NAME (Unique Student Identifier)
      const studentMap = new Map<string, { 
          name: string, 
          ic: string, 
          school: string,
          schoolCode: string,
          history: Record<number, { id: string, badge: string }> 
      }>();

      sourceData.forEach(item => {
          const icStr = item.icNumber ? String(item.icNumber) : '';
          const studentName = item.student ? String(item.student) : '';

          if (!studentName.trim()) return;

          // Unique Key: IC + Name to handle students changing schools or duplicate names
          const key = icStr.length > 5 
            ? `${icStr.trim()}_${studentName.trim().toUpperCase()}` 
            : `${studentName.trim().toUpperCase()}_${item.school}`;

          if (!studentMap.has(key)) {
              studentMap.set(key, { 
                  name: studentName.toUpperCase(), 
                  ic: icStr || '-', 
                  school: item.school,
                  schoolCode: item.schoolCode || '',
                  history: {} 
              });
          }
          
          const entry = studentMap.get(key)!;
          const y = new Date(item.date).getFullYear();
          
          // Add to history (Year -> Badge Info)
          entry.history[y] = { 
              id: item.id || '-', 
              badge: item.badge 
          };
      });
      
      let finalData = Array.from(studentMap.values());

      // Filter by Search Query
      if (searchQuery) {
          const q = searchQuery.toLowerCase();
          finalData = finalData.filter(s => 
              s.name.toLowerCase().includes(q) || 
              s.ic.includes(q) || 
              s.school.toLowerCase().includes(q) ||
              s.schoolCode.toLowerCase().includes(q)
          );
      }

      // Sort by Name
      return finalData.sort((a,b) => a.name.localeCompare(b.name));
  }, [sourceData, searchQuery]);

  // Determine available years for columns (e.g., 2024, 2025, 2026)
  const availableYears = useMemo(() => {
      const years = new Set<number>();
      data.forEach(d => {
          if (d.school !== '__SYSTEM_YEAR_MARKER__') {
              years.add(new Date(d.date).getFullYear());
          }
      });
      return Array.from(years).sort((a, b) => a - b);
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow border border-gray-200 animate-[fadeIn_0.2s_ease-out]">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
            <div>
                <h2 className="font-bold text-gray-800 flex items-center gap-2 text-lg">
                    <History size={20} className="text-blue-900"/> Semakan Rekod Keahlian (Master)
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                    Memaparkan perjalanan keahlian setiap murid merentas tahun.
                </p>
            </div>

            <div className="flex gap-4 items-center w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                        type="text" 
                        className="w-full pl-9 p-2 border rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none transition" 
                        placeholder="Cari nama, KP, atau sekolah..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                
                <button
                    onClick={() => setShowDrafts(!showDrafts)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold transition border h-full ${
                        showDrafts 
                        ? 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200' 
                        : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                    }`}
                    title={showDrafts ? "Sembunyikan data draft" : "Paparkan semua data"}
                >
                    {showDrafts ? <Eye size={14}/> : <EyeOff size={14}/>}
                </button>
            </div>
        </div>

        <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm text-left border-separate border-spacing-0">
                <thead className="bg-slate-100 uppercase text-xs text-slate-700 font-bold sticky top-0 z-10 shadow-sm">
                    <tr>
                        <th className="px-4 py-3 bg-slate-100 border-b border-r border-slate-200 min-w-[250px] sticky left-0 z-20">Maklumat Peserta</th>
                        <th className="px-4 py-3 bg-slate-100 border-b border-r border-slate-200 min-w-[200px]">Sekolah</th>
                        {availableYears.map(year => (
                            <th key={year} className="px-4 py-3 bg-slate-50 border-b border-r border-slate-200 text-center min-w-[120px]">
                                {year}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                    {studentHistory.map((student, i) => (
                        <tr key={i} className="hover:bg-blue-50/30 transition">
                            <td className="px-4 py-3 border-r border-gray-100 sticky left-0 bg-white hover:bg-blue-50/30 z-10">
                                <div className="font-bold text-gray-800 uppercase text-xs">{student.name}</div>
                                <div className="text-[10px] text-gray-500 font-mono mt-0.5">{student.ic}</div>
                            </td>
                            <td className="px-4 py-3 border-r border-gray-100">
                                <div className="text-xs font-medium text-gray-700 truncate max-w-[200px]" title={student.school}>{student.school}</div>
                                <div className="text-[9px] text-gray-400 font-mono">{student.schoolCode}</div>
                            </td>
                            {availableYears.map(year => {
                                const historyItem = student.history[year];
                                return (
                                    <td key={year} className="px-2 py-2 border-r border-gray-100 text-center align-middle">
                                        {historyItem ? (
                                            <div className={`
                                                inline-flex flex-col items-center justify-center p-1.5 rounded w-full h-full min-h-[50px]
                                                ${historyItem.badge.includes('Emas') ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' : 
                                                  historyItem.badge.includes('Perak') ? 'bg-gray-100 text-gray-800 border border-gray-300' :
                                                  historyItem.badge.includes('Gangsa') ? 'bg-orange-50 text-orange-800 border border-orange-200' :
                                                  'bg-blue-50 text-blue-800 border border-blue-200'}
                                            `}>
                                                <span className="text-[9px] font-bold uppercase leading-tight mb-1">{historyItem.badge}</span>
                                                <span className="text-[9px] font-mono bg-white/50 px-1 rounded">{historyItem.id}</span>
                                            </div>
                                        ) : (
                                            <span className="text-gray-200 text-lg">•</span>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                    {studentHistory.length === 0 && (
                        <tr>
                            <td colSpan={availableYears.length + 2} className="px-4 py-12 text-center text-gray-400 italic">
                                Tiada rekod dijumpai.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
        <div className="mt-4 text-xs text-gray-500 flex justify-between items-center">
            <span>Memaparkan {studentHistory.length} rekod unik.</span>
        </div>
      </div>
    </div>
  );
};
