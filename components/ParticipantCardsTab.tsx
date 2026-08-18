import React, { useMemo, useState } from 'react';
import { QrCode } from 'lucide-react';
import { SubmissionData, School } from '../types';
import { LOGO_URL } from '../constants';
import { ParticipantQRGenerator } from './ui/QRVerification';
import { deduplicateRecords } from '../utils/dataProcessing';

interface ParticipantCardsTabProps {
  data: SubmissionData[];
  schools: School[];
  year?: number;
  logoUrl?: string;
  issuerLabel?: string;
  scopeLabel?: string;
}

export const ParticipantCardsTab: React.FC<ParticipantCardsTabProps> = ({
  data,
  schools,
  year = new Date().getFullYear(),
  logoUrl = LOGO_URL,
  issuerLabel = 'PENGAKAP MALAYSIA',
  scopeLabel = 'Admin',
}) => {
  const approvedData = useMemo(() => {
    return deduplicateRecords(data, schools, false);
  }, [data, schools]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    approvedData.forEach(item => {
      const value = new Date(item.date);
      if (!Number.isNaN(value.getTime())) years.add(value.getFullYear());
    });
    years.add(year);
    return Array.from(years).sort((a, b) => b - a);
  }, [approvedData, year]);
  const [selectedYear, setSelectedYear] = useState(year);

  return (
    <div className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 print:hidden">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <QrCode size={20} className="text-amber-600" /> Pengurusan Kad Peserta
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {scopeLabel}. Data disahkan sahaja. Urus paparan kad, jana QR kekal, cetak ikut filter, muat turun PDF pukal dan relink QR lama.
            </p>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
            Tahun
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="bg-white border border-amber-200 rounded px-2 py-1 text-xs font-bold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-300"
            >
              {availableYears.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
      </div>

      <ParticipantQRGenerator
        data={approvedData}
        year={selectedYear}
        logoUrl={logoUrl}
        issuerLabel={issuerLabel}
        mode="panel"
        title="Kad Peserta"
      />
    </div>
  );
};
