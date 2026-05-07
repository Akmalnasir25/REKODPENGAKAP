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
  // Sanitize cell value to prevent formula injection
  const sanitizeCell = (value: any): any => {
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value)) {
      return "'" + value;
    }
    return value;
  };

  const handleExport = () => {
    if (data.length === 0) {
      alert('Tiada data untuk di-export');
      return;
    }

    try {
      // Prepare data for Excel with formula injection protection
      const exportData = data.map(item => {
        const row: Record<string, any> = {};
        const fieldsToExport = columns || Object.keys(item);
        
        fieldsToExport.forEach(field => {
          if (Object.prototype.hasOwnProperty.call(item, field)) {
            row[field] = sanitizeCell(item[field]);
          }
        });
        
        return row;
      });

      // Create workbook and worksheet
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

      // Auto-size columns based on content
      const maxWidth = 40;
      const keys = Object.keys(exportData[0] || {});
      const colWidths = keys.map(key => {
        let maxLen = key.length;
        exportData.forEach(row => {
          const val = String(row[key] || '');
          if (val.length > maxLen) maxLen = val.length;
        });
        return { wch: Math.min(maxLen + 2, maxWidth) };
      });
      worksheet['!cols'] = colWidths;

      // Sanitize filename
      const safeName = fileName.replace(/[<>:"/\\|?*]/g, '_');

      // Write file
      XLSX.writeFile(workbook, `${safeName}_${new Date().toISOString().split('T')[0]}.xlsx`);
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
