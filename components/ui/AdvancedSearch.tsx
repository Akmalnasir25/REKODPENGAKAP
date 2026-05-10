import React, { useState, useMemo } from 'react';
import { Search, Filter, X, SlidersHorizontal } from 'lucide-react';
import { SubmissionData } from '../../types';

interface FilterCriteria {
  search: string;
  badge: string;
  role: string;
  category: string;
  gender: string;
  school: string;
  hasId: 'all' | 'yes' | 'no';
}

interface AdvancedSearchProps {
  data: SubmissionData[];
  onFilteredData: (filtered: SubmissionData[]) => void;
  badges?: string[];
  schools?: string[];
  className?: string;
}

const DEFAULT_FILTERS: FilterCriteria = {
  search: '',
  badge: '',
  role: '',
  category: '',
  gender: '',
  school: '',
  hasId: 'all',
};

export const AdvancedSearch: React.FC<AdvancedSearchProps> = ({
  data,
  onFilteredData,
  badges = [],
  schools = [],
  className = ''
}) => {
  const [filters, setFilters] = useState<FilterCriteria>(DEFAULT_FILTERS);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Derive unique values from data
  const uniqueValues = useMemo(() => ({
    badges: badges.length > 0 ? badges : [...new Set(data.map(d => d.badge).filter(Boolean))],
    roles: [...new Set(data.map(d => d.role || 'PESERTA').filter(Boolean))],
    categories: [...new Set(data.map(d => d.category).filter(Boolean))],
    genders: [...new Set(data.map(d => d.gender).filter(Boolean))],
    schools: schools.length > 0 ? schools : [...new Set(data.map(d => d.school).filter(Boolean))].sort(),
  }), [data, badges, schools]);

  // Apply filters
  const filteredData = useMemo(() => {
    let result = [...data];
    const { search, badge, role, category, gender, school, hasId } = filters;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(d =>
        (d.student && d.student.toLowerCase().includes(q)) ||
        (d.icNumber && d.icNumber.toLowerCase().includes(q)) ||
        (d.id && d.id.toLowerCase().includes(q)) ||
        (d.school && d.school.toLowerCase().includes(q)) ||
        (d.schoolCode && d.schoolCode.toLowerCase().includes(q))
      );
    }
    if (badge) result = result.filter(d => d.badge === badge);
    if (role) result = result.filter(d => (d.role || 'PESERTA') === role);
    if (category) result = result.filter(d => d.category === category);
    if (gender) result = result.filter(d => d.gender === gender);
    if (school) result = result.filter(d => d.school === school);
    if (hasId === 'yes') result = result.filter(d => d.id && d.id.trim() !== '');
    if (hasId === 'no') result = result.filter(d => !d.id || d.id.trim() === '');

    return result;
  }, [data, filters]);

  // Notify parent of filtered data
  React.useEffect(() => {
    onFilteredData(filteredData);
  }, [filteredData]);

  const activeFilterCount = Object.entries(filters).filter(([key, val]) => {
    if (key === 'hasId') return val !== 'all';
    return val !== '';
  }).length;

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const updateFilter = (key: keyof FilterCriteria, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Main search bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nama, KP, ID, sekolah..."
            value={filters.search}
            onChange={e => updateFilter('search', e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
          />
          {filters.search && (
            <button onClick={() => updateFilter('search', '')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`flex items-center gap-1.5 px-3 py-2.5 border rounded-lg text-xs font-bold transition
            ${showAdvanced || activeFilterCount > 0
              ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'
            }`}
        >
          <SlidersHorizontal size={14} />
          Tapis
          {activeFilterCount > 0 && (
            <span className="bg-blue-600 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700 space-y-3 animate-[fadeIn_0.2s_ease-out]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase flex items-center gap-1">
              <Filter size={12} /> Tapis Lanjutan
            </span>
            {activeFilterCount > 0 && (
              <button onClick={handleReset} className="text-[10px] text-red-500 hover:text-red-700 font-bold">
                Reset Semua
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            <select value={filters.badge} onChange={e => updateFilter('badge', e.target.value)} className="p-2 border border-gray-200 dark:border-gray-600 rounded-lg text-[11px] bg-white dark:bg-gray-700 outline-none">
              <option value="">Semua Lencana</option>
              {uniqueValues.badges.map(b => <option key={b} value={b}>{b}</option>)}
            </select>

            <select value={filters.role} onChange={e => updateFilter('role', e.target.value)} className="p-2 border border-gray-200 dark:border-gray-600 rounded-lg text-[11px] bg-white dark:bg-gray-700 outline-none">
              <option value="">Semua Peranan</option>
              {uniqueValues.roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            <select value={filters.category} onChange={e => updateFilter('category', e.target.value)} className="p-2 border border-gray-200 dark:border-gray-600 rounded-lg text-[11px] bg-white dark:bg-gray-700 outline-none">
              <option value="">Semua Kategori</option>
              {uniqueValues.categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select value={filters.gender} onChange={e => updateFilter('gender', e.target.value)} className="p-2 border border-gray-200 dark:border-gray-600 rounded-lg text-[11px] bg-white dark:bg-gray-700 outline-none">
              <option value="">Semua Jantina</option>
              {uniqueValues.genders.map(g => <option key={g} value={g}>{g}</option>)}
            </select>

            <select value={filters.school} onChange={e => updateFilter('school', e.target.value)} className="p-2 border border-gray-200 dark:border-gray-600 rounded-lg text-[11px] bg-white dark:bg-gray-700 outline-none">
              <option value="">Semua Sekolah</option>
              {uniqueValues.schools.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <select value={filters.hasId} onChange={e => updateFilter('hasId', e.target.value)} className="p-2 border border-gray-200 dark:border-gray-600 rounded-lg text-[11px] bg-white dark:bg-gray-700 outline-none">
              <option value="all">ID: Semua</option>
              <option value="yes">Ada ID</option>
              <option value="no">Tiada ID</option>
            </select>
          </div>

          {/* Results count */}
          <div className="text-[10px] text-gray-500 dark:text-gray-400 pt-1">
            Menunjukkan <strong>{filteredData.length}</strong> daripada <strong>{data.length}</strong> rekod
          </div>
        </div>
      )}
    </div>
  );
};
