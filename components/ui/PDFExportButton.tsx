import React, { useMemo, useState } from 'react';
import { FileText, Download, Eye, ChevronDown, X, Check } from 'lucide-react';
import { SubmissionData } from '../../types';
import { generateParticipantReport, generateSummaryReport, generateCombinedReport, downloadPDF, previewPDF } from '../../services/pdfService';

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

type Section = 'list' | 'stats';

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
  const [includeList, setIncludeList] = useState(true);
  const [includeStats, setIncludeStats] = useState(true);
  const [selectedSchools, setSelectedSchools] = useState<Set<string>>(new Set());
  const [allSchools, setAllSchools] = useState(true);

  // Unique schools from data
  const schoolList = useMemo(() => {
    const map = new Map<string, { name: string; code: string; count: number }>();
    for (const d of data) {
      const key = (d.school || 'Tidak Dinyatakan') + '||' + (d.schoolCode || '');
      const existing = map.get(key);
      if (existing) existing.count++;
      else map.set(key, { name: d.school || 'Tidak Dinyatakan', code: d.schoolCode || '', count: 1 });
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const toggleSchool = (key: string) => {
    setSelectedSchools(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setAllSchools(false);
  };

  const toggleAllSchools = () => {
    if (allSchools) {
      setAllSchools(false);
      setSelectedSchools(new Set());
    } else {
      setAllSchools(true);
      setSelectedSchools(new Set());
    }
  };

  const filteredData = useMemo(() => {
    if (allSchools || selectedSchools.size === 0) return data;
    return data.filter(d => {
      const key = (d.school || 'Tidak Dinyatakan') + '||' + (d.schoolCode || '');
      return selectedSchools.has(key);
    });
  }, [data, allSchools, selectedSchools]);

  const handleExport = async (action: 'download' | 'preview') => {
    if (!includeList && !includeStats) {
      alert('Sila pilih sekurang-kurangnya satu bahagian (Senarai atau Statistik).');
      return;
    }
    if (filteredData.length === 0) {
      alert('Tiada data untuk dijana.');
      return;
    }
    setGenerating(true);
    try {
      const options = { title, year, badge, school, daerah, negeri };
      let doc;
      let typeLabel = '';
      if (includeList && includeStats) {
        doc = generateCombinedReport(filteredData, options);
        typeLabel = 'Penuh';
      } else if (includeList) {
        doc = generateParticipantReport(filteredData, options);
        typeLabel = 'Senarai';
      } else {
        doc = generateSummaryReport(filteredData, options);
        typeLabel = 'Ringkasan';
      }
      const safeBadge = badge ? String(badge).replace(/\s/g, '_') : '';
      const scopeLabel = allSchools || selectedSchools.size === 0
        ? 'Semua'
        : selectedSchools.size === 1
          ? Array.from(selectedSchools)[0].split('||')[1] || 'Sekolah'
          : `${selectedSchools.size}_Sekolah`;
      const filename = `Laporan_${typeLabel}_${year}${safeBadge ? '_' + safeBadge : ''}_${scopeLabel}.pdf`;

      if (action === 'download') downloadPDF(doc, filename);
      else previewPDF(doc);
      setIsOpen(false);
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
        onClick={() => setIsOpen(true)}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => !generating && setIsOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-base flex items-center gap-2">
                <FileText size={18} className="text-red-600" /> Jana Laporan PDF
              </h3>
              <button onClick={() => setIsOpen(false)} disabled={generating} className="p-1 hover:bg-gray-100 rounded">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {/* Section 1: Bahagian Laporan */}
              <div>
                <p className="text-xs font-bold text-gray-700 uppercase mb-2">1. Bahagian Laporan</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition ${includeList ? 'bg-blue-50 border-blue-400' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="checkbox" checked={includeList} onChange={e => setIncludeList(e.target.checked)} className="rounded" />
                    <div>
                      <div className="text-sm font-bold">Senarai Peserta</div>
                      <div className="text-[10px] text-gray-500">Senarai penuh disusun ikut sekolah</div>
                    </div>
                  </label>
                  <label className={`flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition ${includeStats ? 'bg-purple-50 border-purple-400' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="checkbox" checked={includeStats} onChange={e => setIncludeStats(e.target.checked)} className="rounded" />
                    <div>
                      <div className="text-sm font-bold">Statistik & Analisis</div>
                      <div className="text-[10px] text-gray-500">Pecahan jantina, kategori, lencana, sekolah</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Section 2: Pilih Sekolah */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-gray-700 uppercase">2. Pilih Sekolah ({schoolList.length})</p>
                  <button
                    onClick={toggleAllSchools}
                    className={`text-xs font-bold px-2 py-1 rounded ${allSchools ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {allSchools ? <span className="flex items-center gap-1"><Check size={12} /> Semua Sekolah</span> : 'Pilih Semua'}
                  </button>
                </div>
                <div className="border rounded-lg max-h-56 overflow-y-auto bg-gray-50">
                  {schoolList.map(s => {
                    const isSelected = allSchools || selectedSchools.has(s.key);
                    return (
                      <label key={s.key} className={`flex items-center gap-2 px-3 py-2 border-b last:border-0 cursor-pointer hover:bg-white transition ${isSelected ? 'bg-blue-50' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSchool(s.key)}
                          className="rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate">{s.name}</div>
                          {s.code && <div className="text-[10px] text-gray-500 font-mono">{s.code}</div>}
                        </div>
                        <span className="text-[10px] font-bold bg-gray-200 px-2 py-0.5 rounded">{s.count}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                <strong>Ringkasan:</strong>
                <div className="mt-1 text-gray-700">
                  {filteredData.length} rekod dari {allSchools ? schoolList.length : (selectedSchools.size || schoolList.length)} sekolah
                  {includeList && includeStats ? ' · Senarai + Statistik' : includeList ? ' · Senarai sahaja' : includeStats ? ' · Statistik sahaja' : ' · TIADA bahagian dipilih'}
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
              <button onClick={() => setIsOpen(false)} disabled={generating} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Batal</button>
              <button
                onClick={() => handleExport('preview')}
                disabled={generating || (!includeList && !includeStats)}
                className="px-3 py-2 text-sm bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 flex items-center gap-1 font-bold disabled:opacity-50"
              >
                <Eye size={14} /> Pratonton
              </button>
              <button
                onClick={() => handleExport('download')}
                disabled={generating || (!includeList && !includeStats)}
                className="px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-1 font-bold disabled:opacity-50"
              >
                <Download size={14} /> {generating ? 'Menjana...' : 'Muat Turun'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
