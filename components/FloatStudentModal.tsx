import React, { useState } from 'react';
import { X, AlertTriangle, Loader, UserPlus, MapPin, School as SchoolIcon } from 'lucide-react';
import { floatStudent, floatAndAssignStudent } from '../services/supabaseApi';
import { School } from '../types';

interface FloatStudentModalProps {
  studentName: string;
  personId: string;
  schoolCode: string;
  isAdmin?: boolean;
  schools?: School[];
  onClose: () => void;
  onFloated: () => void;
}

export const FloatStudentModal: React.FC<FloatStudentModalProps> = ({
  studentName, personId, schoolCode, isAdmin, schools = [], onClose, onFloated,
}) => {
  const [reason, setReason] = useState<'pindah_sekolah' | 'pindah_daerah' | 'pindah_negeri' | 'lain'>('pindah_sekolah');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Assign Terus state
  const [assignDirectly, setAssignDirectly] = useState(false);
  const [targetSchoolCode, setTargetSchoolCode] = useState('');
  const [newRole, setNewRole] = useState('PESERTA');
  const [newCategory, setNewCategory] = useState('Pengakap Kanak-Kanak');

  const handleSubmit = async () => {
    if (assignDirectly && !targetSchoolCode) {
      alert('Sila pilih sekolah tujuan untuk assign terus.');
      return;
    }

    const actionText = assignDirectly 
      ? `APUNG & ASSIGN TERUS\n\nMurid "${studentName}" akan dikeluarkan dari sekolah semasa dan terus dimasukkan ke sekolah baru (${schools.find(s => s.schoolCode === targetSchoolCode)?.name || targetSchoolCode}).`
      : `APUNGKAN MURID\n\nMurid "${studentName}" akan dikeluarkan dari senarai aktif dan masuk ke senarai terapung. Sekolah lain boleh menariknya kemudian.`;

    if (!confirm(`${actionText}\n\nTeruskan?`)) return;

    setLoading(true);
    
    if (assignDirectly && targetSchoolCode) {
      // Admin: Float and Assign directly
      const res = await floatAndAssignStudent({
        personId,
        reason,
        notes: notes.trim() || undefined,
        floatedBy: schoolCode || 'admin',
        targetSchoolCode,
        newRole,
        newCategory,
      });
      setLoading(false);
      if (res.status === 'success') {
        alert(res.message);
        onFloated();
      } else {
        alert(res.message || 'Gagal apung & assign murid.');
      }
    } else {
      // School User or Admin (Float Only)
      const res = await floatStudent({
        personId,
        reason,
        notes: notes.trim() || undefined,
        floatedBy: schoolCode || 'admin',
      });
      setLoading(false);
      if (res.status === 'success') {
        alert(res.message);
        onFloated();
      } else {
        alert(res.message || 'Gagal apungkan murid.');
      }
    }
  };

  const reasonLabels: Record<string, string> = {
    pindah_sekolah: 'Pindah Sekolah',
    pindah_daerah: 'Pindah Daerah',
    pindah_negeri: 'Pindah Negeri',
    lain: 'Lain-lain',
  };

  // Filter schools for dropdown (exclude current school)
  const availableSchools = schools.filter(s => s.schoolCode && s.schoolCode !== schoolCode);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] flex flex-col">
        <div className={`px-5 py-4 flex justify-between items-center ${assignDirectly ? 'bg-emerald-600' : 'bg-amber-500'}`}>
          <div className="flex items-center gap-2">
            {assignDirectly ? <UserPlus className="text-white" size={18} /> : <AlertTriangle className="text-white" size={18} />}
            <h3 className="font-bold text-white">{assignDirectly ? 'Apung & Assign Terus' : 'Apungkan Murid'}</h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className={`border rounded-lg p-3 ${assignDirectly ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <p className={`text-sm font-bold ${assignDirectly ? 'text-emerald-800' : 'text-amber-800'}`}>{studentName}</p>
            <p className={`text-xs mt-1 ${assignDirectly ? 'text-emerald-600' : 'text-amber-600'}`}>
              {assignDirectly 
                ? 'Murid ini akan terus dipindahkan ke sekolah baru yang dipilih.' 
                : 'Murid ini akan dikeluarkan dari senarai aktif sekolah dan masuk ke senarai terapung.'
              }
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Sebab Apung</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as any)}
              className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none"
            >
              {Object.entries(reasonLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Catatan <span className="text-slate-400 font-normal">(opsyenal)</span></label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Pindah ke SK Taman Baru..."
              className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none h-20 resize-none"
            />
          </div>

          {/* Admin Only: Assign Terus Option */}
          {isAdmin && availableSchools.length > 0 && (
            <div className="border-t border-slate-200 pt-4 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={assignDirectly}
                  onChange={(e) => setAssignDirectly(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm font-bold text-slate-700 flex items-center gap-1">
                  <UserPlus size={14} className="text-emerald-600" /> Assign terus ke sekolah baru
                </span>
              </label>

              {assignDirectly && (
                <div className="bg-slate-50 rounded-lg p-3 space-y-3 border border-slate-200">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1 flex items-center gap-1">
                      <SchoolIcon size={12} /> Sekolah Tujuan
                    </label>
                    <select
                      value={targetSchoolCode}
                      onChange={(e) => setTargetSchoolCode(e.target.value)}
                      className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-400 outline-none"
                    >
                      <option value="">-- Pilih Sekolah --</option>
                      {availableSchools.map((s) => (
                        <option key={s.schoolCode} value={s.schoolCode}>
                          {s.name} ({s.schoolCode}) {s.daerahCode ? `- ${s.daerahCode}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Peranan Baru</label>
                      <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value)}
                        className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-400 outline-none"
                      >
                        <option value="PESERTA">Peserta</option>
                        <option value="PEMIMPIN">Pemimpin</option>
                        <option value="PENOLONG PEMIMPIN">Penolong Pemimpin</option>
                        <option value="PENGUJI">Penguji</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Kategori Baru</label>
                      <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-400 outline-none"
                      >
                        <option value="Pengakap Kanak-Kanak">Pengakap Kanak-Kanak</option>
                        <option value="Pengakap Muda">Pengakap Muda</option>
                        <option value="Pengakap Remaja">Pengakap Remaja</option>
                        <option value="Kelana">Kelana</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
              Batal
            </button>
            <button 
              onClick={handleSubmit} 
              disabled={loading || (assignDirectly && !targetSchoolCode)} 
              className={`flex-1 py-2.5 text-white rounded-lg text-sm font-bold transition disabled:opacity-50 flex items-center justify-center gap-2 ${
                assignDirectly ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-500 hover:bg-amber-600'
              }`}
            >
              {loading ? <Loader size={14} className="animate-spin" /> : (assignDirectly ? <UserPlus size={14} /> : <AlertTriangle size={14} />)}
              {assignDirectly ? 'Apung & Assign' : 'Apungkan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
