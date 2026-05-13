import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, CheckCircle, Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { Badge } from '../types';
import { bulkSubmitRegistration } from '../services/supabaseApi';
import { LoadingSpinner } from './ui/LoadingSpinner';

type BulkRole = 'PESERTA' | 'PEMIMPIN' | 'PENOLONG PEMIMPIN' | 'PENGUJI' | 'PENERIMA RAMBU';

type ParsedRecord = {
  rowNumber: number;
  student: string;
  icNumber: string;
  membershipId: string;
  gender: string;
  race: string;
  phoneNumber: string;
  role: BulkRole;
  category: string;
  remarks: string;
  errors: string[];
  warnings: string[];
};

interface BulkImportModalProps {
  scriptUrl: string;
  schoolName: string;
  schoolCode: string;
  badges: Badge[];
  currentYear: number;
  existingData: Array<{ student: string; icNumber?: string; id?: string; badge: string; date: string; schoolCode?: string }>;
  onClose: () => void;
  onSuccess: () => void;
}

const requiredHeaders = ['Nama', 'No KP', 'No Keahlian / ID', 'Jantina', 'Kaum', 'No Telefon', 'Peranan', 'Kategori', 'Catatan'];
const categoryOptions = ['Perdana', 'Udara', 'Laut', 'PPKI', 'PPKI Udara'];
const roleOptions: BulkRole[] = ['PESERTA', 'PEMIMPIN', 'PENOLONG PEMIMPIN', 'PENGUJI', 'PENERIMA RAMBU'];
const raceOptions = ['MELAYU', 'CINA', 'INDIA', 'BUMIPUTERA SABAH', 'BUMIPUTERA SARAWAK', 'ORANG ASLI', 'LAIN-LAIN'];
const normalize = (value: any) => String(value || '').trim();
const compact = (value: any) => normalize(value).replace(/\s+/g, ' ');
const normalizeIc = (value: any) => normalize(value).replace(/\s+/g, '');
const normalizeGender = (value: any) => {
  const raw = normalize(value).toUpperCase();
  if (['L', 'LELAKI', 'MALE'].includes(raw)) return 'Lelaki';
  if (['P', 'PEREMPUAN', 'FEMALE'].includes(raw)) return 'Perempuan';
  return normalize(value);
};
const normalizeRole = (value: any, fallback: BulkRole): BulkRole | string => {
  const raw = normalize(value).toUpperCase();
  if (!raw) return fallback;
  if (['PESERTA', 'MURID', 'AHLI'].includes(raw)) return 'PESERTA';
  if (['PEMIMPIN', 'LEADER'].includes(raw)) return 'PEMIMPIN';
  if (['PENOLONG PEMIMPIN', 'PENOLONG', 'ASSISTANT', 'ASSISTANT LEADER'].includes(raw)) return 'PENOLONG PEMIMPIN';
  if (['PENGUJI', 'EXAMINER'].includes(raw)) return 'PENGUJI';
  if (['PENERIMA RAMBU', 'RAMBU'].includes(raw)) return 'PENERIMA RAMBU';
  return normalize(value);
};
const isValidIc = (value: string) => /^\d{6}-?\d{2}-?\d{4}$/.test(value);
const formatIc = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 12) return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
  return value;
};
const genderFromIc = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 1) return '';
  const lastDigit = Number(digits[digits.length - 1]);
  if (Number.isNaN(lastDigit)) return '';
  return lastDigit % 2 === 1 ? 'Lelaki' : 'Perempuan';
};

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  scriptUrl,
  schoolName,
  schoolCode,
  badges,
  currentYear,
  existingData,
  onClose,
  onSuccess
}) => {
  const [selectedBadge, setSelectedBadge] = useState('');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedRole, setSelectedRole] = useState<BulkRole>('PESERTA');
  const [records, setRecords] = useState<ParsedRecord[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const openBadges = useMemo(() => badges.filter(b => b.isOpen), [badges]);
  const validCount = records.filter(r => r.errors.length === 0).length;
  const errorCount = records.reduce((sum, r) => sum + r.errors.length, 0);
  const warningCount = records.reduce((sum, r) => sum + r.warnings.length, 0);
  const canSubmit = selectedBadge && records.length > 0 && errorCount === 0 && confirmed && !isSubmitting;

  const downloadTemplate = () => {
    const maxRows = 300;
    const rows: any[][] = [requiredHeaders];
    for (let row = 2; row <= maxRows; row++) {
      rows.push([
        row === 2 ? 'ALI BIN ABU' : '',
        row === 2 ? '120101-08-1234' : '',
        row === 2 ? 'AT1234-26' : '',
        '',
        row === 2 ? 'MELAYU' : '',
        row === 2 ? '0123456789' : '',
        row === 2 ? 'PESERTA' : '',
        row === 2 ? 'Perdana' : '',
        ''
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 35 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 20 }, { wch: 15 }, { wch: 22 }, { wch: 16 }, { wch: 30 }];

    for (let row = 2; row <= maxRows; row++) {
      const genderCell = `D${row}`;
      ws[genderCell] = {
        t: 's',
        f: `IF(B${row}="","",IF(ISODD(VALUE(RIGHT(SUBSTITUTE(B${row},"-",""),1))),"Lelaki","Perempuan"))`,
        v: row === 2 ? 'Lelaki' : ''
      } as any;
    }

    (ws as any)['!dataValidation'] = [
      {
        sqref: `E2:E${maxRows}`,
        type: 'list',
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: 'Kaum tidak sah',
        error: 'Sila pilih kaum daripada dropdown sahaja.',
        formulas: [`"${raceOptions.join(',')}"`]
      },
      {
        sqref: `G2:G${maxRows}`,
        type: 'list',
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: 'Peranan tidak sah',
        error: 'Sila pilih peranan daripada dropdown sahaja.',
        formulas: [`"${roleOptions.join(',')}"`]
      },
      {
        sqref: `H2:H${maxRows}`,
        type: 'list',
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: 'Kategori tidak sah',
        error: 'Sila pilih kategori daripada dropdown sahaja.',
        formulas: [`"${categoryOptions.join(',')}"`]
      }
    ];

    (ws as any)['!protect'] = {
      password: 'PPM',
      selectLockedCells: false,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertColumns: false,
      insertRows: false,
      deleteColumns: false,
      deleteRows: false
    };

    const instructions = XLSX.utils.aoa_to_sheet([
      ['Panduan Import Pukal'],
      ['1. Isi data hanya di sheet IMPORT.'],
      ['2. Jantina dijana automatik berdasarkan digit terakhir No KP: ganjil = Lelaki, genap = Perempuan.'],
      ['3. Kolum Jantina dikunci supaya formula tidak terpadam.'],
      ['4. Kolum Kaum, Peranan dan Kategori disediakan sebagai dropdown untuk seragamkan data.'],
      ['5. Jangan ubah nama header di row pertama.']
    ]);
    instructions['!cols'] = [{ wch: 90 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'IMPORT');
    XLSX.utils.book_append_sheet(wb, instructions, 'PANDUAN');
    XLSX.writeFile(wb, `Template_Import_Pukal_${schoolCode}.xlsx`, { bookType: 'xlsx', cellStyles: true });
  };

  const parseFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: '' });
    const seenIc = new Set<string>();
    const seenId = new Set<string>();

    const parsed = rows.map((row, index) => {
      const studentRaw = normalize(row['Nama']);
      const student = compact(studentRaw).toUpperCase();
      const icNumber = formatIc(normalizeIc(row['No KP']));
      const membershipId = compact(row['No Keahlian / ID']).toUpperCase();
      const gender = normalizeGender(row['Jantina']) || genderFromIc(icNumber);
      const race = compact(row['Kaum'] || row['Bangsa']).toUpperCase();
      const phoneNumber = compact(row['No Telefon']);
      const role = normalizeRole(row['Peranan'], selectedRole);
      const category = compact(row['Kategori']) || 'Perdana';
      const remarks = compact(row['Catatan']);
      const errors: string[] = [];
      const warnings: string[] = [];

      if (!student) errors.push('Nama wajib diisi.');
      if (studentRaw.includes('\n') || studentRaw.includes('\r')) errors.push('Nama mengandungi baris berganda. Satu peserta mesti satu row.');
      if ((student.match(/\b(BIN|BINTI|A\/L|A\/P)\b/g) || []).length >= 3) warnings.push('Nama mungkin mengandungi lebih daripada seorang peserta.');
      if (!icNumber) errors.push('No KP wajib diisi.');
      else if (!isValidIc(icNumber)) errors.push('Format No KP tidak sah.');
      if (!membershipId) errors.push('No Keahlian / ID wajib diisi.');
      if (!gender) errors.push('Jantina wajib diisi.');
      else if (!['Lelaki', 'Perempuan'].includes(gender)) errors.push('Jantina mesti Lelaki atau Perempuan.');
      if (!race) errors.push('Bangsa wajib diisi.');
      if (!categoryOptions.includes(category)) errors.push('Kategori mesti Perdana, Udara, Laut, PPKI atau PPKI Udara.');
      if (!roleOptions.includes(role as BulkRole)) errors.push('Peranan tidak sah.');

      const icKey = `${icNumber}_${selectedBadge}_${selectedYear}`;
      const idKey = membershipId;
      if (icNumber && seenIc.has(icKey)) errors.push('No KP duplicate dalam fail import untuk program/tahun ini.');
      if (membershipId && seenId.has(idKey)) errors.push('No Keahlian / ID duplicate dalam fail import.');
      seenIc.add(icKey);
      seenId.add(idKey);

      const existsSameProgram = existingData.some(d =>
        String(d.schoolCode || '').toUpperCase() === schoolCode.toUpperCase() &&
        String(d.badge || '') === selectedBadge &&
        new Date(d.date).getFullYear() === selectedYear &&
        String(d.icNumber || '').replace(/\s+/g, '') === icNumber
      );
      if (existsSameProgram) errors.push('No KP sudah wujud untuk program/tahun ini.');

      const existsId = existingData.some(d => String(d.id || '').toUpperCase() === membershipId && membershipId);
      if (existsId) warnings.push('No Keahlian / ID sudah wujud dalam data sistem. Sila semak.');

      return { rowNumber: index + 2, student, icNumber, membershipId, gender, race, phoneNumber, role: role as BulkRole, category, remarks, errors, warnings };
    });

    setRecords(parsed);
    setConfirmed(false);
  };

  const submitBulk = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const result = await bulkSubmitRegistration(scriptUrl, {
        schoolName,
        schoolCode,
        badgeType: selectedBadge,
        year: selectedYear,
        role: selectedRole,
        records: records.map(r => ({
          student: r.student,
          icNumber: r.icNumber,
          membershipId: r.membershipId,
          gender: r.gender,
          race: r.race,
          phoneNumber: r.phoneNumber,
          role: r.role,
          category: r.category,
          remarks: r.remarks
        }))
      });

      if (result.status === 'success') {
        alert(`Import berjaya. ${records.length} rekod dimasukkan.`);
        onSuccess();
        onClose();
      } else {
        alert('Import gagal: ' + (result.message || 'Ralat tidak diketahui'));
      }
    } catch (error) {
      alert('Import gagal. Sila cuba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b flex justify-between items-center">
          <div>
            <h3 className="font-black text-lg text-gray-800 flex items-center gap-2"><Upload className="text-indigo-600" /> Import Pukal Berstruktur</h3>
            <p className="text-xs text-gray-500">Nama, No KP, No Keahlian/ID, Jantina dan Kaum adalah wajib.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded"><X size={20} /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <select value={selectedBadge} onChange={e => { setSelectedBadge(e.target.value); setRecords([]); }} className="p-3 border rounded-lg text-sm">
              <option value="">Pilih Program / Lencana</option>
              {openBadges.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
            </select>
            <input type="number" value={selectedYear} onChange={e => { setSelectedYear(Number(e.target.value)); setRecords([]); }} className="p-3 border rounded-lg text-sm" />
            <select value={selectedRole} onChange={e => setSelectedRole(e.target.value as BulkRole)} className="p-3 border rounded-lg text-sm">
              <option value="PESERTA">Peserta</option>
              <option value="PENERIMA RAMBU">Penerima Rambu</option>
              <option value="PEMIMPIN">Pemimpin</option>
              <option value="PENOLONG PEMIMPIN">Penolong Pemimpin</option>
              <option value="PENGUJI">Penguji</option>
            </select>
            <button onClick={downloadTemplate} className="bg-green-600 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2"><Download size={16} /> Template Excel</button>
          </div>

          <label className={`border-2 border-dashed rounded-xl p-6 text-center block ${selectedBadge ? 'cursor-pointer hover:bg-indigo-50 border-indigo-200' : 'opacity-50 border-gray-200'}`}>
            <FileSpreadsheet className="mx-auto mb-2 text-indigo-600" />
            <div className="font-bold text-sm">Upload Excel Template</div>
            <div className="text-xs text-gray-500">Gunakan template rasmi sahaja untuk elak column lari.</div>
            <input type="file" accept=".xlsx,.xls" className="hidden" disabled={!selectedBadge} onChange={e => e.target.files?.[0] && parseFile(e.target.files[0])} />
          </label>

          {records.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-green-50 text-green-800 rounded-lg font-bold"><CheckCircle className="inline mr-1" size={16} /> OK: {validCount}</div>
                <div className="p-3 bg-red-50 text-red-800 rounded-lg font-bold"><AlertTriangle className="inline mr-1" size={16} /> Ralat: {errorCount}</div>
                <div className="p-3 bg-amber-50 text-amber-800 rounded-lg font-bold">Amaran: {warningCount}</div>
              </div>

              <div className="overflow-x-auto border rounded-lg max-h-[360px]">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 sticky top-0"><tr><th className="p-2">Row</th><th className="p-2">Nama</th><th className="p-2">KP</th><th className="p-2">ID</th><th className="p-2">Jantina</th><th className="p-2">Kaum</th><th className="p-2">Peranan</th><th className="p-2">Kategori</th><th className="p-2">Status</th></tr></thead>
                  <tbody>
                    {records.map(r => <tr key={r.rowNumber} className="border-t"><td className="p-2">{r.rowNumber}</td><td className="p-2 font-bold">{r.student}</td><td className="p-2 font-mono">{r.icNumber}</td><td className="p-2 font-mono">{r.membershipId}</td><td className="p-2">{r.gender}</td><td className="p-2">{r.race}</td><td className="p-2">{r.role}</td><td className="p-2">{r.category}</td><td className="p-2">{r.errors.length ? <span className="text-red-700 font-bold">{r.errors.join(' ')}</span> : r.warnings.length ? <span className="text-amber-700 font-bold">{r.warnings.join(' ')}</span> : <span className="text-green-700 font-bold">OK</span>}</td></tr>)}
                  </tbody>
                </table>
              </div>

              <label className="flex items-start gap-2 text-xs font-semibold text-gray-700">
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5" />
                Saya mengesahkan setiap peserta/pemimpin adalah satu row berasingan dan semua data wajib adalah tepat.
              </label>
            </>
          )}
        </div>

        <div className="p-5 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-bold text-sm">Batal</button>
          <button onClick={submitBulk} disabled={!canSubmit} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-indigo-700 shadow flex items-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed">
            {isSubmitting ? <LoadingSpinner size="sm" color="border-white" /> : <CheckCircle size={16} />} Sahkan Import ({records.length})
          </button>
        </div>
      </div>
    </div>
  );
};
