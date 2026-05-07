import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  render?: (value: any, row: any) => React.ReactNode;
}

interface SortableTableProps {
  columns: Column[];
  data: any[];
  rowsPerPage?: number;
}

type SortDirection = 'asc' | 'desc' | null;

export const SortableTable: React.FC<SortableTableProps> = ({
  columns,
  data,
  rowsPerPage = 10
}) => {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const safeRowsPerPage = Number.isFinite(rowsPerPage) && rowsPerPage > 0 ? rowsPerPage : 10;
  const safeData = Array.isArray(data) ? data : [];

  // Reset pagination when data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [data]);

  const handleSort = (key: string) => {
    if (sortColumn === key) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortColumn(null);
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortColumn(key);
      setSortDirection('asc');
    }
  };

  const normalizeSortValue = (value: any) => {
    if (typeof value === 'number') return { type: 'number', value };
    const str = String(value ?? '').trim();
    const num = Number(str);
    if (str !== '' && Number.isFinite(num)) return { type: 'number', value: num };
    const date = Date.parse(str);
    if (str && !Number.isNaN(date) && /\d{4}|\d{1,2}[\/\-]\d{1,2}/.test(str)) return { type: 'date', value: date };
    return { type: 'string', value: str.toLowerCase() };
  };

  const sortedData = React.useMemo(() => {
    let result = [...safeData];
    
    if (sortColumn && sortDirection) {
      result.sort((a, b) => {
        const aNorm = normalizeSortValue(a?.[sortColumn]);
        const bNorm = normalizeSortValue(b?.[sortColumn]);

        let comparison = 0;
        if (aNorm.type === bNorm.type && (aNorm.type === 'number' || aNorm.type === 'date')) {
          comparison = Number(aNorm.value) - Number(bNorm.value);
        } else {
          comparison = String(aNorm.value).localeCompare(String(bNorm.value));
        }
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [safeData, sortColumn, sortDirection]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedData.length / safeRowsPerPage));
  const startIdx = (currentPage - 1) * safeRowsPerPage;
  const paginatedData = sortedData.slice(startIdx, startIdx + safeRowsPerPage);

  const visiblePages = React.useMemo(() => {
    const maxButtons = 5;
    const half = Math.floor(maxButtons / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [currentPage, totalPages]);

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  className={`px-4 py-3 text-left font-semibold text-gray-700 ${
                    col.sortable !== false ? 'cursor-pointer hover:bg-gray-100' : ''
                  }`}
                  style={col.width ? { width: col.width } : {}}
                >
                  <div className="flex items-center gap-2">
                    {col.label}
                    {col.sortable !== false && sortColumn === col.key && (
                      sortDirection === 'asc' ? (
                        <ChevronUp className="w-4 h-4 text-blue-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-blue-600" />
                      )
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length > 0 ? (
              paginatedData.map((row, idx) => (
                <tr key={row?.rowIndex ?? row?.id ?? `${startIdx + idx}`} className="border-b border-gray-100 hover:bg-gray-50">
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3 text-gray-700">
                      {col.render ? col.render(row?.[col.key], row) : String(row?.[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">
                  Tiada data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">
            Halaman {currentPage} dari {totalPages} ({sortedData.length} rekod)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50"
            >
              Sebelum
            </button>
            {visiblePages.map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-3 py-1 rounded ${
                  currentPage === page
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50"
            >
              Seterusnya
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
