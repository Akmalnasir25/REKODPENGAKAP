import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Download, Eye, X, AlertCircle } from 'lucide-react';
import { SubmissionData } from '../../types';
import { downloadPDF, previewPDF } from '../../services/pdfService';
import {
  generateProgramReport,
  buildProgramReportRows,
  sumProgramReportRows,
  programReportFilename,
  MOD_PELAKSANAAN,
  PERINGKAT_PENYERTAAN,
  ProgramReportHeader,
} from '../../services/programReportPdf';

interface ProgramReportButtonProps {
  data: SubmissionData[];
  year: number;
  /** Program terpilih dalam tapisan — jadi nilai lalai bagi perkara 1.0. */
  badge?: string;
  className?: string;
}

// Enam perkara pertama tidak wujud dalam pangkalan data, jadi ia disimpan
// dalam pelayar. Admin menjana laporan yang sama berulang kali sepanjang
// tahun dan tidak sepatutnya menaip semula setiap kali.
const STORAGE_KEY = 'laporanProgram.header';

const DEFAULT_HEADER: ProgramReportHeader = {
  namaProgram: '',
  anjuran: 'Persekutuan Pengakap Malaysia',
  tarikh: '',
  tempat: '',
  mod: 'Bersemuka',
  peringkat: 'Peringkat Daerah',
};

const loadHeader = (): ProgramReportHeader => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_HEADER };
    return { ...DEFAULT_HEADER, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_HEADER };
  }
};

const saveHeader = (header: ProgramReportHeader) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(header));
  } catch {
    // Mod peribadi / storan disekat — laporan tetap boleh dijana.
  }
};

export const ProgramReportButton: React.FC<ProgramReportButtonProps> = ({
  data,
  year,
  badge,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [header, setHeader] = useState<ProgramReportHeader>(DEFAULT_HEADER);

  // Nama program mengikut tapisan semasa supaya laporan dan data sentiasa
  // merujuk program yang sama; medan lain dikekalkan daripada kali terakhir.
  useEffect(() => {
    if (!isOpen) return;
    const saved = loadHeader();
    setHeader({ ...saved, namaProgram: badge || saved.namaProgram });
  }, [isOpen, badge]);

  const set = (key: keyof ProgramReportHeader) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => setHeader(prev => ({ ...prev, [key]: e.target.value }));

  const preview = useMemo(() => {
    const rows = buildProgramReportRows(data);
    return { rows: rows.length, total: sumProgramReportRows(rows) };
  }, [data]);

  const handleExport = (action: 'download' | 'preview') => {
    if (data.length === 0) {
      alert('Tiada data untuk dijana.');
      return;
    }
    if (!header.namaProgram.trim()) {
      alert('Sila isi Nama Program (perkara 1.0).');
      return;
    }
    setGenerating(true);
    try {
      saveHeader(header);
      const doc = generateProgramReport(data, header);
      if (action === 'download') downloadPDF(doc, programReportFilename(header.namaProgram, year));
      else previewPDF(doc);
      setIsOpen(false);
    } catch (error) {
      console.error('Program report generation failed:', error);
      alert('Gagal menjana Laporan Program. Sila cuba lagi.');
    } finally {
      setGenerating(false);
    }
  };

  const field = (
    no: string,
    label: string,
    key: keyof ProgramReportHeader,
    placeholder: string,
  ) => (
    <div>
      <label className="text-[10px] font-bold text-gray-500 uppercase">{no} {label}</label>
      <input
        type="text"
        value={header[key]}
        onChange={set(key)}
        placeholder={placeholder}
        className="w-full mt-1 p-2 border rounded-lg text-sm focus:border-blue-400 focus:outline-none"
      />
    </div>
  );

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        onClick={() => setIsOpen(true)}
        disabled={generating || data.length === 0}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition shadow-sm border
          ${data.length === 0
            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
            : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
          }`}
      >
        <ClipboardList size={14} />
        {generating ? 'Menjana...' : 'Laporan Program'}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => !generating && setIsOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-base flex items-center gap-2">
                <ClipboardList size={18} className="text-indigo-600" /> Laporan Program {year}
              </h3>
              <button onClick={() => setIsOpen(false)} disabled={generating} className="p-1 hover:bg-gray-100 rounded">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {!badge && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs flex gap-2 text-amber-800">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>
                    Tiada program dipilih dalam tapisan — jadual di bawah akan mencampurkan
                    semua program {year}. Pilih satu program dahulu untuk laporan setiap program.
                  </span>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-3">
                {field('1.0', 'Nama Program', 'namaProgram', 'Contoh: Keris Emas')}
                {field('2.0', 'Anjuran', 'anjuran', 'Contoh: Persekutuan Pengakap Malaysia')}
                {field('3.0', 'Tarikh Pelaksanaan', 'tarikh', 'Contoh: 12 - 14 Julai 2026')}
                {field('4.0', 'Tempat Pelaksanaan', 'tempat', 'Contoh: SK Rapat Jaya')}

                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">5.0 Mod Pelaksanaan</label>
                  <select
                    value={header.mod}
                    onChange={set('mod')}
                    className="w-full mt-1 p-2 border rounded-lg text-sm focus:border-blue-400 focus:outline-none"
                  >
                    {MOD_PELAKSANAAN.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">6.0 Peringkat Penyertaan</label>
                  <select
                    value={header.peringkat}
                    onChange={set('peringkat')}
                    className="w-full mt-1 p-2 border rounded-lg text-sm focus:border-blue-400 focus:outline-none"
                  >
                    {PERINGKAT_PENYERTAAN.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div className="bg-slate-50 border rounded-lg p-3 text-xs">
                <strong className="text-gray-700">7.0 Butiran Penyertaan</strong>
                <span className="text-gray-500"> — dikira automatik daripada tapisan semasa</span>
                <div className="mt-2 text-gray-700">
                  {preview.rows} sekolah · {preview.total.jumlah} orang
                  {' '}(L: {preview.total.lelaki} · P: {preview.total.perempuan})
                </div>
                <div className="mt-1 text-gray-500">
                  Melayu: {preview.total.melayu} · Cina: {preview.total.cina} ·
                  {' '}India: {preview.total.india} · Lain-Lain: {preview.total.lain}
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
              <button
                onClick={() => setIsOpen(false)}
                disabled={generating}
                className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Batal
              </button>
              <button
                onClick={() => handleExport('preview')}
                disabled={generating}
                className="px-3 py-2 text-sm bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 flex items-center gap-1 font-bold disabled:opacity-50"
              >
                <Eye size={14} /> Pratonton
              </button>
              <button
                onClick={() => handleExport('download')}
                disabled={generating}
                className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-1 font-bold disabled:opacity-50"
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
