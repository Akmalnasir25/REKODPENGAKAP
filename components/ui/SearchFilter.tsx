import React, { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';

interface SearchFilterProps {
  data: any[];
  searchFields: string[];
  onFilterChange: (filteredData: any[]) => void;
  placeholder?: string;
}

export const SearchFilter: React.FC<SearchFilterProps> = ({
  data,
  searchFields,
  onFilterChange,
  placeholder = 'Cari...'
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});

  const filteredData = useMemo(() => {
    let result = data;

    // Apply text search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(item =>
        searchFields.some(field => {
          const value = String(item[field] || '').toLowerCase();
          return value.includes(term);
        })
      );
    }

    // Apply filters
    Object.entries(filters).forEach(([field, value]) => {
      if (value) {
        result = result.filter(item => 
          String(item[field] || '') === value
        );
      }
    });

    return result;
  }, [data, searchTerm, filters, searchFields]);

  const handleClear = () => {
    setSearchTerm('');
    setFilters({});
    onFilterChange(data);
  };

  React.useEffect(() => {
    onFilterChange(filteredData);
  }, [filteredData, onFilterChange]);

  return (
    <div className="space-y-3 mb-4">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Active Filters Display */}
      {(searchTerm || Object.values(filters).some(v => v)) && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">
            Ditemui: {filteredData.length} rekod
          </span>
          <button
            onClick={handleClear}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Bersihkan
          </button>
        </div>
      )}
    </div>
  );
};
