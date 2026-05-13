import React, { useState, useEffect } from 'react';
import { Building2, MapPin, Users, Plus, Trash2, RefreshCw, ChevronDown, ChevronUp, Shield, Eye, EyeOff, School } from 'lucide-react';
import { fetchCloudData, addNegeri, deleteNegeri, addDaerah, deleteDaerah, addAdmin, deleteAdmin, addSchool, deleteSchool } from '../services/api';
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
    if (!newAdminUsername || !newAdminPassword || !newAdminRole) {
      showMessage('Sila isi Username, Password dan Role', 'error');
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
      const result = await addAdmin(scriptUrl, {
        username: newAdminUsername,
        password: newAdminPassword,
        role: newAdminRole,
        negeriCode: newAdminNegeri,
        daerahCode: newAdminRole === 'daerah' ? newAdminDaerah : undefined,
        fullName: newAdminFullName,
        phone: newAdminPhone,
        email: newAdminEmail
      });
      if (result.status === 'success') {
        showMessage('Admin berjaya ditambah!', 'success');
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
                      <label className="block text-sm font-semibold mb-1">Username *</label>
                      <input
                        type="text"
                        value={newAdminUsername}
                        onChange={(e) => setNewAdminUsername(e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="ADMIN_PERAK"
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
                    <div>
                      <label className="block text-sm font-semibold mb-1">Email</label>
                      <input
                        type="email"
                        value={newAdminEmail}
                        onChange={(e) => setNewAdminEmail(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="admin@example.com"
                      />
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
            {!loading && activeTab === 'data' && (
              <div>
                <div className="mb-6">
                  <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                    <Shield size={20} />
                    Semua Data Penyertaan Lencana
                  </h3>
                  <p className="text-sm text-slate-600">
                    Jumlah keseluruhan: {submissionsData.length} penyertaan
                  </p>
                </div>

                {/* Submissions Table */}
                <div className="overflow-x-auto">
                  <table className="w-full bg-white border rounded-lg">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-3 text-left">Tarikh</th>
                        <th className="px-4 py-3 text-left">Sekolah</th>
                        <th className="px-4 py-3 text-left">Ketua Kumpulan</th>
                        <th className="px-4 py-3 text-left">Jenis Lencana</th>
                        <th className="px-4 py-3 text-center">Pelajar</th>
                        <th className="px-4 py-3 text-center">Pembantu</th>
                        <th className="px-4 py-3 text-center">Pemeriksa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissionsData.map((sub, idx) => (
                        <tr key={idx} className="border-t hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm">{sub.submissionDate || '-'}</td>
                          <td className="px-4 py-3">{sub.schoolName || '-'}</td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-semibold">{sub.leaderName || '-'}</div>
                            <div className="text-xs text-slate-500">{sub.leaderIcNumber || '-'}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                              {sub.badgeType || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">{sub.participants?.length || 0}</td>
                          <td className="px-4 py-3 text-center">{sub.assistants?.length || 0}</td>
                          <td className="px-4 py-3 text-center">{sub.examiners?.length || 0}</td>
                        </tr>
                      ))}
                      {submissionsData.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                            Tiada data penyertaan dijumpai
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="text-sm text-blue-600 font-semibold">Jumlah Penyertaan</div>
                    <div className="text-2xl font-bold text-blue-800">{submissionsData.length}</div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="text-sm text-green-600 font-semibold">Jumlah Pelajar</div>
                    <div className="text-2xl font-bold text-green-800">
                      {submissionsData.reduce((sum, sub) => sum + (sub.participants?.length || 0), 0)}
                    </div>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div className="text-sm text-purple-600 font-semibold">Jumlah Pembantu</div>
                    <div className="text-2xl font-bold text-purple-800">
                      {submissionsData.reduce((sum, sub) => sum + (sub.assistants?.length || 0), 0)}
                    </div>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <div className="text-sm text-orange-600 font-semibold">Jumlah Pemeriksa</div>
                    <div className="text-2xl font-bold text-orange-800">
                      {submissionsData.reduce((sum, sub) => sum + (sub.examiners?.length || 0), 0)}
                    </div>
                  </div>
                </div>
              </div>
            )}
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
