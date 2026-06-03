import React, { useState } from 'react';
import { X, AlertTriangle, Loader } from 'lucide-react';
import { floatStudent } from '../services/supabaseApi';

interface FloatStudentModalProps {
  studentName: string;
  personId: string;
  schoolCode: string;
  onClose: () => void;
  onFloated: () => void;
}

export const FloatStudentModal: React.FC<FloatStudentModalProps> = ({
  studentName, personId, schoolCode, onClose, onFloated,
}) => {
  const [reason, setReason] = useState<'pindah_sekolah' | 'pindah_daerah' | 'pindah_negeri' | 'lain'>('pindah_sekolah');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!confirm(`Apungkan murid "${studentName}" keluar dari sekolah?\n\nMurid ini akan hilang dari senarai aktif dan boleh ditarik oleh sekolah lain.`)) return;
    setLoading(true);
    const res = await floatStudent({
      personId,
      reason,
      notes: notes.trim() || undefined,
      floatedBy: schoolCode,
    });
    setLoading(false);
    if (res.status === 'success') {
      onFloated();
    } else {
      alert(res.message || 'Gagal apungkan murid.');
    }
  };

  const reasonLabels: Record<string, string> = {
    pindah_sekolah: 'Pindah Sekolah',
    pindah_daerah: 'Pindah Daerah',
    pindah_negeri: 'Pindah Negeri',
    lain: 'Lain-lain',
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="bg-amber-500 px-5 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-white" size={18} />
            <h3 className="font-bold text-white">Apungkan Murid</h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm font-bold text-amber-800">{studentName}</p>
            <p className="text-xs text-amber-600 mt-1">Murid ini akan dikeluarkan dari senarai aktif sekolah dan masuk ke senarai terapung.</p>
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

          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
              Batal
            </button>
            <button onClick={handleSubmit} disabled={loading} className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-bold transition disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
              Apungkan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
