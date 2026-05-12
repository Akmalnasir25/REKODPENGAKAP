import React, { useState, useEffect } from 'react';
import { Building2, MapPin, Users, Plus, Trash2, RefreshCw, ChevronDown, ChevronUp, Shield, Eye, EyeOff, School } from 'lucide-react';
import { fetchCloudData, addNegeri, deleteNegeri, addDaerah, deleteDaerah, addAdmin, deleteAdmin, addSchool, deleteSchool } from '../services/api';
import { registerAdmin } from '../services/supabaseAuth';
import { Negeri, Daerah, AdminRegional, School as SchoolType } from '../types';
import { LoadingSpinner } from './ui/LoadingSpinner';

interface DeveloperDashboardProps {
  scriptUrl: string;
  onLogout: () => void;
  onBack: () => void;
}

export const DeveloperDashboard: React.FC<DeveloperDashboardProps> = ({ scriptUrl, onLogout, onBack }) => {
  const [activeTab, setActiveTab] = useState<'negeri' | 'daerah' | 'admins' | 'schools' | 'data'>('negeri');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  // Data states
  const [negeriList, setNegeriList] = useState<Negeri[]>([]);
  const [daerahList, setDaerahList] = useState<Daerah[]>([]);
  const [adminsList, setAdminsList] = useState<AdminRegional[]>([]);
  const [schoolsList, setSchoolsList] = useState<SchoolType[]>([]);
  const [submissionsData, setSubmissionsData] = useState<any[]>([]);

  // Form states - Negeri
  const [newNegeriCode, setNewNegeriCode] = useState('');
  const [newNegeriName, setNewNegeriName] = useState('');

  // Form states - Daerah
  const [newDaerahCode, setNewDaerahCode] = useState('');
  const [newDaerahName, setNewDaerahName] = useState('');
  const [selectedNegeriForDaerah, setSelectedNegeriForDaerah] = useState('');

  // Form states - Admin
  const [newAdminUsername, setNewAdminUsername] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newAdminRole, setNewAdminRole] = useState<'negeri' | 'daerah'>('daerah');
  const [newAdminNegeri, setNewAdminNegeri] = useState('');
  const [newAdminDaerah, setNewAdminDaerah] = useState('');
  const [newAdminFullName, setNewAdminFullName] = useState('');
  const [newAdminPhone, setNewAdminPhone] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');

  // Form states - School
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolCode, setNewSchoolCode] = useState('');
  const [selectedNegeriForSchool, setSelectedNegeriForSchool] = useState('');
  const [selectedDaerahForSchool, setSelectedDaerahForSchool] = useState('');

  // Expansion states
  const [expandedNegeri, setExpandedNegeri] = useState<string | null>(null);

  // Data filter states
  const [dataFilterNegeri, setDataFilterNegeri] = useState('');
  const [dataFilterDaerah, setDataFilterDaerah] = useState('');
  const [dataFilterBadge, setDataFilterBadge] = useState('');
  const [dataFilterSchool, setDataFilterSchool] = useState('');
  const [dataFilterRole, setDataFilterRole] = useState('');
  const [dataFilterYear, setDataFilterYear] = useState('');
  const [dataFilterGender, setDataFilterGender] = useState('');
  const [dataSearchText, setDataSearchText] = useState('');

  useEffect(() => {
    loadData();
  }, [scriptUrl]);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await fetchCloudData(scriptUrl);
      if (result.status === 'success') {
        setNegeriList(result.negeriList || []);
        setDaerahList(result.daerahList || []);
        setSchoolsList(result.schools || []);
        setSubmissionsData(result.submissions || []);
        // Note: adminsList would need a separate endpoint to fetch
        // For now, we'll just manage creation/deletion
      }
    } catch (error) {
      showMessage('Gagal load data: ' + error, 'error');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (msg: string, type: 'success' | 'error') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 5000);
  };

  // Negeri Management
  const handleAddNegeri = async () => {
    if (!newNegeriCode || !newNegeriName) {
      showMessage('Sila isi semua medan Negeri', 'error');
      return;
    }
    setLoading(true);
    try {
      const result = await addNegeri(scriptUrl, newNegeriCode, newNegeriName);
      if (result.status === 'success') {
        showMessage('Negeri berjaya ditambah!', 'success');
        setNewNegeriCode('');
        setNewNegeriName('');
        await loadData();
      } else {
        showMessage(result.message || 'Gagal tambah negeri', 'error');
      }
    } catch (error) {
      showMessage('Error: ' + error, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNegeri = async (code: string) => {
    if (!confirm(`Adakah anda pasti untuk padam negeri ${code}? Ini akan padam semua daerah dan data berkaitan!`)) return;
    setLoading(true);
    try {
      const result = await deleteNegeri(scriptUrl, code);
      if (result.status === 'success') {
        showMessage('Negeri berjaya dipadam!', 'success');
        await loadData();
      } else {
        showMessage(result.message || 'Gagal padam negeri', 'error');
      }
    } catch (error) {
      showMessage('Error: ' + error, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Daerah Management
  const handleAddDaerah = async () => {
    if (!newDaerahCode || !newDaerahName || !selectedNegeriForDaerah) {
      showMessage('Sila isi semua medan Daerah', 'error');
      return;
    }
    setLoading(true);
    try {
      const result = await addDaerah(scriptUrl, newDaerahCode, newDaerahName, selectedNegeriForDaerah);
      if (result.status === 'success') {
        showMessage('Daerah berjaya ditambah!', 'success');
        setNewDaerahCode('');
        setNewDaerahName('');
        setSelectedNegeriForDaerah('');
        await loadData();
      } else {
        showMessage(result.message || 'Gagal tambah daerah', 'error');
      }
    } catch (error) {
      showMessage('Error: ' + error, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDaerah = async (code: string) => {
    if (!confirm(`Adakah anda pasti untuk padam daerah ${code}?`)) return;
    setLoading(true);
    try {
      const result = await deleteDaerah(scriptUrl, code);
      if (result.status === 'success') {
        showMessage('Daerah berjaya dipadam!', 'success');
        await loadData();
      } else {
        showMessage(result.message || 'Gagal padam daerah', 'error');
      }
    } catch (error) {
      showMessage('Error: ' + error, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Admin Management
  const handleAddAdmin = async () => {
    if (!newAdminEmail || !newAdminPassword || !newAdminRole) {
      showMessage('Sila isi Email, Password dan Role', 'error');
      return;
    }
    if (newAdminRole === 'negeri' && !newAdminNegeri) {
      showMessage('Sila pilih Negeri untuk Admin Negeri', 'error');
      return;
    }
    if (newAdminRole === 'daerah' && (!newAdminNegeri || !newAdminDaerah)) {
      showMessage('Sila pilih Negeri dan Daerah untuk Admin Daerah', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await registerAdmin({
        email: newAdminEmail,
        password: newAdminPassword,
        fullName: newAdminFullName || newAdminEmail,
        role: newAdminRole === 'negeri' ? 'negeri_admin' : 'daerah_admin',
        negeriCode: newAdminNegeri,
        daerahCode: newAdminRole === 'daerah' ? newAdminDaerah : undefined,
      });

      if (result.status === 'success') {
        showMessage('Admin berjaya didaftarkan di Supabase!', 'success');
        // Reset form
        setNewAdminUsername('');
        setNewAdminPassword('');
        setNewAdminRole('daerah');
        setNewAdminNegeri('');
        setNewAdminDaerah('');
        setNewAdminFullName('');
        setNewAdminPhone('');
        setNewAdminEmail('');
      } else {
        showMessage(result.message || 'Gagal tambah admin', 'error');
      }
    } catch (error) {
      showMessage('Error: ' + error, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAdmin = async (username: string) => {
    if (!confirm(`Adakah anda pasti untuk padam admin ${username}?`)) return;
    setLoading(true);
    try {
      const result = await deleteAdmin(scriptUrl, username);
      if (result.status === 'success') {
        showMessage('Admin berjaya dipadam!', 'success');
      } else {
        showMessage(result.message || 'Gagal padam admin', 'error');
      }
    } catch (error) {
      showMessage('Error: ' + error, 'error');
    } finally {
      setLoading(false);
    }
  };

  // School Management
  const handleAddSchool = async () => {
    if (!newSchoolName || !newSchoolCode || !selectedNegeriForSchool || !selectedDaerahForSchool) {
      showMessage('Sila isi semua medan Sekolah', 'error');
      return;
    }
    setLoading(true);
    try {
      const result = await addSchool(scriptUrl, {
        schoolName: newSchoolName,
        schoolCode: newSchoolCode,
        negeriCode: selectedNegeriForSchool,
        daerahCode: selectedDaerahForSchool
      });
      if (result.status === 'success') {
        showMessage('Sekolah berjaya ditambah!', 'success');
        setNewSchoolName('');
        setNewSchoolCode('');
        setSelectedNegeriForSchool('');
        setSelectedDaerahForSchool('');
        await loadData();
      } else {
        showMessage(result.message || 'Gagal tambah sekolah', 'error');
      }
    } catch (error) {
      showMessage('Error: ' + error, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSchool = async (schoolCode: string) => {
    if (!confirm(`Adakah anda pasti untuk padam sekolah ${schoolCode}?`)) return;
    setLoading(true);
    try {
      const result = await deleteSchool(scriptUrl, schoolCode);
      if (result.status === 'success') {
        showMessage('Sekolah berjaya dipadam!', 'success');
        await loadData();
      } else {
        showMessage(result.message || 'Gagal padam sekolah', 'error');
      }
    } catch (error) {
      showMessage('Error: ' + error, 'error');
    } finally {
      setLoading(false);
    }
  };

  const getDaerahByNegeri = (negeriCode: string) => {
    return daerahList.filter(d => d.negeriCode === negeriCode);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
                <Shield className="text-blue-600" size={32} />
                Developer Dashboard
              </h1>
              <p className="text-slate-600 mt-1">Pengurusan Sistem Hierarki Negara</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-semibold transition flex items-center gap-2"
              >
                <ChevronDown className="rotate-90" size={18} />
                Kembali
              </button>
              <button
                onClick={onLogout}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold transition"
              >
                Log Keluar
              </button>
            </div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${messageType === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {message}
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-lg mb-6">
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab('negeri')}
              className={`flex-1 px-6 py-4 font-semibold transition flex items-center justify-center gap-2 ${
                activeTab === 'negeri' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Building2 size={20} />
              Negeri ({negeriList.length})
            </button>
            <button
              onClick={() => setActiveTab('daerah')}
              className={`flex-1 px-6 py-4 font-semibold transition flex items-center justify-center gap-2 ${
                activeTab === 'daerah' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <MapPin size={20} />
              Daerah ({daerahList.length})
            </button>
            <button
              onClick={() => setActiveTab('schools')}
              className={`flex-1 px-6 py-4 font-semibold transition flex items-center justify-center gap-2 ${
                activeTab === 'schools' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <School size={20} />
              Sekolah ({schoolsList.length})
            </button>
            <button
              onClick={() => setActiveTab('admins')}
              className={`flex-1 px-6 py-4 font-semibold transition flex items-center justify-center gap-2 ${
                activeTab === 'admins' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Users size={20} />
              Admin Regional
            </button>
            <button
              onClick={() => setActiveTab('data')}
              className={`flex-1 px-6 py-4 font-semibold transition flex items-center justify-center gap-2 ${
                activeTab === 'data' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Shield size={20} />
              Data Peserta ({submissionsData.length})
            </button>
          </div>

          <div className="p-6">
            {loading && (
              <div className="flex justify-center py-8">
                <LoadingSpinner />
              </div>
            )}

            {!loading && activeTab === 'negeri' && (
              <div>
                {/* Add Negeri Form */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <Plus size={20} />
                    Tambah Negeri Baru
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold mb-1">Kod Negeri</label>
                      <input
                        type="text"
                        value={newNegeriCode}
                        onChange={(e) => setNewNegeriCode(e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="PRK"
                        maxLength={3}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-1">Nama Negeri</label>
                      <input
                        type="text"
                        value={newNegeriName}
                        onChange={(e) => setNewNegeriName(e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="PERAK"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={handleAddNegeri}
                        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition"
                      >
                        <Plus size={18} className="inline mr-2" />
                        Tambah
                      </button>
                    </div>
                  </div>
                </div>

                {/* Negeri List */}
                <div className="space-y-3">
                  {negeriList.map((negeri) => (
                    <div key={negeri.code} className="border border-slate-200 rounded-lg">
                      <div className="flex items-center justify-between p-4 bg-slate-50">
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => setExpandedNegeri(expandedNegeri === negeri.code ? null : negeri.code)}
                            className="text-slate-600 hover:text-slate-800"
                          >
                            {expandedNegeri === negeri.code ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                          </button>
                          <Building2 className="text-blue-600" size={20} />
                          <div>
                            <div className="font-bold text-lg">{negeri.name}</div>
                            <div className="text-sm text-slate-600">Kod: {negeri.code}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-slate-600">
                            {getDaerahByNegeri(negeri.code).length} daerah
                          </span>
                          <button
                            onClick={() => handleDeleteNegeri(negeri.code)}
                            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-semibold transition"
                          >
                            <Trash2 size={16} className="inline mr-1" />
                            Padam
                          </button>
                        </div>
                      </div>
                      
                      {expandedNegeri === negeri.code && (
                        <div className="p-4 bg-white border-t">
                          <h4 className="font-semibold mb-2">Daerah dalam {negeri.name}:</h4>
                          <div className="space-y-2">
                            {getDaerahByNegeri(negeri.code).map((daerah) => (
                              <div key={daerah.code} className="flex items-center justify-between bg-slate-50 p-3 rounded">
                                <div className="flex items-center gap-2">
                                  <MapPin size={16} className="text-slate-600" />
                                  <span className="font-medium">{daerah.name}</span>
                                  <span className="text-sm text-slate-500">({daerah.code})</span>
                                </div>
                              </div>
                            ))}
                            {getDaerahByNegeri(negeri.code).length === 0 && (
                              <p className="text-slate-500 text-sm italic">Tiada daerah lagi</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!loading && activeTab === 'daerah' && (
              <div>
                {/* Add Daerah Form */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <Plus size={20} />
                    Tambah Daerah Baru
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-semibold mb-1">Pilih Negeri</label>
                      <select
                        value={selectedNegeriForDaerah}
                        onChange={(e) => setSelectedNegeriForDaerah(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        <option value="">-- Pilih Negeri --</option>
                        {negeriList.map((n) => (
                          <option key={n.code} value={n.code}>{n.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-1">Kod Daerah</label>
                      <input
                        type="text"
                        value={newDaerahCode}
                        onChange={(e) => setNewDaerahCode(e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="PRK-KU"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-1">Nama Daerah</label>
                      <input
                        type="text"
                        value={newDaerahName}
                        onChange={(e) => setNewDaerahName(e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="KINTA UTARA"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={handleAddDaerah}
                        className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition"
                      >
                        <Plus size={18} className="inline mr-2" />
                        Tambah
                      </button>
                    </div>
                  </div>
                </div>

                {/* Daerah List */}
                <div className="space-y-2">
                  {daerahList.map((daerah) => {
                    const negeri = negeriList.find(n => n.code === daerah.negeriCode);
                    return (
                      <div key={daerah.code} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                        <div className="flex items-center gap-3">
                          <MapPin className="text-green-600" size={20} />
                          <div>
                            <div className="font-bold">{daerah.name}</div>
                            <div className="text-sm text-slate-600">
                              Kod: {daerah.code} | Negeri: {negeri?.name || daerah.negeriCode}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteDaerah(daerah.code)}
                          className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-semibold transition"
                        >
                          <Trash2 size={16} className="inline mr-1" />
                          Padam
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!loading && activeTab === 'admins' && (
              <div>
                {/* Add Admin Form */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 mb-6">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <Plus size={20} />
                    Cipta Admin Regional Baru
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold mb-1">Email Admin *</label>
                      <input
                        type="email"
                        value={newAdminEmail}
                        onChange={(e) => setNewAdminEmail(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="admin@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-1">Password *</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={newAdminPassword}
                          onChange={(e) => setNewAdminPassword(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg pr-10"
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-1">Role *</label>
                      <select
                        value={newAdminRole}
                        onChange={(e) => {
                          setNewAdminRole(e.target.value as 'negeri' | 'daerah');
                          setNewAdminDaerah(''); // Reset daerah when role changes
                        }}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        <option value="negeri">Admin Negeri</option>
                        <option value="daerah">Admin Daerah</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-1">Negeri *</label>
                      <select
                        value={newAdminNegeri}
                        onChange={(e) => {
                          setNewAdminNegeri(e.target.value);
                          setNewAdminDaerah(''); // Reset daerah when negeri changes
                        }}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        <option value="">-- Pilih Negeri --</option>
                        {negeriList.map((n) => (
                          <option key={n.code} value={n.code}>{n.name}</option>
                        ))}
                      </select>
                    </div>
                    {newAdminRole === 'daerah' && (
                      <div>
                        <label className="block text-sm font-semibold mb-1">Daerah *</label>
                        <select
                          value={newAdminDaerah}
                          onChange={(e) => setNewAdminDaerah(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg"
                          disabled={!newAdminNegeri}
                        >
                          <option value="">-- Pilih Daerah --</option>
                          {daerahList
                            .filter(d => d.negeriCode === newAdminNegeri)
                            .map((d) => (
                              <option key={d.code} value={d.code}>{d.name}</option>
                            ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-semibold mb-1">Nama Penuh</label>
                      <input
                        type="text"
                        value={newAdminFullName}
                        onChange={(e) => setNewAdminFullName(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="Ahmad bin Ali"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-1">No. Telefon</label>
                      <input
                        type="text"
                        value={newAdminPhone}
                        onChange={(e) => setNewAdminPhone(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="0123456789"
                      />
                    </div>
                    <div className="md:col-span-2 bg-purple-100 border border-purple-200 rounded-lg p-3 text-sm text-purple-800">
                      Akaun admin akan dicipta dalam Supabase Auth. Data sistem masih dibaca daripada GAS mengikut role dan negeri/daerah yang dipilih.
                    </div>
                  </div>
                  <button
                    onClick={handleAddAdmin}
                    className="mt-4 w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition"
                  >
                    <Plus size={18} className="inline mr-2" />
                    Cipta Admin
                  </button>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    ℹ️ <strong>Nota:</strong> Senarai admin tidak dipaparkan di sini atas sebab keselamatan. 
                    Gunakan Google Sheets untuk melihat senarai admin dalam sheet <strong>ADMINS</strong>.
                  </p>
                </div>
              </div>
            )}

            {/* Schools Tab */}
            {!loading && activeTab === 'schools' && (
              <div className="space-y-6">
                {/* Add School Form */}
                <div className="bg-green-50 border-2 border-green-300 rounded-lg p-6">
                  <h3 className="text-lg font-bold mb-4 text-green-800 flex items-center gap-2">
                    <Plus size={20} />
                    Tambah Sekolah Baharu
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold mb-1">Nama Sekolah *</label>
                      <input
                        type="text"
                        value={newSchoolName}
                        onChange={(e) => setNewSchoolName(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="SMK DATO' HAMZAH"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-1">Kod Sekolah *</label>
                      <input
                        type="text"
                        value={newSchoolCode}
                        onChange={(e) => setNewSchoolCode(e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 border rounded-lg uppercase"
                        placeholder="ABA1234"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-1">Negeri *</label>
                      <select
                        value={selectedNegeriForSchool}
                        onChange={(e) => {
                          setSelectedNegeriForSchool(e.target.value);
                          setSelectedDaerahForSchool(''); // Reset daerah
                        }}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        <option value="">-- Pilih Negeri --</option>
                        {negeriList.map(n => (
                          <option key={n.code} value={n.code}>{n.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-1">Daerah *</label>
                      <select
                        value={selectedDaerahForSchool}
                        onChange={(e) => setSelectedDaerahForSchool(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg"
                        disabled={!selectedNegeriForSchool}
                      >
                        <option value="">-- Pilih Daerah --</option>
                        {getDaerahByNegeri(selectedNegeriForSchool).map(d => (
                          <option key={d.code} value={d.code}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    onClick={handleAddSchool}
                    className="mt-4 w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition"
                  >
                    <Plus size={18} className="inline mr-2" />
                    Tambah Sekolah
                  </button>
                </div>

                {/* Schools List by Daerah */}
                <div className="space-y-4">
                  <h3 className="text-lg font-bold">Senarai Sekolah ({schoolsList.length})</h3>
                  
                  {/* Filter by Negeri */}
                  <div className="flex gap-4">
                    <select
                      value={selectedNegeriForSchool}
                      onChange={(e) => {
                        setSelectedNegeriForSchool(e.target.value);
                        setSelectedDaerahForSchool('');
                      }}
                      className="px-4 py-2 border rounded-lg"
                    >
                      <option value="">Semua Negeri</option>
                      {negeriList.map(n => (
                        <option key={n.code} value={n.code}>{n.name}</option>
                      ))}
                    </select>
                    
                    {selectedNegeriForSchool && (
                      <select
                        value={selectedDaerahForSchool}
                        onChange={(e) => setSelectedDaerahForSchool(e.target.value)}
                        className="px-4 py-2 border rounded-lg"
                      >
                        <option value="">Semua Daerah</option>
                        {getDaerahByNegeri(selectedNegeriForSchool).map(d => (
                          <option key={d.code} value={d.code}>{d.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Schools Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full bg-white border rounded-lg">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="px-4 py-3 text-left">Kod Sekolah</th>
                          <th className="px-4 py-3 text-left">Nama Sekolah</th>
                          <th className="px-4 py-3 text-left">Negeri</th>
                          <th className="px-4 py-3 text-left">Daerah</th>
                          <th className="px-4 py-3 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schoolsList
                          .filter(s => {
                            if (selectedNegeriForSchool && s.negeriCode !== selectedNegeriForSchool) return false;
                            if (selectedDaerahForSchool && s.daerahCode !== selectedDaerahForSchool) return false;
                            return true;
                          })
                          .map((school, idx) => {
                            const negeri = negeriList.find(n => n.code === school.negeriCode);
                            const daerah = daerahList.find(d => d.code === school.daerahCode);
                            return (
                              <tr key={idx} className="border-t hover:bg-slate-50">
                                <td className="px-4 py-3 font-mono text-sm">{school.schoolCode || '-'}</td>
                                <td className="px-4 py-3">{school.name}</td>
                                <td className="px-4 py-3">{negeri?.name || school.negeriCode || '-'}</td>
                                <td className="px-4 py-3">{daerah?.name || school.daerahCode || '-'}</td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={() => handleDeleteSchool(school.schoolCode || school.name)}
                                    className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded transition text-sm"
                                  >
                                    <Trash2 size={14} className="inline mr-1" />
                                    Padam
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        {schoolsList.filter(s => {
                          if (selectedNegeriForSchool && s.negeriCode !== selectedNegeriForSchool) return false;
                          if (selectedDaerahForSchool && s.daerahCode !== selectedDaerahForSchool) return false;
                          return true;
                        }).length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                              Tiada sekolah dijumpai
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* DATA PESERTA TAB */}
            {!loading && activeTab === 'data' && (() => {
              // Compute unique values for filter dropdowns
              const uniqueBadges = [...new Set(submissionsData.map(d => d.badge).filter(Boolean))].sort();
              const uniqueSchools = [...new Set(submissionsData.map(d => d.school).filter(Boolean))].sort();
              const uniqueRoles = [...new Set(submissionsData.map(d => d.role || 'PESERTA').filter(Boolean))].sort();
              const uniqueYears = [...new Set(submissionsData.map(d => { try { return new Date(d.date).getFullYear().toString(); } catch { return ''; } }).filter(Boolean))].sort((a,b) => Number(b) - Number(a));
              const uniqueGenders = [...new Set(submissionsData.map(d => d.gender).filter(Boolean))].sort();

              // Apply filters
              const filteredSubmissions = submissionsData.filter(d => {
                if (dataFilterNegeri && d.negeriCode !== dataFilterNegeri) return false;
                if (dataFilterDaerah && d.daerahCode !== dataFilterDaerah) return false;
                if (dataFilterBadge && d.badge !== dataFilterBadge) return false;
                if (dataFilterSchool && d.school !== dataFilterSchool) return false;
                if (dataFilterRole && (d.role || 'PESERTA') !== dataFilterRole) return false;
                if (dataFilterGender && d.gender !== dataFilterGender) return false;
                if (dataFilterYear) {
                  try { if (new Date(d.date).getFullYear().toString() !== dataFilterYear) return false; } catch { return false; }
                }
                if (dataSearchText) {
                  const q = dataSearchText.toLowerCase();
                  const searchable = [d.student, d.school, d.badge, d.id, d.icNumber, d.schoolCode, d.remarks].map(v => String(v || '').toLowerCase()).join(' ');
                  if (!searchable.includes(q)) return false;
                }
                return true;
              });

              const activeFilterCount = [dataFilterNegeri, dataFilterDaerah, dataFilterBadge, dataFilterSchool, dataFilterRole, dataFilterYear, dataFilterGender, dataSearchText].filter(Boolean).length;

              // Stats for filtered data
              const statPeserta = filteredSubmissions.filter(d => !d.role || d.role === 'PESERTA' || d.role === 'PENERIMA RAMBU').length;
              const statPenolong = filteredSubmissions.filter(d => (d.role || '').toUpperCase().includes('PENOLONG') || d.role === 'PEMIMPIN').length;
              const statPenguji = filteredSubmissions.filter(d => (d.role || '').toUpperCase() === 'PENGUJI').length;
              const statSchools = new Set(filteredSubmissions.map(d => d.schoolCode || d.school).filter(Boolean)).size;

              return (
              <div className="space-y-5">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <Shield size={20} />
                      Data Penyertaan Lencana
                    </h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                      Memaparkan {filteredSubmissions.length} daripada {submissionsData.length} rekod
                      {activeFilterCount > 0 && <span className="ml-1 text-blue-600 font-medium">({activeFilterCount} filter aktif)</span>}
                    </p>
                  </div>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="text-xs text-blue-600 font-semibold uppercase tracking-wider">Peserta</div>
                    <div className="text-2xl font-bold text-blue-800 mt-1">{statPeserta}</div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <div className="text-xs text-green-600 font-semibold uppercase tracking-wider">Pemimpin/Penolong</div>
                    <div className="text-2xl font-bold text-green-800 mt-1">{statPenolong}</div>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <div className="text-xs text-purple-600 font-semibold uppercase tracking-wider">Penguji</div>
                    <div className="text-2xl font-bold text-purple-800 mt-1">{statPenguji}</div>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                    <div className="text-xs text-orange-600 font-semibold uppercase tracking-wider">Sekolah</div>
                    <div className="text-2xl font-bold text-orange-800 mt-1">{statSchools}</div>
                  </div>
                </div>

                {/* Filter Panel */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                      Tapis Data
                    </h4>
                    {activeFilterCount > 0 && (
                      <button
                        onClick={() => { setDataFilterNegeri(''); setDataFilterDaerah(''); setDataFilterBadge(''); setDataFilterSchool(''); setDataFilterRole(''); setDataFilterYear(''); setDataFilterGender(''); setDataSearchText(''); }}
                        className="text-xs text-red-600 hover:text-red-700 font-medium hover:underline"
                      >
                        Kosongkan Semua Filter
                      </button>
                    )}
                  </div>

                  {/* Search */}
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input
                      type="text"
                      placeholder="Cari nama, IC, kod sekolah, catatan..."
                      value={dataSearchText}
                      onChange={e => setDataSearchText(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    />
                    {dataSearchText && (
                      <button onClick={() => setDataSearchText('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>

                  {/* Filter Dropdowns */}
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                    {/* Year */}
                    <select value={dataFilterYear} onChange={e => setDataFilterYear(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Semua Tahun</option>
                      {uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>

                    {/* Badge */}
                    <select value={dataFilterBadge} onChange={e => setDataFilterBadge(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Semua Lencana</option>
                      {uniqueBadges.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>

                    {/* Negeri */}
                    <select value={dataFilterNegeri} onChange={e => { setDataFilterNegeri(e.target.value); setDataFilterDaerah(''); }} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Semua Negeri</option>
                      {negeriList.map(n => <option key={n.code} value={n.code}>{n.name}</option>)}
                    </select>

                    {/* Daerah */}
                    <select value={dataFilterDaerah} onChange={e => setDataFilterDaerah(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" disabled={!dataFilterNegeri}>
                      <option value="">Semua Daerah</option>
                      {daerahList.filter(d => d.negeriCode === dataFilterNegeri).map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
                    </select>

                    {/* School */}
                    <select value={dataFilterSchool} onChange={e => setDataFilterSchool(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Semua Sekolah</option>
                      {uniqueSchools.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    {/* Role */}
                    <select value={dataFilterRole} onChange={e => setDataFilterRole(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Semua Peranan</option>
                      {uniqueRoles.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>

                    {/* Gender */}
                    <select value={dataFilterGender} onChange={e => setDataFilterGender(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Semua Jantina</option>
                      {uniqueGenders.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>

                  {/* Active filter tags */}
                  {activeFilterCount > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {dataFilterYear && <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">Tahun: {dataFilterYear} <button onClick={() => setDataFilterYear('')} className="hover:text-blue-900">&times;</button></span>}
                      {dataFilterBadge && <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">Lencana: {dataFilterBadge} <button onClick={() => setDataFilterBadge('')} className="hover:text-amber-900">&times;</button></span>}
                      {dataFilterNegeri && <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Negeri: {negeriList.find(n=>n.code===dataFilterNegeri)?.name || dataFilterNegeri} <button onClick={() => { setDataFilterNegeri(''); setDataFilterDaerah(''); }} className="hover:text-green-900">&times;</button></span>}
                      {dataFilterDaerah && <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-100 text-teal-700 rounded-full text-xs font-medium">Daerah: {daerahList.find(d=>d.code===dataFilterDaerah)?.name || dataFilterDaerah} <button onClick={() => setDataFilterDaerah('')} className="hover:text-teal-900">&times;</button></span>}
                      {dataFilterSchool && <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">Sekolah: {dataFilterSchool.length > 20 ? dataFilterSchool.slice(0,20)+'...' : dataFilterSchool} <button onClick={() => setDataFilterSchool('')} className="hover:text-purple-900">&times;</button></span>}
                      {dataFilterRole && <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">Peranan: {dataFilterRole} <button onClick={() => setDataFilterRole('')} className="hover:text-indigo-900">&times;</button></span>}
                      {dataFilterGender && <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-pink-100 text-pink-700 rounded-full text-xs font-medium">Jantina: {dataFilterGender} <button onClick={() => setDataFilterGender('')} className="hover:text-pink-900">&times;</button></span>}
                      {dataSearchText && <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-200 text-slate-700 rounded-full text-xs font-medium">Carian: "{dataSearchText}" <button onClick={() => setDataSearchText('')} className="hover:text-slate-900">&times;</button></span>}
                    </div>
                  )}
                </div>

                {/* Data Table */}
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full bg-white text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">#</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Tarikh</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Nama</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Sekolah</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Lencana</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Peranan</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Jantina</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">IC</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSubmissions.slice(0, 200).map((d, idx) => {
                        const badgeColor = d.badge?.includes('Gangsa') ? 'bg-amber-100 text-amber-800' :
                                           d.badge?.includes('Perak') ? 'bg-slate-100 text-slate-800' :
                                           d.badge?.includes('Emas') ? 'bg-yellow-100 text-yellow-800' :
                                           d.badge?.includes('Rambu') ? 'bg-purple-100 text-purple-800' :
                                           'bg-blue-100 text-blue-800';
                        const roleColor = (d.role || '').includes('PENOLONG') ? 'text-green-700' :
                                          d.role === 'PENGUJI' ? 'text-purple-700' :
                                          d.role === 'PEMIMPIN' ? 'text-amber-700' :
                                          'text-slate-700';
                        return (
                          <tr key={d.rowIndex || idx} className="border-t border-slate-100 hover:bg-blue-50/30 transition-colors">
                            <td className="px-4 py-2.5 text-slate-400 text-xs">{idx + 1}</td>
                            <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{d.date ? new Date(d.date).toLocaleDateString('ms-MY') : '-'}</td>
                            <td className="px-4 py-2.5 font-medium text-slate-800">{d.student || '-'}</td>
                            <td className="px-4 py-2.5 text-xs">{d.school || '-'}</td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${badgeColor}`}>{d.badge || '-'}</span>
                            </td>
                            <td className={`px-4 py-2.5 text-xs font-medium ${roleColor}`}>{d.role || 'PESERTA'}</td>
                            <td className="px-4 py-2.5 text-xs">{d.gender || '-'}</td>
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{d.icNumber || '-'}</td>
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{d.id || '-'}</td>
                          </tr>
                        );
                      })}
                      {filteredSubmissions.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-4 py-12 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              <p className="text-slate-500 font-medium">Tiada data dijumpai</p>
                              <p className="text-slate-400 text-xs">Cuba ubah filter atau carian anda</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {filteredSubmissions.length > 200 && (
                    <div className="px-4 py-3 bg-amber-50 border-t border-amber-200 text-center">
                      <p className="text-xs text-amber-700 font-medium">Memaparkan 200 daripada {filteredSubmissions.length} rekod. Gunakan filter untuk mengecilkan senarai.</p>
                    </div>
                  )}
                </div>
              </div>
              );
            })()}
          </div>
        </div>

        {/* Refresh Button */}
        <div className="text-center">
          <button
            onClick={loadData}
            className="px-6 py-3 bg-white hover:bg-slate-100 text-slate-700 rounded-lg font-semibold shadow-lg transition flex items-center gap-2 mx-auto"
          >
            <RefreshCw size={18} />
            Refresh Data
          </button>
        </div>
      </div>
    </div>
  );
};
