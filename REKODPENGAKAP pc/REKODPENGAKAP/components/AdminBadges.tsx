

import React, { useState } from 'react';
import { Plus, Trash2, RefreshCw, Medal, ToggleLeft, ToggleRight, Calendar } from 'lucide-react';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { addBadgeType, deleteBadgeType, toggleRegistration, updateBadgeDeadline } from '../services/api';
import { Badge } from '../types';

interface AdminBadgesProps {
  badges: Badge[];
  scriptUrl: string;
  onRefresh: () => void;
}

export const AdminBadges: React.FC<AdminBadgesProps> = ({ badges = [], scriptUrl, onRefresh }) => {
  const [newBadge, setNewBadge] = useState('');
  const [loading, setLoading] = useState(false);
  const [togglingBadge, setTogglingBadge] = useState<string | null>(null);
  const [updatingDate, setUpdatingDate] = useState<string | null>(null);

  // Ensure badges is always an array
  const safeBadges = Array.isArray(badges) ? badges : [];

  const handleAdd = async () => {
    if (!newBadge.trim()) return;

    if (safeBadges.some(b => b.name === newBadge.trim())) {
      alert("Lencana ini sudah wujud.");
      return;
    }

    setLoading(true);
    try {
        const response = await addBadgeType(scriptUrl, newBadge);
        
        if (response.status === 'success') {
            alert(`Lencana '${newBadge}' berjaya ditambah.`);
            setNewBadge('');
            // Immediate refresh
            onRefresh(); 
        } else {
            alert(`Gagal menambah: ${response.message || 'Ralat tidak diketahui'}`);
        }
    } catch (error) {
        console.error(error);
        alert("Ralat komunikasi dengan server. Sila semak sambungan internet atau URL Script.");
    } finally {
        setLoading(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Padam lencana/kategori: ${name}?`)) return;
    setLoading(true);
    try {
        const response = await deleteBadgeType(scriptUrl, name);
        if (response.status === 'success') {
            alert("Berjaya dipadam.");
            onRefresh();
        } else {
            alert("Gagal memadam: " + response.message);
        }
    } catch (e) {
        alert("Gagal memadam.");
    } finally {
        setLoading(false);
    }
  };

  const handleToggle = async (badge: Badge) => {
    setTogglingBadge(badge.name);
    try {
        const newStatus = !badge.isOpen;
        await toggleRegistration(scriptUrl, newStatus, badge.name);
        onRefresh();
    } catch (e) {
        alert("Gagal menukar status lencana.");
    } finally {
        setTogglingBadge(null);
    }
  };

  const handleDateChange = async (badgeName: string, date: string) => {
      setUpdatingDate(badgeName);
      try {
          await updateBadgeDeadline(scriptUrl, badgeName, date);
          // Optional: onRefresh() if you want to sync perfectly, 
          // but input holds value so maybe not needed immediately to avoid UI jump
          onRefresh();
      } catch (e) {
          alert("Gagal mengemaskini tarikh.");
      } finally {
          setUpdatingDate(null);
      }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow animate-[fadeIn_0.2s_ease-out]">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <Medal size={20} className="text-purple-600"/> Senarai Lencana / Kategori ({safeBadges.length})
        </h2>
        <button onClick={onRefresh} className="text-blue-600 hover:bg-blue-50 p-2 rounded transition">
          <RefreshCw size={20} />
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm font-medium"
          placeholder="Nama Lencana Baru (Cth: Keris Gangsa)"
          value={newBadge}
          onChange={e => setNewBadge(e.target.value)}
        />
        <button 
          onClick={handleAdd} 
          disabled={!newBadge || loading} 
          className="px-6 py-2.5 rounded-lg font-bold text-white flex items-center justify-center gap-2 transition bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? <LoadingSpinner size="sm" color="border-white" /> : <Plus size={20} />}
          Tambah
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto border rounded-lg bg-gray-50 p-2">
        {safeBadges.map((b, i) => (
          <div key={i} className="p-3 border-b last:border-0 bg-white rounded mb-1 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 group hover:bg-purple-50 transition">
            <div className="flex items-center gap-3">
                <span className={`px-2 py-1 rounded text-xs font-bold ${b.isOpen ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {b.isOpen ? 'BUKA' : 'TUTUP'}
                </span>
                <span className={`font-medium ${b.isOpen ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{b.name}</span>
            </div>
            
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-gray-50 p-1 rounded border border-gray-200">
                    <Calendar size={14} className="text-gray-400 ml-1"/>
                    <input 
                        type="date" 
                        className="text-xs bg-transparent outline-none text-gray-600 w-32"
                        value={b.deadline || ''}
                        onChange={(e) => handleDateChange(b.name, e.target.value)}
                        title="Tetapkan Tarikh Tutup"
                    />
                    {updatingDate === b.name && <LoadingSpinner size="sm" />}
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => handleToggle(b)}
                        disabled={togglingBadge === b.name}
                        className={`p-1 rounded hover:bg-gray-200 transition ${b.isOpen ? 'text-green-600' : 'text-gray-400'}`}
                        title={b.isOpen ? "Tutup Pendaftaran Lencana Ini" : "Buka Pendaftaran Lencana Ini"}
                    >
                        {togglingBadge === b.name ? <LoadingSpinner size="sm" color="border-purple-600"/> : (b.isOpen ? <ToggleRight size={24}/> : <ToggleLeft size={24}/>)}
                    </button>
                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <button 
                    onClick={() => handleDelete(b.name)} 
                    className="text-gray-300 hover:text-red-500 transition p-1"
                    title="Padam Lencana"
                    >
                    <Trash2 size={16} />
                    </button>
                </div>
            </div>
          </div>
        ))}
        {safeBadges.length === 0 && <p className="text-center text-gray-400 p-4">Tiada lencana dalam database.</p>}
      </div>
    </div>
  );
};