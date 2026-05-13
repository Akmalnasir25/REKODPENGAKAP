import React, { useState } from 'react';
import { User, Mail, Phone, MapPin, Award, Save, X } from 'lucide-react';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  school?: string;
  participantId?: string;
  badges?: string[];
  joinDate?: string;
  groupNumber?: string;
  principalName?: string;
  principalPhone?: string;
  leaderName?: string;
  leaderPhone?: string;
  leaderIC?: string;
  leaderGender?: string;
  leaderMembershipId?: string;
  leaderRace?: string;
  remarks?: string;
}

interface UserProfilePageProps {
  profile: UserProfile;
  onSave: (updatedProfile: UserProfile) => Promise<void>;
  onClose: () => void;
}

export const UserProfilePage: React.FC<UserProfilePageProps> = ({
  profile,
  onSave,
  onClose
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState(profile);

  const handleChange = (field: keyof UserProfile, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(formData);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Gagal menyimpan profil');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <User className="w-6 h-6" />
            Profil Anda
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Avatar & Basic Info */}
          <div className="flex items-center gap-4 pb-6 border-b border-gray-200">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center">
              <User className="w-10 h-10 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{formData.name}</h3>
              <p className="text-sm text-gray-600">{formData.participantId || 'ID Peserta Tidak Ditetapkan'}</p>
            </div>
          </div>

          {/* Basic Personal Information */}
          {isEditing ? (
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled
                />
                <p className="text-xs text-gray-500 mt-1">Tidak boleh diubah</p>
              </div>

              {/* Kod Sekolah */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kod Sekolah
                </label>
                <input
                  type="text"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  No. Telefon
                </label>
                <input
                  type="tel"
                  value={formData.phone || ''}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="+60..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* School */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sekolah
                </label>
                <input
                  type="text"
                  value={formData.school || ''}
                  onChange={(e) => handleChange('school', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled
                />
                <p className="text-xs text-gray-500 mt-1">Tidak boleh diubah</p>
              </div>

              {/* Group Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  No. Kumpulan (Nombor Sekolah)
                </label>
                <input
                  type="text"
                  value={formData.groupNumber || ''}
                  onChange={(e) => handleChange('groupNumber', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Kod Sekolah Display */}
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Kod Sekolah</p>
                  <p className="text-gray-900">{formData.email}</p>
                </div>
              </div>

              {/* Phone Display */}
              {formData.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">No. Telefon</p>
                    <p className="text-gray-900">{formData.phone}</p>
                  </div>
                </div>
              )}

              {/* School Display */}
              {formData.school && (
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Sekolah</p>
                    <p className="text-gray-900">{formData.school}</p>
                  </div>
                </div>
              )}

              {/* Group Number Display */}
              {formData.groupNumber && (
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">No. Kumpulan</p>
                    <p className="text-gray-900">{formData.groupNumber}</p>
                  </div>
                </div>
              )}

              {/* Join Date */}
              {formData.joinDate && (
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Tarikh Pendaftaran</p>
                    <p className="text-gray-900">
                      {new Date(formData.joinDate).toLocaleDateString('ms-MY')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Principal Information Section */}
          <div className="pt-6 border-t border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-3">Maklumat Pengetua/Guru Besar</h4>
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nama Pengetua/Guru Besar
                  </label>
                  <input
                    type="text"
                    value={formData.principalName || ''}
                    onChange={(e) => handleChange('principalName', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    No. Telefon Pengetua
                  </label>
                  <input
                    type="tel"
                    value={formData.principalPhone || ''}
                    onChange={(e) => handleChange('principalPhone', e.target.value)}
                    placeholder="+60..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm bg-gray-50 p-3 rounded">
                <p><span className="text-gray-500">Nama:</span> <span className="text-gray-900 font-medium">{formData.principalName || '-'}</span></p>
                <p><span className="text-gray-500">Telefon:</span> <span className="text-gray-900 font-medium">{formData.principalPhone || '-'}</span></p>
              </div>
            )}
          </div>

          {/* Leader Information Section */}
          <div className="pt-6 border-t border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-3">Maklumat Pemimpin Utama</h4>
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nama Pemimpin Utama
                  </label>
                  <input
                    type="text"
                    value={formData.leaderName || ''}
                    onChange={(e) => handleChange('leaderName', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    No. Telefon Pemimpin
                  </label>
                  <input
                    type="tel"
                    value={formData.leaderPhone || ''}
                    onChange={(e) => handleChange('leaderPhone', e.target.value)}
                    placeholder="+60..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    No. Kad Pengenalan Pemimpin
                  </label>
                  <input
                    type="text"
                    value={formData.leaderIC || ''}
                    onChange={(e) => {
                      handleChange('leaderIC', e.target.value);
                      // Auto-detect gender from IC last digit
                      const cleanIC = e.target.value.replace(/[^0-9]/g, '');
                      if (cleanIC.length > 0) {
                        const lastDigit = parseInt(cleanIC.slice(-1));
                        if (!isNaN(lastDigit)) {
                          handleChange('leaderGender', lastDigit % 2 === 0 ? 'Perempuan' : 'Lelaki');
                        }
                      }
                    }}
                    placeholder="Contoh: 850101-14-5678"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1 italic">Jantina akan auto-detect dari digit terakhir IC</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Jantina Pemimpin
                  </label>
                  <select
                    value={formData.leaderGender || ''}
                    onChange={(e) => handleChange('leaderGender', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Sila Pilih</option>
                    <option>Lelaki</option>
                    <option>Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    No. Kad Keahlian Pemimpin (Pilihan)
                  </label>
                  <input
                    type="text"
                    value={formData.leaderMembershipId || ''}
                    onChange={(e) => handleChange('leaderMembershipId', e.target.value)}
                    placeholder="Tidak diwajibkan"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bangsa/Kaum
                  </label>
                  <select
                    value={formData.leaderRace || ''}
                    onChange={(e) => handleChange('leaderRace', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Sila Pilih</option>
                    <option>Melayu</option>
                    <option>Cina</option>
                    <option>India</option>
                    <option>Bumiputera Sabah</option>
                    <option>Bumiputera Sarawak</option>
                    <option>Lain-lain</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm bg-gray-50 p-3 rounded">
                <p><span className="text-gray-500">Nama:</span> <span className="text-gray-900 font-medium">{formData.leaderName || '-'}</span></p>
                <p><span className="text-gray-500">Telefon:</span> <span className="text-gray-900 font-medium">{formData.leaderPhone || '-'}</span></p>
                <p><span className="text-gray-500">No. Kad Pengenalan:</span> <span className="text-gray-900 font-medium">{formData.leaderIC || '-'}</span></p>
                <p><span className="text-gray-500">Jantina:</span> <span className="text-gray-900 font-medium">{formData.leaderGender || '-'}</span></p>
                <p><span className="text-gray-500">No. Kad Keahlian:</span> <span className="text-gray-900 font-medium">{formData.leaderMembershipId || '-'}</span></p>
                <p><span className="text-gray-500">Bangsa:</span> <span className="text-gray-900 font-medium">{formData.leaderRace || '-'}</span></p>
              </div>
            )}
          </div>

          {/* Additional Remarks Section */}
          <div className="pt-6 border-t border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-3">Maklumat Tambahan</h4>
            {isEditing ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Catatan/Ulasan
                </label>
                <textarea
                  value={formData.remarks || ''}
                  onChange={(e) => handleChange('remarks', e.target.value)}
                  placeholder="Tambahkan catatan atau ulasan..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
                <p className="text-xs text-gray-500 mt-1 italic">Maklumat ini akan kekal untuk kesemua jenis pendaftaran</p>
              </div>
            ) : (
              <div className="text-sm bg-gray-50 p-3 rounded">
                <p className="text-gray-900 whitespace-pre-wrap">{formData.remarks || '-'}</p>
                <p className="text-xs text-gray-500 mt-2 italic">Maklumat ini akan kekal untuk kesemua jenis pendaftaran</p>
              </div>
            )}
          </div>

          {/* Badges Section */}
          {formData.badges && formData.badges.length > 0 && (
            <div className="pt-6 border-t border-gray-200">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <Award className="w-5 h-5" />
                Anugerah Anda
              </h4>
              <div className="flex flex-wrap gap-2">
                {formData.badges.map(badge => (
                  <span
                    key={badge}
                    className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-6 border-t border-gray-200">
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
                <button
                  onClick={() => {
                    setFormData(profile);
                    setIsEditing(false);
                  }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Batal
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition-colors"
              >
                Edit Profil
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
