import React, { useState } from 'react';
import { Shield, X, ChevronDown, ChevronUp } from 'lucide-react';

interface PrivacyNoticeProps {
  onAccept?: () => void;
  compact?: boolean;
}

export function PrivacyNotice({ onAccept, compact = false }: PrivacyNoticeProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (compact) {
    return (
      <div className="text-[10px] text-slate-400 leading-relaxed">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors font-semibold"
        >
          <Shield size={10} />
          Notis Privasi PDPA
          {isOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
        {isOpen && (
          <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200 text-left space-y-2">
            <PrivacyContent />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden">
        <div className="bg-blue-900 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="text-white" size={20} />
            <h2 className="text-white font-bold text-sm">Notis Privasi & Perlindungan Data</h2>
          </div>
          <button onClick={onAccept} className="text-blue-200 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 text-xs text-slate-600 leading-relaxed space-y-3">
          <PrivacyContent />
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={onAccept}
            className="w-full bg-blue-900 hover:bg-blue-800 text-white font-bold py-3 rounded-lg transition-colors text-sm"
          >
            Saya Faham & Setuju
          </button>
        </div>
      </div>
    </div>
  );
}

function PrivacyContent() {
  return (
    <>
      <p className="font-bold text-slate-700 text-sm">Akta Perlindungan Data Peribadi 2010 (PDPA)</p>
      <p>Sistem Pendaftaran Pengakap Malaysia ("Sistem") memproses data peribadi anda selaras dengan Akta Perlindungan Data Peribadi 2010 (Akta 709).</p>

      <p className="font-bold text-slate-700">1. Jenis Data Dikumpul</p>
      <ul className="list-disc pl-4 space-y-0.5">
        <li>Nama penuh, No. Kad Pengenalan, No. Telefon</li>
        <li>Maklumat sekolah dan kumpulan pengakap</li>
        <li>Jantina, bangsa, kategori keahlian</li>
        <li>Maklumat kesihatan dan keperluan pemakanan khas</li>
        <li>No. Keahlian Pengakap</li>
      </ul>

      <p className="font-bold text-slate-700">2. Tujuan Pemprosesan</p>
      <ul className="list-disc pl-4 space-y-0.5">
        <li>Pendaftaran dan pengurusan ahli pengakap</li>
        <li>Pengurusan kehadiran dan aktiviti</li>
        <li>Penganugerahan lencana dan sijil</li>
        <li>Keselamatan dan kecemasan semasa aktiviti</li>
        <li>Pelaporan kepada Persatuan Pengakap Malaysia</li>
      </ul>

      <p className="font-bold text-slate-700">3. Siapa Boleh Akses</p>
      <ul className="list-disc pl-4 space-y-0.5">
        <li>Admin sekolah anda</li>
        <li>Admin daerah dan negeri berkaitan</li>
        <li>Pentadbir sistem (developer)</li>
      </ul>

      <p className="font-bold text-slate-700">4. Tempoh Penahanan</p>
      <p>Data akan disimpan selama tempoh keahlian aktif ditambah <strong>7 tahun</strong> selepas tamat keahlian atau tarikh akhir aktiviti, kemudian dipadam secara automatik.</p>

      <p className="font-bold text-slate-700">5. Hak Anda</p>
      <ul className="list-disc pl-4 space-y-0.5">
        <li>Akses data peribadi yang disimpan</li>
        <li>Membetulkan data yang tidak tepat</li>
        <li>Meminta penarikan balik data (tertakluk kepada keperluan undang-undang)</li>
        <li>Membuat aduan kepada Pesuruhjaya Perlindungan Data Peribadi</li>
      </ul>

      <p className="font-bold text-slate-700">6. Data Sensitif</p>
      <p>Maklumat kesihatan dikategorikan sebagai <strong>data sensitif</strong> bawah Seksyen 40 PDPA. Data ini hanya digunakan untuk tujuan keselamatan semasa aktiviti dan memerlukan persetujuan eksplisit anda.</p>

      <p className="font-bold text-slate-700">7. Hubungi Kami</p>
      <p>Pegawai Perlindungan Data (DPO): <strong>Meja Bantuan ScoutNadi</strong><br/>Telegram: <a href="https://t.me/AkmalNasir" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">@AkmalNasir</a></p>
    </>
  );
}
