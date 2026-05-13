
import React, { useState, useEffect } from 'react';
import { ArrowRight, AlertTriangle, CheckCircle, RefreshCw, Copy, Calendar, Plus, FileSpreadsheet, Upload, Save, FileUp, X, Columns, Settings2 } from 'lucide-react';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { migrateYear, submitRegistration } from '../services/api';
import { fetchServerCsrf } from '../services/security';
import { LeaderInfo, Participant } from '../types';

interface AdminMigrationProps {
  scriptUrl: string;
  onRefresh: () => void;
}

interface ParsedRow {
    // System Mapped Fields
    schoolName: string;
    schoolCode: string;
    groupNumber: string;
    name: string;
    gender: string;
    race: string;
    icNumber: string;
    phone: string;
    category: string; // Normalized
    membershipId: string;
    
    // Display Fields
    originalRow: any[];
    sourceFile: string;
}

// Helper: Normalize Role strings
const normalizeRole = (raw: any): string => {
    const r = String(raw || '').trim().toUpperCase();
    
    if (r === 'PKK') return 'PESERTA';
    if (r === 'PEN. PEMIMPIN' || r === 'PEN PEMIMPIN' || r === 'PEN.PEMIMPIN' || r === 'PENOLONG') return 'PENOLONG PEMIMPIN';
    
    if (r.includes('PENGUJI')) return 'PENGUJI';
    if (r.includes('PEMIMPIN') && !r.includes('PENOLONG')) return 'PEMIMPIN';
    
    return 'PESERTA'; // Default
};

export const AdminMigration: React.FC<AdminMigrationProps> = ({ scriptUrl, onRefresh }) => {
  const currentYear = new Date().getFullYear();
  
  // Migration State
  const [sourceYear, setSourceYear] = useState(currentYear);
  const [targetYear, setTargetYear] = useState(currentYear + 1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{status: string, message: string} | null>(null);

  // New Session State
  const [newSessionYear, setNewSessionYear] = useState(currentYear + 1);
  const [openingSession, setOpeningSession] = useState(false);

  // --- BULK IMPORT STATE ---
  const [importText, setImportText] = useState('');
  const [importYear, setImportYear] = useState(currentYear);
  const [importBadge, setImportBadge] = useState<string>('Keris Gangsa');
  
  const [rawSheetData, setRawSheetData] = useState<any[][]>([]);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  
  // Column Mapping State
  const [colMap, setColMap] = useState({
      name: -1,
      ic: -1,
      category: -1,
      gender: -1,
      race: -1,
      phone: -1,
      membershipId: -1,
      school: -1,
      code: -1
  });
  
  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState<string[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);

  // --- EFFECT: Re-process data when Mapping or Raw Data changes ---
  useEffect(() => {
      if (rawSheetData.length === 0) {
          setParsedData([]);
          return;
      }

      const newParsedRows: ParsedRow[] = rawSheetData.map(row => {
          // Normalize Data based on CURRENT MAPPING
          const nameVal = colMap.name > -1 && row[colMap.name] ? String(row[colMap.name]).toUpperCase().trim() : '';
          
          // Skip header-like rows inside data
          if (nameVal === 'NAMA' || nameVal === 'NAME') return null;

          // Skip completely empty rows
          const hasData = row.some((c: any) => c !== undefined && c !== null && String(c).trim() !== '');
          if (!hasData) return null;

          const rawCategory = colMap.category > -1 && row[colMap.category] ? String(row[colMap.category]) : '';
          
          return {
              name: nameVal || '[TIADA NAMA]',
              icNumber: colMap.ic > -1 && row[colMap.ic] ? String(row[colMap.ic]).trim() : '',
              category: normalizeRole(rawCategory),
              schoolName: colMap.school > -1 && row[colMap.school] ? String(row[colMap.school]).toUpperCase().trim() : 'TIDAK DINYATAKAN',
              schoolCode: colMap.code > -1 && row[colMap.code] ? String(row[colMap.code]).toUpperCase().trim() : 'XXX',
              phone: colMap.phone > -1 && row[colMap.phone] ? String(row[colMap.phone]) : '',
              gender: colMap.gender > -1 && row[colMap.gender] ? String(row[colMap.gender]) : 'Lelaki',
              race: colMap.race > -1 && row[colMap.race] ? String(row[colMap.race]) : 'Lain-lain',
              membershipId: colMap.membershipId > -1 && row[colMap.membershipId] ? String(row[colMap.membershipId]) : '',
              groupNumber: '',
              originalRow: row,
              sourceFile: 'Excel'
          };
      }).filter(r => r !== null) as ParsedRow[];

      setParsedData(newParsedRows);

  }, [rawSheetData, colMap]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const XLSX = (window as any).XLSX;
      if (!XLSX) {
          alert("Sila tunggu perpustakaan Excel dimuatkan.");
          return;
      }

      setIsProcessingFiles(true);
      setImportLog([]);

      try {
          const file = files[0]; // Process first file only for simplicity in mapping
          const data = await file.arrayBuffer();
          const workbook = XLSX.read(data);
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

          if (jsonData.length === 0) {
              alert("Fail kosong.");
              setIsProcessingFiles(false);
              return;
          }

          // 1. Detect Header Row (Best Effort)
          let headerRowIndex = -1;
          for(let r = 0; r < Math.min(jsonData.length, 20); r++) {
              const rowStr = jsonData[r].map(c => String(c).toUpperCase()).join(' ');
              if ((rowStr.includes("NAMA") || rowStr.includes("NAME")) && (rowStr.includes("KP") || rowStr.includes("IC") || rowStr.includes("NO") || rowStr.includes("SEKOLAH"))) {
                  headerRowIndex = r;
                  break;
              }
          }

          // Fallback if no header found, assume row 0 is data if it has numbers
          if (headerRowIndex === -1 && jsonData[0].some(c => /\d/.test(String(c)))) {
              headerRowIndex = -1; 
          }

          const headers = headerRowIndex > -1 ? jsonData[headerRowIndex] : [];
          const startRow = headerRowIndex + 1;
          const dataRows = jsonData.slice(startRow);

          // 2. Generate Options for UI Dropdowns
          let uiHeaders: string[] = [];
          if (headers.length > 0) {
              uiHeaders = headers.map((h: any, idx: number) => h ? `${idx+1}. ${String(h).toUpperCase().substring(0, 20)}` : `Lajur ${idx+1}`);
          } else {
              // Get max cols from first 5 rows
              let maxCols = 0;
              dataRows.slice(0, 5).forEach(row => { if(row.length > maxCols) maxCols = row.length; });
              uiHeaders = Array.from({length: maxCols}, (_, k) => `Lajur ${k+1}`);
          }
          setExcelHeaders(uiHeaders);

          // 3. Auto-Detect Mappings
          const findIdx = (keywords: string[]) => {
              if (headers.length === 0) return -1;
              return headers.findIndex(h => {
                  if (!h) return false;
                  const s = String(h).toUpperCase();
                  return keywords.some(k => s.includes(k));
              });
          };

          const newMap = {
              name: findIdx(["NAMA", "NAME", "STUDENT", "PESERTA"]),
              ic: findIdx(["NO. KP", "NO.KP", "KAD PENGENALAN", "IC", "KP"]),
              category: findIdx(["KATEGORI", "JAWATAN", "PERANAN", "ROLE"]),
              school: findIdx(["SEKOLAH", "SCHOOL"]),
              code: findIdx(["KOD", "CODE"]),
              phone: findIdx(["TEL", "PHONE", "HP"]),
              gender: findIdx(["JANTINA", "SEX", "GENDER"]),
              race: findIdx(["KAUM", "BANGSA", "RACE"]),
              membershipId: findIdx(["NO. KEAHLIAN", "ID KEAHLIAN", "MEMBERSHIP", "NO. AHLI"])
          };

          // Fallbacks if detection failed but we have enough columns
          if (newMap.name === -1 && uiHeaders.length > 1) newMap.name = 1; // Assume Col B
          if (newMap.ic === -1 && uiHeaders.length > 2) newMap.ic = 2; // Assume Col C
          if (newMap.category === -1 && uiHeaders.length > 6) newMap.category = 6; 

          setColMap(newMap);
          setRawSheetData(dataRows);
          
          alert(`Fail dibaca. Sila semak 'Padanan Lajur' dan jadual di bawah.`);

      } catch (err) {
          console.error(err);
          alert("Ralat memproses fail.");
      } finally {
          setIsProcessingFiles(false);
          e.target.value = '';
      }
  };

  const executeImport = async () => {
      if (parsedData.length === 0) return;
      if (!confirm(`Anda akan mengimport ${parsedData.length} rekod.\n\nPastikan data dalam lajur 'SISTEM' (Warna Biru) adalah betul.\n\nTeruskan?`)) return;

      setImporting(true);
      setImportLog([]);
      
      const schoolsMap: Record<string, ParsedRow[]> = {};
      parsedData.forEach(row => {
          const sName = row.schoolName === 'TIDAK DINYATAKAN' ? 'DATA_IMPORT_MANUAL' : row.schoolName;
          const key = sName + '|' + row.schoolCode;
          if (!schoolsMap[key]) schoolsMap[key] = [];
          schoolsMap[key].push(row);
      });

      const customDate = `${importYear}-01-01`;

      for (const key of Object.keys(schoolsMap)) {
          const rows = schoolsMap[key];
          const first = rows[0];
          const actualSchoolName = first.schoolName === 'TIDAK DINYATAKAN' ? 'DATA_IMPORT_MANUAL' : first.schoolName;

          const students: Participant[] = [];
          const assistants: Participant[] = [];
          const examiners: Participant[] = [];
          
          let leaderDetails = { name: 'DATA IMPORT', phone: '', race: 'Lain-lain' };

          rows.forEach((r) => {
              if (r.name === '[TIADA NAMA]') return;

              const p: Participant = {
                  id: Date.now() + Math.random(),
                  name: r.name,
                  gender: r.gender,
                  race: r.race, // Ensure this maps correctly from ParsedRow
                  membershipId: r.membershipId,
                  icNumber: r.icNumber,
                  phoneNumber: r.phone,
                  remarks: 'IMPORT_EXCEL'
              };

              const cat = r.category;
              if (cat === 'PENGUJI') examiners.push(p);
              else if (cat === 'PENOLONG PEMIMPIN' || cat === 'PEMIMPIN') {
                  assistants.push(p);
                  if (cat === 'PEMIMPIN') leaderDetails = { name: r.name, phone: r.phone, race: r.race };
              } else {
                  students.push(p);
              }
          });

          const leaderInfo: LeaderInfo = {
              schoolName: actualSchoolName,
              schoolCode: first.schoolCode,
              groupNumber: first.groupNumber || '',
              principalName: 'DATA IMPORT',
              principalPhone: '',
              leaderName: leaderDetails.name,
              race: leaderDetails.race,
              phone: leaderDetails.phone,
              badgeType: importBadge
          };

          if (students.length === 0 && assistants.length === 0 && examiners.length === 0) continue;

          try {
              setImportLog(prev => [...prev, `⏳ Menghantar ${actualSchoolName}...`]);
              const token = await fetchServerCsrf(scriptUrl);
              await submitRegistration(scriptUrl, leaderInfo, students, assistants, examiners, customDate, token || undefined);
              setImportLog(prev => [...prev, `✅ ${actualSchoolName}: OK.`]);
          } catch (e) {
              setImportLog(prev => [...prev, `❌ ${actualSchoolName}: Gagal.`]);
          }
      }

      setImporting(false);
      alert("Proses import selesai.");
      onRefresh();
  };

  const clearImportData = () => {
      setParsedData([]);
      setRawSheetData([]);
      setImportLog([]);
      setExcelHeaders([]);
  };

  // Migration Handlers
  const handleMigration = async () => {
    if (sourceYear >= targetYear) { alert("Tahun Baru mestilah lebih besar dari Tahun Asal."); return; }
    if (!confirm(`PROSES MIGRASI DATA\n\nAnda akan menyalin data dari tahun ${sourceYear} ke tahun ${targetYear}.\n\nTeruskan?`)) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await migrateYear(scriptUrl, sourceYear, targetYear);
      setResult(response);
      if (response.status === 'success') onRefresh();
    } catch (error) {
      setResult({ status: 'error', message: 'Gagal menghubungi server.' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenYear = async () => {
      if (!newSessionYear) return;
      if (!confirm(`Buka pendaftaran tahun ${newSessionYear}?`)) return;
      setOpeningSession(true);
      try {
          const dummyDate = `${newSessionYear}-01-01`;
          const dummyLeader: LeaderInfo = { schoolName: "__SYSTEM_YEAR_MARKER__", schoolCode: "SYS", groupNumber: "00", principalName: "SYS", principalPhone: "0", leaderName: "SYS", race: "Lain", phone: "0", badgeType: "INIT" };
          const dummyPart: Participant = { id: Date.now(), name: "MARKER", gender: "L", race: "L", membershipId: "0", icNumber: "0", phoneNumber: "0", remarks: "SYS" };
          const token = await fetchServerCsrf(scriptUrl);
          await submitRegistration(scriptUrl, dummyLeader, [dummyPart], [], [], dummyDate, token || undefined);
          alert(`Sesi Tahun ${newSessionYear} berjaya dibuka!`);
          onRefresh();
      } catch (e) { alert("Gagal."); } finally { setOpeningSession(false); }
  };

  // UI Component for Column Mapper
  const ColSelect = ({ label, value, field }: { label: string, value: number, field: keyof typeof colMap }) => (
      <div className="flex flex-col">
          <label className="text-[10px] font-bold text-gray-500 uppercase mb-1">{label}</label>
          <select 
              className={`text-xs border rounded p-1.5 font-semibold ${value === -1 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-gray-800'}`}
              value={value}
              onChange={(e) => setColMap(prev => ({ ...prev, [field]: parseInt(e.target.value) }))}
          >
              <option value={-1}>-- Abai --</option>
              {excelHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}
          </select>
      </div>
  );

  return (
    <div className="space-y-8 animate-[fadeIn_0.2s_ease-out]">
      
      {/* SECTION 1: OPEN NEW YEAR */}
      <div className="bg-white p-6 rounded-xl shadow border-l-4 border-blue-500">
          <h2 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
            <Calendar size={20} className="text-blue-600"/> Pengurusan Sesi & Tahun
          </h2>
          <div className="flex items-end gap-4 bg-blue-50 p-4 rounded-lg border border-blue-100">
              <div className="flex-1">
                  <label className="block text-xs font-bold text-blue-700 mb-1">TAHUN UNTUK DIBUKA</label>
                  <input type="number" className="w-full p-2 border border-blue-200 rounded text-center font-bold text-blue-900" value={newSessionYear} onChange={(e) => setNewSessionYear(parseInt(e.target.value))}/>
              </div>
              <button onClick={handleOpenYear} disabled={openingSession} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-bold text-sm flex items-center gap-2 shadow transition disabled:bg-gray-400">
                  {openingSession ? <LoadingSpinner size="sm" color="border-white"/> : <Plus size={18}/>} Buka Tahun {newSessionYear}
              </button>
          </div>
      </div>

      {/* SECTION 2: BULK IMPORT */}
      <div className="bg-white p-6 rounded-xl shadow border-l-4 border-teal-500">
         <h2 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
            <FileSpreadsheet size={20} className="text-teal-600"/> Import Data Luar (Excel / CSV)
         </h2>
         <p className="text-sm text-gray-600 mb-4">
             Sistem akan cuba mengesan lajur secara automatik. Jika data salah (Contoh: Kaum jadi "Lain-lain"), sila ubah padanan lajur di bawah.
         </p>

         <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
             <div>
                 <label className="text-xs font-bold text-gray-500">Tahun Import</label>
                 <input type="number" className="w-full p-2 border rounded font-bold" value={importYear} onChange={e => setImportYear(parseInt(e.target.value))} />
             </div>
             <div>
                 <label className="text-xs font-bold text-gray-500">Lencana Sasaran</label>
                 <select className="w-full p-2 border rounded" value={importBadge} onChange={e => setImportBadge(e.target.value)}>
                     <option value="Keris Gangsa">Keris Gangsa</option>
                     <option value="Keris Perak">Keris Perak</option>
                     <option value="Keris Emas">Keris Emas</option>
                     <option value="Anugerah Rambu">Anugerah Rambu</option>
                 </select>
             </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-1 gap-4 mb-4">
            <div className="border-2 border-dashed border-teal-300 bg-teal-50 rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-teal-100 transition relative">
                {isProcessingFiles ? (
                    <div className="flex flex-col items-center gap-2 text-teal-700">
                        <LoadingSpinner size="md" color="border-teal-600" />
                        <span className="font-bold text-sm">Sedang membaca fail...</span>
                    </div>
                ) : (
                    <>
                        <FileUp size={32} className="text-teal-500 mb-2" />
                        <label className="cursor-pointer">
                            <span className="font-bold text-teal-700 text-sm hover:underline">Pilih Fail Excel (.xlsx)</span>
                            <input 
                                type="file" 
                                accept=".xlsx, .xls" 
                                className="hidden" 
                                onChange={handleFileUpload}
                                onClick={(e) => (e.target as any).value = null}
                            />
                        </label>
                    </>
                )}
            </div>
         </div>

         {/* COLUMN MAPPING UI - Show only if headers detected */}
         {excelHeaders.length > 0 && (
             <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 mb-4 animate-[fadeIn_0.3s_ease-out]">
                 <div className="flex items-center gap-2 mb-3 border-b border-yellow-200 pb-2">
                     <Settings2 size={16} className="text-yellow-700"/>
                     <span className="text-sm font-bold text-yellow-800">Tetapan Padanan Lajur (Ubah jika data salah)</span>
                 </div>
                 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                     <ColSelect label="Nama Peserta" value={colMap.name} field="name" />
                     <ColSelect label="No. KP (IC)" value={colMap.ic} field="ic" />
                     <ColSelect label="Kaum / Bangsa" value={colMap.race} field="race" />
                     <ColSelect label="Kategori / Jawatan" value={colMap.category} field="category" />
                     <ColSelect label="Jantina" value={colMap.gender} field="gender" />
                     <ColSelect label="No. Telefon" value={colMap.phone} field="phone" />
                     <ColSelect label="No. Keahlian / ID" value={colMap.membershipId} field="membershipId" />
                     <ColSelect label="Nama Sekolah" value={colMap.school} field="school" />
                     <ColSelect label="Kod Sekolah" value={colMap.code} field="code" />
                 </div>
             </div>
         )}

         {/* PREVIEW & ACTION BAR */}
         {parsedData.length > 0 && (
             <div className="bg-teal-50 p-4 rounded-lg border border-teal-200 mb-4 animate-[fadeIn_0.3s_ease-out]">
                 <div className="flex justify-between items-center mb-4">
                     <div>
                         <h3 className="font-bold text-teal-800 flex items-center gap-2">
                             <CheckCircle size={18}/> {parsedData.length} Rekod Dikesan
                         </h3>
                     </div>
                     <button onClick={clearImportData} className="text-red-500 text-xs font-bold hover:underline flex items-center gap-1">
                         <X size={14}/> Batalkan
                     </button>
                 </div>
                 
                 <div className="flex items-center gap-2 mb-2 text-xs text-teal-700 bg-white p-2 rounded border border-teal-100">
                    <Columns size={14} />
                    <span><strong>Panduan:</strong> Lajur BIRU ialah data yang akan masuk ke sistem. Lajur PUTIH ialah data asal Excel.</span>
                 </div>

                 {/* FULL TABLE WITH HORIZONTAL SCROLL */}
                 <div className="w-full overflow-x-auto border rounded-lg shadow-inner bg-white mb-4">
                     <table className="min-w-max text-[11px] text-left border-collapse table-auto">
                         <thead className="bg-slate-100 text-slate-700 shadow-sm sticky top-0 z-10">
                             <tr>
                                 {/* SYSTEM COLUMNS (MAPPED) */}
                                 <th className="px-3 py-2 border-b border-r border-blue-200 bg-blue-100 text-blue-900 sticky left-0 z-20 w-10 text-center">#</th>
                                 <th className="px-3 py-2 border-b border-r border-blue-200 bg-blue-100 text-blue-900 sticky left-10 z-20 min-w-[150px]">SISTEM: NAMA</th>
                                 <th className="px-3 py-2 border-b border-r border-blue-200 bg-blue-100 text-blue-900 min-w-[100px]">SISTEM: KP</th>
                                 <th className="px-3 py-2 border-b border-r border-blue-200 bg-blue-100 text-blue-900 min-w-[100px]">SISTEM: KAUM</th>
                                 <th className="px-3 py-2 border-b border-r border-blue-200 bg-blue-100 text-blue-900 min-w-[100px]">SISTEM: ID AHLI</th>
                                 <th className="px-3 py-2 border-b border-r border-blue-200 bg-blue-100 text-blue-900 min-w-[100px]">SISTEM: PERANAN</th>

                                 {/* RAW EXCEL COLUMNS */}
                                 {excelHeaders.map((h, i) => (
                                     <th key={i} className="px-3 py-2 border-b border-r border-slate-200 font-bold whitespace-nowrap bg-slate-50 text-gray-500 max-w-[150px] overflow-hidden text-ellipsis">
                                         {h}
                                     </th>
                                 ))}
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-gray-100">
                             {parsedData.slice(0, 100).map((row, rIndex) => (
                                 <tr key={rIndex} className="hover:bg-teal-50 transition">
                                     {/* SYSTEM CELLS */}
                                     <td className="px-3 py-2 border-r border-blue-100 text-center font-bold bg-blue-50 text-blue-800 sticky left-0 z-10">{rIndex + 1}</td>
                                     <td className="px-3 py-2 border-r border-blue-100 font-bold bg-blue-50 text-blue-900 sticky left-10 z-10 shadow-sm">{row.name}</td>
                                     <td className="px-3 py-2 border-r border-blue-100 bg-blue-50 text-blue-800 font-mono">{row.icNumber}</td>
                                     <td className="px-3 py-2 border-r border-blue-100 bg-blue-50 text-blue-800">{row.race}</td>
                                     <td className="px-3 py-2 border-r border-blue-100 bg-blue-50 text-blue-800 font-mono">{row.membershipId}</td>
                                     <td className="px-3 py-2 border-r border-blue-100 bg-blue-50 text-blue-800 font-bold">{row.category}</td>

                                     {/* RAW DATA CELLS */}
                                     {excelHeaders.map((_, cIndex) => (
                                         <td key={cIndex} className="px-3 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] text-gray-500">
                                             {row.originalRow[cIndex] !== undefined && row.originalRow[cIndex] !== null ? String(row.originalRow[cIndex]) : ''}
                                         </td>
                                     ))}
                                 </tr>
                             ))}
                         </tbody>
                     </table>
                 </div>

                 <button 
                    onClick={executeImport} 
                    disabled={importing} 
                    className="w-full bg-blue-900 text-white py-3 rounded-lg text-sm font-bold hover:bg-blue-800 flex justify-center items-center gap-2 shadow-lg transition active:scale-[0.99] disabled:bg-gray-400"
                >
                     {importing ? <LoadingSpinner size="sm" color="border-white"/> : <Save size={18}/>}
                     Sahkan Import ({parsedData.length} Rekod)
                 </button>
             </div>
         )}

         {/* LOG */}
         {importLog.length > 0 && (
             <div className="mt-4 bg-slate-900 text-green-400 p-4 rounded-lg font-mono text-xs max-h-60 overflow-y-auto shadow-inner">
                 <div className="font-bold text-white border-b border-gray-700 pb-2 mb-2">Log Import:</div>
                 {importLog.map((log, i) => <div key={i} className="mb-0.5">{log}</div>)}
             </div>
         )}
      </div>

      {/* SECTION 3: MIGRATION */}
      <div className="bg-white p-6 rounded-xl shadow border-l-4 border-orange-500">
        <h2 className="font-bold text-gray-800 flex items-center gap-2 mb-6">
            <RefreshCw size={20} className="text-orange-600"/> Migrasi & Kenaikan Pangkat
        </h2>
        <div className="flex flex-col md:flex-row gap-4 items-end mb-6 bg-gray-50 p-6 rounded-xl border border-gray-200">
            <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-gray-500 mb-1">DARI TAHUN (ASAL)</label>
                <input type="number" className="w-full p-3 border rounded-lg font-bold text-lg text-center" value={sourceYear} onChange={(e) => setSourceYear(parseInt(e.target.value))}/>
            </div>
            <div className="pb-4 text-gray-400"><ArrowRight size={24} /></div>
            <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-gray-500 mb-1">KE TAHUN (BARU)</label>
                <input type="number" className="w-full p-3 border rounded-lg font-bold text-lg text-center bg-white ring-2 ring-orange-100" value={targetYear} onChange={(e) => setTargetYear(parseInt(e.target.value))}/>
            </div>
        </div>
        <button onClick={handleMigration} disabled={loading} className={`w-full py-3 rounded-lg font-bold text-white shadow-lg transition flex items-center justify-center gap-2 ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700'}`}>
            {loading ? <LoadingSpinner size="sm" color="border-white" /> : <Copy size={20} />}
            {loading ? 'Sedang Memproses...' : `Salin & Naik Taraf`}
        </button>
        {result && (
            <div className={`mt-6 p-4 rounded-lg border flex items-start gap-3 ${result.status === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {result.status === 'success' ? <CheckCircle className="shrink-0 mt-0.5" /> : <AlertTriangle className="shrink-0 mt-0.5" />}
            <div><p className="font-bold">{result.status === 'success' ? 'Berjaya!' : 'Ralat'}</p><p className="text-sm">{result.message}</p></div>
            </div>
        )}
      </div>
    </div>
  );
};
