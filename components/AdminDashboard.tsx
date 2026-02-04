
import React, { useMemo, useState } from 'react';
import { SubmissionData, School } from '../types';
import { BrainCircuit, RefreshCw, BarChart3, Database, Trash2, Sparkles, Search, User, Shield, GraduationCap, Calendar, Phone, Crown, School as SchoolIcon, Users, ListFilter, PieChart, AlertCircle, Eye, EyeOff, Printer, CheckCircle, Award, Archive, Medal, TrendingUp } from 'lucide-react';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { analyzeData } from '../services/geminiService';

interface AdminDashboardProps {
  data: SubmissionData[];
  schools: School[]; // Added schools prop to check locked status
  onRefresh: () => void;
  onDelete: (item: SubmissionData) => void;
}

type TabType = 'all' | 'students' | 'leaders' | 'assistants' | 'examiners' | 'principals' | 'archive';
type PrintMode = 'none' | 'stats' | 'list' | 'archive';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ data, schools, onRefresh, onDelete }) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBadgeFilter, setSelectedBadgeFilter] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('all');
  
  // Print State
  const [printMode, setPrintMode] = useState<PrintMode>('none');
  
  // Default false: Only show APPROVED data in stats and list
  const [showDrafts, setShowDrafts] = useState(false); 

  // AI State
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // 1. FILTER DATA: Deduplicate and Filter
  const submittedData = useMemo(() => {
    const uniqueKeys = new Set<string>(); // Set to track unique records

    return data.filter(item => {
        // 1. Exclude system markers ALWAYS (Technical requirement)
        if (item.school === '__SYSTEM_YEAR_MARKER__') return false;

        // 2. Valid Name Check (Filter out ghost rows)
        // Ensure student name exists and is a string
        if (!item.student || typeof item.student !== 'string' || !item.student.trim()) return false;

        // 3. APPROVAL LOGIC
        // If showDrafts is ON, we show everything (Approved + Pending + Drafts)
        let isApproved = false;
        if (showDrafts) {
            isApproved = true;
        } else {
            // CRITICAL FIX: Ensure 's' exists before accessing 's.name'
            const schoolConfig = schools.find(s => s && s.name === item.school);
            
            // If school found and has approved badges
            if (schoolConfig && schoolConfig.approvedBadges) {
                const itemYear = new Date(item.date).getFullYear();
                const badgeYearKey = `${item.badge}_${itemYear}`;
                const approvedList = Array.isArray(schoolConfig.approvedBadges) ? schoolConfig.approvedBadges : [];
                
                // Check if allowed
                if (approvedList.includes(badgeYearKey) || approvedList.includes(item.badge)) {
                    isApproved = true;
                }
            }
        }

        if (!isApproved) return false;

        // 4. DEDUPLICATION LOGIC (The Fix)
        // We create a unique key for this person for this specific badge and year.
        // If we see this key again, we skip it.
        const year = new Date(item.date).getFullYear();
        const cleanName = String(item.student).trim().toUpperCase();
        const cleanIC = item.icNumber ? String(item.icNumber).trim() : '';
        const badge = item.badge;
        const school = item.school;

        // Unique Key Strategy:
        // Preference 1: IC + Badge + Year (Most accurate)
        // Preference 2: Name + School + Badge + Year (Fallback if no IC)
        const uniqueKey = cleanIC && cleanIC.length > 4
            ? `${cleanIC}_${badge}_${year}`
            : `${cleanName}_${school}_${badge}_${year}`;

        if (uniqueKeys.has(uniqueKey)) {
            return false; // DUPLICATE FOUND - SKIP IT
        }

        uniqueKeys.add(uniqueKey); // Add to set
        return true; // Keep it
    });
  }, [data, schools, showDrafts]);

  // Count Pending Approvals (Submitted/Locked by user but NOT Approved by Admin)
  const pendingCount = useMemo(() => {
    let count = 0;
    schools.forEach(s => {
        // Safety check for s
        if(s && s.lockedBadges) {
            s.lockedBadges.forEach(badgeKey => {
                if(!s.approvedBadges || !s.approvedBadges.includes(badgeKey)) {
                    count++;
                }
            })
        }
    });
    return count;
  }, [schools]);

  const availableYears = useMemo(() => {
    // Use raw data for years to avoid empty dropdowns if nothing submitted yet
    const years = new Set<number>(data.map(d => new Date(d.date).getFullYear()));
    years.add(currentYear);
    return Array.from(years).sort((a: number, b: number) => b - a);
  }, [data, currentYear]);

  // Filter by year using the SUBMITTED data
  const yearData = useMemo(() => {
      return submittedData.filter(d => new Date(d.date).getFullYear() === selectedYear);
  }, [submittedData, selectedYear]);

  // Available badges for filter dropdown
  const availableBadges = useMemo(() => {
      const badges = new Set(yearData.map(d => d.badge).filter(Boolean));
      return Array.from(badges).sort();
  }, [yearData]);

  // --- ARCHIVE DATA (Achievements: Emas & Rambu) ---
  const archiveData = useMemo(() => {
      // Get all approved data across all years
      const allApproved = submittedData;
      
      const groupedByYear: Record<number, { rambu: SubmissionData[], emas: SubmissionData[] }> = {};

      allApproved.forEach(item => {
          const y = new Date(item.date).getFullYear();
          const badge = item.badge || '';
          const role = item.role || '';

          if (badge === 'Anugerah Rambu' || role === 'PENERIMA RAMBU' || badge.includes('Keris Emas')) {
              if (!groupedByYear[y]) {
                  groupedByYear[y] = { rambu: [], emas: [] };
              }

              if (badge === 'Anugerah Rambu' || role === 'PENERIMA RAMBU') {
                  groupedByYear[y].rambu.push(item);
              } else if (badge.includes('Keris Emas')) {
                  groupedByYear[y].emas.push(item);
              }
          }
      });

      // Sort keys descending
      const sortedYears = Object.keys(groupedByYear).map(Number).sort((a,b) => b - a);
      
      return sortedYears.map(year => ({
          year,
          ...groupedByYear[year]
      }));
  }, [submittedData]);

  // Statistics
  const schoolStats = useMemo(() => {
    const stats: Record<string, { 
        name: string; 
        total: number; 
        male: number; 
        female: number;
        leaders: number;
        examiners: number;
        rambu: number; // New Field for Rambu recipients
        students: number; // Explicit student count
    }> = {};
    
    // Apply badge filter to statistics if a badge is selected
    const dataToProcess = selectedBadgeFilter 
        ? yearData.filter(d => d.badge === selectedBadgeFilter)
        : yearData;

    dataToProcess.forEach(item => {
      const schoolName = item.school || "Tidak Diketahui";
      if (!stats[schoolName]) {
        stats[schoolName] = { 
            name: schoolName, 
            total: 0, 
            male: 0, 
            female: 0,
            leaders: 0,
            examiners: 0,
            rambu: 0,
            students: 0
        };
      }
      
      const role = (item.role || 'PESERTA').toUpperCase();
      const badge = (item.badge || '').trim();
      
      // Robust Gender Normalization
      // Removes whitespace and converts to uppercase
      const genderRaw = (item.gender || '').trim().toUpperCase();
      
      if (role === 'PENGUJI') {
          stats[schoolName].examiners += 1;
      } else if (role.includes('PENOLONG') || role === 'PEMIMPIN') {
          stats[schoolName].leaders += 1;
      } else {
          // It's a student (PESERTA or PENERIMA RAMBU)
          stats[schoolName].students += 1;

          // Check if starts with L (L, LELAKI, LAKI-LAKI) or M (MALE)
          if (genderRaw.startsWith('L') || genderRaw.startsWith('M')) {
              stats[schoolName].male += 1;
          } 
          // Check if starts with P (P, PEREMPUAN) or F (FEMALE)
          else if (genderRaw.startsWith('P') || genderRaw.startsWith('F')) {
              stats[schoolName].female += 1;
          }
          // If neither, it counts towards 'students' total but not male/female breakdown
          // This ensures total count matches sheet even if gender is typo'd.

          // Check if it's Rambu specifically
          if (badge === 'Anugerah Rambu' || role === 'PENERIMA RAMBU') {
              stats[schoolName].rambu += 1;
          }
      }

      stats[schoolName].total += 1;
    });
    return Object.values(stats).sort((a, b) => b.total - a.total);
  }, [yearData, selectedBadgeFilter]);

  const totals = useMemo(() => {
    return schoolStats.reduce((acc, curr) => ({
        male: acc.male + curr.male,
        female: acc.female + curr.female,
        leaders: acc.leaders + curr.leaders,
        examiners: acc.examiners + curr.examiners,
        rambu: acc.rambu + curr.rambu,
        total: acc.total + curr.total,
        students: acc.students + curr.students
    }), { male: 0, female: 0, leaders: 0, examiners: 0, rambu: 0, total: 0, students: 0 });
  }, [schoolStats]);

  const maxTotal = useMemo(() => {
    return Math.max(...schoolStats.map(s => s.total), 1);
  }, [schoolStats]);

  // Race Statistics (Students Only)
  const raceStats = useMemo(() => {
    const stats: Record<string, number> = {};
    
    // Apply badge filter
    const dataToProcess = selectedBadgeFilter 
        ? yearData.filter(d => d.badge === selectedBadgeFilter)
        : yearData;

    dataToProcess.forEach(item => {
        const role = (item.role || 'PESERTA').toUpperCase();
        // Only count STUDENTS or RAMBU RECIPIENTS
        if (role === 'PESERTA' || role === 'PENERIMA RAMBU') {
             // Normalizing race strings
             let race = (item.race || 'Lain-lain').trim();
             if (race === '') race = 'Lain-lain';
             
             stats[race] = (stats[race] || 0) + 1;
        }
    });

    return Object.entries(stats)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
  }, [yearData, selectedBadgeFilter]);

  // Detailed Filter (Base for most tabs)
  const baseFilteredData = useMemo(() => {
    let result = yearData;

    // Filter by Badge
    if (selectedBadgeFilter) {
        result = result.filter(item => item.badge === selectedBadgeFilter);
    }

    // Filter by Search Query
    if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase();
        result = result.filter(item => 
          (item.student && String(item.student).toLowerCase().includes(lowerQuery)) ||
          (item.school && String(item.school).toLowerCase().includes(lowerQuery)) ||
          (item.badge && String(item.badge).toLowerCase().includes(lowerQuery)) ||
          (item.id && String(item.id).toLowerCase().includes(lowerQuery)) ||
          (item.icNumber && String(item.icNumber).includes(lowerQuery)) ||
          (item.studentPhone && String(item.studentPhone).includes(lowerQuery)) ||
          (item.role && String(item.role).toLowerCase().includes(lowerQuery)) ||
          (item.principalName && String(item.principalName).toLowerCase().includes(lowerQuery)) ||
          (item.leader && String(item.leader).toLowerCase().includes(lowerQuery)) ||
          (item.groupNumber && String(item.groupNumber).includes(lowerQuery))
        );
    }
    return result;
  }, [yearData, searchQuery, selectedBadgeFilter]);

  // Specific Tab Data Filtering
  const displayedData = useMemo(() => {
      if (activeTab === 'principals') {
          // Special logic for Principals: Unique schools only
          const uniqueSchools = new Map<string, SubmissionData>();
          baseFilteredData.forEach(item => {
              if (!uniqueSchools.has(item.school)) {
                  uniqueSchools.set(item.school, item);
              }
          });
          return Array.from(uniqueSchools.values()).sort((a,b) => a.school.localeCompare(b.school));
      }

      return baseFilteredData.filter(item => {
          const role = (item.role || 'PESERTA').toUpperCase();
          switch(activeTab) {
              case 'students': return role === 'PESERTA' || role === 'PENERIMA RAMBU';
              case 'leaders': return role === 'PEMIMPIN';
              case 'assistants': return role.includes('PENOLONG');
              case 'examiners': return role === 'PENGUJI';
              default: return true; // 'all'
          }
      });
  }, [baseFilteredData, activeTab]);

  const handleAdminAnalysisAI = async () => {
    if (yearData.length === 0) {
        alert("Tiada data yang disahkan untuk dianalisis.");
        return;
    }
    setAiLoading(true);
    setAiAnalysis("Sedang menganalisis data...");
    
    // We analyze the full year data to give better context
    const summaryForAI = yearData.map(d => `${d.school} (${d.badge}): ${d.gender} [${d.role || 'PESERTA'}]`).join('\n').substring(0, 10000);
    try {
        const result = await analyzeData(summaryForAI);
        setAiAnalysis(result);
    } catch (e) {
        setAiAnalysis("Ralat semasa menjana analisis.");
    } finally {
        setAiLoading(false);
    }
  };

  const handlePrint = (mode: PrintMode) => {
    setPrintMode(mode);
    // Allow state to update and render the print view before triggering print dialog
    setTimeout(() => {
        window.print();
    }, 100);
  };

  const getRoleIcon = (role?: string) => {
      const r = role?.toUpperCase();
      if (r === 'PENGUJI') return <GraduationCap size={14} className="text-green-600"/>;
      if (r?.includes('PENOLONG')) return <Shield size={14} className="text-indigo-600"/>;
      if (r === 'PEMIMPIN') return <Crown size={14} className="text-purple-600"/>;
      if (r === 'PENERIMA RAMBU') return <Award size={14} className="text-amber-600"/>;
      return <User size={14} className="text-gray-600"/>;
  };

  const getRoleBadge = (role?: string) => {
      const r = role?.toUpperCase();
      if (r === 'PENGUJI') return <span className="bg-green-100 text-green-800 text-[10px] px-1.5 py-0.5 rounded border border-green-200 font-bold">PENGUJI</span>;
      if (r?.includes('PENOLONG')) return <span className="bg-indigo-100 text-indigo-800 text-[10px] px-1.5 py-0.5 rounded border border-indigo-200 font-bold">PENOLONG</span>;
      if (r === 'PEMIMPIN') return <span className="bg-purple-100 text-purple-800 text-[10px] px-1.5 py-0.5 rounded border border-purple-200 font-bold">PEMIMPIN</span>;
      if (r === 'PENERIMA RAMBU') return <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded border border-amber-200 font-bold">PENERIMA RAMBU</span>;
      return null;
  };

  const getOldId = (remarks?: string) => {
      if (!remarks) return null;
      try {
        const match = remarks.match(/ID Lama:\s*([^|]+)/i);
        return match ? match[1].trim() : null;
      } catch (e) {
        return null;
      }
  };

  const WhatsAppLink = ({ phone }: { phone?: string | number }) => {
      if (!phone) return null;
      const phoneStr = String(phone);
      const cleanPhone = phoneStr.replace(/[^0-9]/g, '');
      const waNumber = cleanPhone.startsWith('0') ? '6' + cleanPhone : cleanPhone;
      
      return (
          <a 
            href={`https://wa.me/${waNumber}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-green-600 bg-green-50 hover:bg-green-100 px-2 py-0.5 rounded text-[10px] font-bold border border-green-200 w-fit mt-0.5 print:hidden"
            title="Buka WhatsApp"
          >
              <Phone size={10} /> {phoneStr}
          </a>
      );
  };

  const TabButton = ({ id, label, icon: Icon, colorClass }: { id: TabType, label: string, icon: any, colorClass: string }) => (
      <button
        onClick={() => setActiveTab(id)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
            activeTab === id 
            ? `${colorClass} text-white shadow-md` 
            : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-200'
        }`}
      >
          <Icon size={14} /> {label}
      </button>
  );

  return (
    <div className="space-y-6">
      
      {/* PRINT LAYOUT (ADMIN - TABLE ONLY) */}
      <div className="hidden print:block font-serif text-black p-4">
        <style>{`
          @media print {
            @page {
              size: A4 landscape;
              margin: 10mm;
            }
            body {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
            .bg-gray-200 {
              background-color: #e5e7eb !important;
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
          }
        `}</style>
        <div className="text-center mb-6">
            <h1 className="text-xl font-bold uppercase">SENARAI PENDAFTARAN PENGAKAP DAERAH KINTA UTARA</h1>
            <h2 className="text-lg font-bold">TAHUN {selectedYear}</h2>
            {selectedBadgeFilter && <h3 className="text-md uppercase">LENCANA: {selectedBadgeFilter}</h3>}
        </div>
        <table className="w-full border-collapse border border-black text-xs">
            <thead>
                <tr className="bg-gray-200">
                    <th className="border border-black px-2 py-1 text-center">NO.</th>
                    <th className="border border-black px-2 py-1 text-left">NAMA</th>
                    <th className="border border-black px-2 py-1 text-center">NO. KP</th>
                    <th className="border border-black px-2 py-1 text-left">SEKOLAH</th>
                    <th className="border border-black px-2 py-1 text-center">PERANAN</th>
                    <th className="border border-black px-2 py-1 text-center">NO. AHLI</th>
                </tr>
            </thead>
            <tbody>
                {displayedData.map((item, i) => (
                    <tr key={i}>
                        <td className="border border-black px-2 py-1 text-center">{i+1}</td>
                        <td className="border border-black px-2 py-1 uppercase">{item.student}</td>
                        <td className="border border-black px-2 py-1 text-center">{item.icNumber}</td>
                        <td className="border border-black px-2 py-1 uppercase">{item.school} <span className="text-[9px]">({item.schoolCode})</span></td>
                        <td className="border border-black px-2 py-1 text-center uppercase">{item.role || 'PESERTA'} {item.badge ? `(${item.badge})` : ''}</td>
                        <td className="border border-black px-2 py-1 text-center">{item.id || '-'}</td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      {/* SCREEN ONLY CONTENT */}
      <div className="print:hidden space-y-6">
        
        {/* PENDING APPROVAL ALERT */}
        {pendingCount > 0 && !showDrafts && (
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-lg shadow-sm flex items-start gap-3 animate-[fadeIn_0.5s_ease-out]">
                <AlertCircle className="text-yellow-600 shrink-0 mt-0.5" />
                <div>
                    <h3 className="text-yellow-800 font-bold text-sm">Menunggu Pengesahan</h3>
                    <p className="text-yellow-700 text-xs mt-1">
                        Terdapat <strong>{pendingCount}</strong> pendaftaran sekolah yang telah dihantar tetapi belum disahkan. 
                        Sila ke tab <strong>"Urus Sekolah"</strong> untuk mengesahkan data sebelum ia dikira dalam statistik.
                    </p>
                </div>
            </div>
        )}

        {/* Filters Bar */}
        {activeTab !== 'archive' && (
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4 bg-white p-4 rounded-xl shadow">
                <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                        <Calendar size={14}/> Tahun Semasa:
                    </label>
                    <select 
                        className="p-2 border rounded-lg font-bold text-blue-800 outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50 text-sm"
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    >
                        {availableYears.map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>

                <div className="w-px h-8 bg-gray-200 hidden md:block"></div>

                <div className="flex items-center gap-2 flex-1">
                    <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                        Lencana:
                    </label>
                    <select 
                        className="p-2 border rounded-lg text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-sm w-full md:w-auto"
                        value={selectedBadgeFilter}
                        onChange={(e) => setSelectedBadgeFilter(e.target.value)}
                    >
                        <option value="">Semua Lencana</option>
                        {availableBadges.map((b, i) => (
                            <option key={i} value={b}>{b}</option>
                        ))}
                    </select>
                </div>
                
                <div className="flex flex-col items-end gap-1">
                    <button
                        onClick={() => setShowDrafts(!showDrafts)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold transition border ${
                            showDrafts 
                            ? 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200' 
                            : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                        }`}
                        title={showDrafts ? "Sembunyikan data draft/pending" : "Paparkan semua data termasuk draft"}
                    >
                        {showDrafts ? <Eye size={12}/> : <EyeOff size={12}/>}
                        {showDrafts ? 'Semua Data Dipaparkan' : 'Hanya Data Disahkan'}
                    </button>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                        Rekod Dipaparkan: <strong>{submittedData.length}</strong>
                    </span>
                </div>
            </div>
        )}

        {/* STATS SUMMARY CARDS (Aggregated Counts) */}
        {activeTab !== 'archive' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-[fadeIn_0.3s_ease-out]">
                {/* SEKOLAH CARD (NEW) */}
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-orange-500 relative overflow-hidden">
                    <div className="flex justify-between items-start z-10 relative">
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Jumlah Sekolah</p>
                            <h3 className="text-3xl font-black text-gray-800">{schoolStats.length}</h3>
                            <p className="text-xs text-orange-600 font-semibold mt-1">Sekolah Terlibat</p>
                        </div>
                        <div className="p-3 bg-orange-50 rounded-lg text-orange-600">
                            <SchoolIcon size={24} />
                        </div>
                    </div>
                    <SchoolIcon size={100} className="absolute -bottom-4 -right-4 text-orange-50 opacity-50 z-0" />
                </div>

                {/* PESERTA CARD */}
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500 relative overflow-hidden">
                    <div className="flex justify-between items-start z-10 relative">
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Jumlah Peserta</p>
                            <h3 className="text-3xl font-black text-gray-800">{totals.students}</h3>
                            <p className="text-xs text-blue-600 font-semibold mt-1">Lelaki: {totals.male} | Perempuan: {totals.female}</p>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                            <Users size={24} />
                        </div>
                    </div>
                    {/* Decorative bg */}
                    <Users size={100} className="absolute -bottom-4 -right-4 text-blue-50 opacity-50 z-0" />
                </div>

                {/* PEMIMPIN CARD */}
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-indigo-500 relative overflow-hidden">
                    <div className="flex justify-between items-start z-10 relative">
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Pemimpin & Penolong</p>
                            <h3 className="text-3xl font-black text-gray-800">{totals.leaders}</h3>
                            <p className="text-xs text-indigo-600 font-semibold mt-1">Pegawai Bertugas</p>
                        </div>
                        <div className="p-3 bg-indigo-50 rounded-lg text-indigo-600">
                            <Shield size={24} />
                        </div>
                    </div>
                    <Shield size={100} className="absolute -bottom-4 -right-4 text-indigo-50 opacity-50 z-0" />
                </div>

                {/* PENGUJI CARD */}
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500 relative overflow-hidden">
                    <div className="flex justify-between items-start z-10 relative">
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Jumlah Penguji</p>
                            <h3 className="text-3xl font-black text-gray-800">{totals.examiners}</h3>
                            <p className="text-xs text-green-600 font-semibold mt-1">Lantikan Khas</p>
                        </div>
                        <div className="p-3 bg-green-50 rounded-lg text-green-600">
                            <GraduationCap size={24} />
                        </div>
                    </div>
                    <GraduationCap size={100} className="absolute -bottom-4 -right-4 text-green-50 opacity-50 z-0" />
                </div>
            </div>
        )}

        {/* AI Section (Only if NOT in archive tab) */}
        {activeTab !== 'archive' && (
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-6 rounded-xl shadow border border-purple-100">
                <div className="flex justify-between items-start mb-4">
                <h2 className="font-bold flex items-center gap-2 text-purple-800">
                    <BrainCircuit size={20} /> Analisis Data Pintar (AI) - Tahun {selectedYear}
                </h2>
                <button 
                    onClick={handleAdminAnalysisAI} 
                    disabled={aiLoading} 
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-purple-700 flex items-center gap-2 shadow transition disabled:opacity-50"
                >
                    {aiLoading ? <LoadingSpinner size="sm" color="border-white" /> : <Sparkles size={14} />}
                    Jana Analisis
                </button>
                </div>
                {aiAnalysis ? (
                <div className="bg-white p-4 rounded-lg border border-purple-200 text-sm text-gray-700 prose prose-sm max-w-none shadow-sm" dangerouslySetInnerHTML={{ __html: aiAnalysis }} />
                ) : (
                <p className="text-xs text-purple-600 italic">
                    Tekan butang 'Jana Analisis' untuk meminta AI merumuskan trend data yang telah disahkan (Diterima oleh Admin) pada tahun {selectedYear}.
                </p>
                )}
            </div>
        )}

        {/* Statistics Table (SCHOOLS) - Only if NOT in archive tab */}
        {activeTab !== 'archive' && (
            <div className="bg-white p-6 rounded-xl shadow overflow-hidden">
                <div className="flex justify-between items-center mb-6">
                <h2 className="font-bold flex items-center gap-2 text-gray-800">
                    <BarChart3 size={20} className="text-blue-600" /> Statistik Pendaftaran {showDrafts ? '(Semua)' : '(Disahkan Sahaja)'} {selectedYear}
                    {selectedBadgeFilter && <span className="text-sm font-normal text-blue-700 ml-2 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">({selectedBadgeFilter})</span>}
                </h2>
                <div className="flex gap-2">
                    <button onClick={() => handlePrint('stats')} className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 transition shadow">
                        <Printer size={16} /> Cetak Statistik
                    </button>
                    <button onClick={onRefresh} className="text-blue-600 hover:bg-blue-50 p-2 rounded transition">
                        <RefreshCw size={20} />
                    </button>
                </div>
                </div>

                {schoolStats.length === 0 && (
                    <div className="bg-yellow-50 text-yellow-800 p-4 rounded-lg flex items-center gap-3 mb-4 text-sm">
                        <AlertCircle size={20}/>
                        <span>
                            {showDrafts 
                            ? "Tiada sebarang data dijumpai."
                            : "Tiada statistik dipaparkan kerana belum ada data yang disahkan oleh Admin."}
                        </span>
                    </div>
                )}
                
                <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border rounded-lg">
                    <thead className="bg-blue-50 uppercase text-xs font-bold text-blue-900 border-b border-blue-100">
                        <tr>
                            <th className="px-4 py-3 min-w-[200px]">Nama Sekolah</th>
                            <th className="px-4 py-3 text-center w-20 text-blue-600">Peserta (L)</th>
                            <th className="px-4 py-3 text-center w-20 text-pink-600">Peserta (P)</th>
                            <th className="px-4 py-3 text-center w-24 bg-teal-50 text-teal-700">Jum. Peserta</th>
                            <th className="px-4 py-3 text-center w-24 bg-amber-50 text-amber-700">Penerima Rambu</th>
                            <th className="px-4 py-3 text-center w-20 text-indigo-600">Pemimpin</th>
                            <th className="px-4 py-3 text-center w-20 text-green-600">Penguji</th>
                            <th className="px-4 py-3 text-center w-24 bg-blue-100/50">Jumlah Besar</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {schoolStats.map((stat, i) => (
                            <tr key={i} className="hover:bg-gray-50 transition">
                                <td className="px-4 py-2 font-medium text-gray-700">
                                    <div>{stat.name}</div>
                                    {/* Visual Bar */}
                                    <div className="w-full bg-gray-100 h-1.5 rounded-full mt-1.5 overflow-hidden">
                                        <div 
                                            className="h-full bg-blue-500 rounded-full" 
                                            style={{ width: `${(stat.total / maxTotal) * 100}%` }}
                                        ></div>
                                    </div>
                                </td>
                                <td className="px-4 py-2 text-center text-gray-600 font-semibold">{stat.male}</td>
                                <td className="px-4 py-2 text-center text-gray-600 font-semibold">{stat.female}</td>
                                <td className="px-4 py-2 text-center text-teal-600 font-bold bg-teal-50/50">{stat.students}</td>
                                <td className="px-4 py-2 text-center text-amber-600 font-bold bg-amber-50/50">{stat.rambu > 0 ? stat.rambu : '-'}</td>
                                <td className="px-4 py-2 text-center text-indigo-600 font-bold bg-indigo-50/50">{stat.leaders}</td>
                                <td className="px-4 py-2 text-center text-green-600 font-bold bg-green-50/50">{stat.examiners}</td>
                                <td className="px-4 py-2 text-center font-bold bg-gray-50 text-gray-900">{stat.total}</td>
                            </tr>
                        ))}
                        {schoolStats.length === 0 && (
                        <tr>
                            <td colSpan={8} className="px-4 py-8 text-center text-gray-400 italic">
                            Tiada rekod statistik untuk paparan ini.
                            </td>
                        </tr>
                        )}
                    </tbody>
                    {schoolStats.length > 0 && (
                        <tfoot className="bg-gray-800 text-white font-bold border-t-2 border-gray-300">
                            <tr>
                                <td className="px-4 py-3 text-right uppercase text-xs tracking-wider">Jumlah Keseluruhan (Semua)</td>
                                <td className="px-4 py-3 text-center text-blue-200">{totals.male}</td>
                                <td className="px-4 py-3 text-center text-pink-200">{totals.female}</td>
                                <td className="px-4 py-3 text-center text-teal-300">{totals.students}</td>
                                <td className="px-4 py-3 text-center text-amber-300">{totals.rambu}</td>
                                <td className="px-4 py-3 text-center text-indigo-200">{totals.leaders}</td>
                                <td className="px-4 py-3 text-center text-green-200">{totals.examiners}</td>
                                <td className="px-4 py-3 text-center bg-gray-900 text-yellow-400 text-base">{totals.total}</td>
                            </tr>
                        </tfoot>
                    )}
                </table>
                </div>
            </div>
        )}

        {/* DETAILED DATA TABLE */}
        {activeTab !== 'archive' && (
            <div className="bg-white p-6 rounded-xl shadow overflow-hidden">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                    <div className="flex flex-wrap gap-2">
                        <TabButton id="all" label="Semua" icon={ListFilter} colorClass="bg-gray-800" />
                        <TabButton id="students" label="Peserta" icon={Users} colorClass="bg-blue-600" />
                        <TabButton id="leaders" label="Pemimpin" icon={Crown} colorClass="bg-purple-600" />
                        <TabButton id="assistants" label="Penolong" icon={Shield} colorClass="bg-indigo-600" />
                        <TabButton id="examiners" label="Penguji" icon={GraduationCap} colorClass="bg-green-600" />
                        <TabButton id="principals" label="GB/Pengetua" icon={SchoolIcon} colorClass="bg-amber-600" />
                    </div>

                    <div className="relative w-full md:w-64">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                            type="text" 
                            className="w-full pl-9 p-2 border rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none transition" 
                            placeholder="Cari nama, KP, sekolah..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 uppercase text-xs text-slate-600 font-bold border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3">Nama</th>
                                <th className="px-4 py-3">Kad Pengenalan</th>
                                <th className="px-4 py-3">Sekolah</th>
                                <th className="px-4 py-3">Peranan & Lencana</th>
                                <th className="px-4 py-3">No. Telefon</th>
                                {activeTab === 'principals' && <th className="px-4 py-3">Nama GB</th>}
                                <th className="px-4 py-3 text-right">Tindakan</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {displayedData.map((item, i) => (
                                <tr key={i} className="hover:bg-gray-50 transition">
                                    <td className="px-4 py-3">
                                        <div className="font-bold text-gray-800 uppercase">{item.student}</div>
                                        <div className="text-[10px] text-gray-500">{item.gender} • {item.race}</div>
                                        {item.remarks && <div className="text-[10px] text-orange-600 italic mt-0.5">{item.remarks}</div>}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-gray-600">{item.icNumber || '-'}</td>
                                    <td className="px-4 py-3">
                                        <div className="text-gray-800 font-medium leading-tight">{item.school}</div>
                                        <div className="text-[10px] text-gray-500 font-mono mt-0.5">{item.schoolCode} • Kump {item.groupNumber}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            {getRoleBadge(item.role)}
                                            <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded border">{item.badge}</span>
                                        </div>
                                        {item.id && <div className="text-[10px] font-mono font-bold text-blue-800 mt-1">ID: {item.id}</div>}
                                        {getOldId(item.remarks) && <div className="text-[9px] text-gray-400 line-through">ID Lama: {getOldId(item.remarks)}</div>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <WhatsAppLink phone={item.studentPhone} />
                                    </td>
                                    {activeTab === 'principals' && (
                                        <td className="px-4 py-3">
                                            <div className="text-xs font-bold">{item.principalName}</div>
                                            <WhatsAppLink phone={item.principalPhone} />
                                        </td>
                                    )}
                                    <td className="px-4 py-3 text-right">
                                        <button 
                                            onClick={() => onDelete(item)}
                                            className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition"
                                            title="Padam Rekod"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {displayedData.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400 italic">
                                        Tiada rekod dijumpai.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* ARCHIVE VIEW */}
        {activeTab === 'archive' && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-[fadeIn_0.3s_ease-out]">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <div>
                        <h2 className="font-bold text-amber-800 flex items-center gap-2 text-lg">
                            <Archive size={20}/> Arkib Pencapaian Tertinggi
                        </h2>
                        <p className="text-xs text-amber-700 mt-1">Senarai penerima Anugerah Rambu dan Keris Emas sepanjang zaman.</p>
                    </div>
                </div>

                <div className="space-y-6">
                    {archiveData.length === 0 && <p className="text-center py-12 text-gray-400 italic">Tiada data pencapaian.</p>}
                    {archiveData.map((yearGroup) => (
                        <div key={yearGroup.year} className="border rounded-lg overflow-hidden bg-gray-50">
                            <div className="bg-amber-100 px-4 py-2 border-b border-amber-200 flex justify-between items-center">
                                <h3 className="font-bold text-amber-900 flex items-center gap-2 text-sm">
                                    <Award size={16}/> Tahun {yearGroup.year}
                                </h3>
                                <div className="flex gap-2 text-[10px] font-bold">
                                    <span className="bg-white/50 px-2 py-1 rounded text-amber-800 border border-amber-200/50">Rambu: {yearGroup.rambu.length}</span>
                                    <span className="bg-white/50 px-2 py-1 rounded text-amber-800 border border-amber-200/50">Emas: {yearGroup.emas.length}</span>
                                </div>
                            </div>
                            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200">
                                <div className="p-4">
                                    <h4 className="font-bold text-xs text-amber-600 uppercase mb-2 flex items-center gap-1"><Medal size={12}/> Penerima Rambu</h4>
                                    <ul className="space-y-1 h-64 overflow-y-auto pr-2 custom-scrollbar">
                                        {yearGroup.rambu.map((p, i) => (
                                            <li key={i} className="text-xs bg-white p-2 rounded border shadow-sm font-semibold uppercase flex justify-between items-center">
                                                <span>{p.student}</span>
                                                <span className="text-[9px] text-gray-400 bg-gray-50 px-1 rounded">{p.schoolCode}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="p-4">
                                    <h4 className="font-bold text-xs text-yellow-600 uppercase mb-2 flex items-center gap-1"><Award size={12}/> Penerima Emas</h4>
                                    <ul className="space-y-1 h-64 overflow-y-auto pr-2 custom-scrollbar">
                                        {yearGroup.emas.map((p, i) => (
                                            <li key={i} className="text-xs bg-white p-2 rounded border shadow-sm font-semibold uppercase flex justify-between items-center">
                                                <span>{p.student}</span>
                                                <span className="text-[9px] text-gray-400 bg-gray-50 px-1 rounded">{p.schoolCode}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

      </div>
    </div>
  );
};
