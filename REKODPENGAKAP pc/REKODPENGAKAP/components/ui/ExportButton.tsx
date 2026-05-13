import React from 'react';
import { FileDown } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ExportButtonProps {
  data: any[];
  fileName: string;
  columns?: string[];
  className?: string;
}

export const ExportButton: React.FC<ExportButtonProps> = ({
  data,
  fileName,
  columns,
  className = 'bg-green-600 hover:bg-green-700 text-white'
}) => {
  const handleExport = () => {
    if (data.length === 0) {
      alert('Tiada data untuk di-export');
      return;
    }

    try {
      // Prepare data for Excel
      const exportData = data.map(item => {
        const row: Record<string, any> = {};
        const fieldsToExport = columns || Object.keys(item);
        
        fieldsToExport.forEach(field => {
          if (item.hasOwnProperty(field)) {
            row[field] = item[field];
          }
        });
        
        return row;
      });

      // Create workbook and worksheet
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

      // Auto-size columns
      const maxWidth = 30;
      const colWidths = Object.keys(exportData[0] || {}).map(key => ({
        wch: Math.min(key.length + 2, maxWidth)
      }));
      worksheet['!cols'] = colWidths;

      // Write file
      XLSX.writeFile(workbook, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error('Export error:', error);
      alert('Gagal export data');
    }
  };

  return (
    <button
      onClick={handleExport}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${className}`}
    >
      <FileDown className="w-4 h-4" />
      Export Excel
    </button>
  );
};
