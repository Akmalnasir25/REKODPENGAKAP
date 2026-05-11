import React, { useState } from 'react';
import { FileText, Download, Eye, ChevronDown } from 'lucide-react';
import { SubmissionData } from '../../types';
import { generateParticipantReport, generateSummaryReport, downloadPDF, previewPDF } from '../../services/pdfService';

interface PDFExportButtonProps {
  data: SubmissionData[];
  year?: number;
  badge?: string;
  school?: string;
  daerah?: string;
  negeri?: string;
  title?: string;
  className?: string;
}

export const PDFExportButton: React.FC<PDFExportButtonProps> = ({
  data,
  year = new Date().getFullYear(),
  badge,
  school,
  daerah,
  negeri,
  title,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleExport = async (type: 'list' | 'summary', action: 'download' | 'preview') => {
    setGenerating(true);
    setIsOpen(false);

    try {
      const options = { title, year, badge, school, daerah, negeri };
      const doc = type === 'list'
        ? generateParticipantReport(data, options)
        : generateSummaryReport(data, options);

      const safeBadge = badge ? String(badge).replace(/\s/g, '_') : '';
      const filename = `Laporan_${type === 'list' ? 'Senarai' : 'Ringkasan'}_${year}${safeBadge ? '_' + safeBadge : ''}.pdf`;

      if (action === 'download') {
        downloadPDF(doc, filename);
      } else {
        previewPDF(doc);
      }
    } catch (error) {
      console.error('PDF generation failed:', error);
      alert('Gagal menjana PDF. Sila cuba lagi.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={generating || data.length === 0}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition shadow-sm border
          ${data.length === 0 
            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' 
            : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
          }`}
      >
        <FileText size={14} />
        {generating ? 'Menjana...' : 'PDF'}
        <ChevronDown size={12} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
            <div className="p-2 border-b border-gray-100 bg-gray-50">
              <p className="text-[10px] font-bold text-gray-500 uppercase">Jana Laporan PDF</p>
            </div>
            
            <div className="p-1">
              <button
                onClick={() => handleExport('list', 'download')}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 rounded transition"
              >
                <Download size={14} className="text-blue-600" />
                <div className="text-left">
                  <div className="font-bold">Muat Turun Senarai</div>
                  <div className="text-[10px] text-gray-400">Senarai penuh peserta (PDF)</div>
                </div>
              </button>
              
              <button
                onClick={() => handleExport('list', 'preview')}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 rounded transition"
              >
                <Eye size={14} className="text-blue-600" />
                <div className="text-left">
                  <div className="font-bold">Pratonton Senarai</div>
                  <div className="text-[10px] text-gray-400">Buka dalam tab baru</div>
                </div>
              </button>

              <hr className="my-1 border-gray-100" />

              <button
                onClick={() => handleExport('summary', 'download')}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-purple-50 rounded transition"
              >
                <Download size={14} className="text-purple-600" />
                <div className="text-left">
                  <div className="font-bold">Muat Turun Ringkasan</div>
                  <div className="text-[10px] text-gray-400">Statistik & pecahan (PDF)</div>
                </div>
              </button>

              <button
                onClick={() => handleExport('summary', 'preview')}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-purple-50 rounded transition"
              >
                <Eye size={14} className="text-purple-600" />
                <div className="text-left">
                  <div className="font-bold">Pratonton Ringkasan</div>
                  <div className="text-[10px] text-gray-400">Buka dalam tab baru</div>
                </div>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
