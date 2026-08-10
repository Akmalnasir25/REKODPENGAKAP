import React, { useEffect, useState } from 'react';
import { CreditCard, ShieldCheck, AlertTriangle, Loader2, Landmark } from 'lucide-react';
import { getGatewaySettings, saveGatewaySettings, GatewaySettings } from '../services/gatewayService';

interface Props {
  scope: 'negeri' | 'daerah';
  code: string;
  label: string;
}

/**
 * Tetapan akaun pembayaran bagi satu skop (negeri atau daerah).
 *
 * Setiap skop mengutip ke akaun sendiri. Daerah tanpa akaun ToyyibPay masih
 * boleh menerima bayaran manual — mereka cuma perlu mengisi maklumat akaun
 * bank, dan skrin bayaran akan menawarkan pindahan bank & cek sahaja.
 *
 * Kunci rahsia hanya bergerak SATU ARAH. Selepas disimpan ia tidak pernah
 * dibaca balik ke sini; medan kekal kosong dan hanya 4 aksara terakhir
 * dipaparkan.
 */
export const GatewaySettingsCard: React.FC<Props> = ({ scope, code, label }) => {
  const [sedia, setSedia] = useState<GatewaySettings | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [menyimpan, setMenyimpan] = useState(false);
  const [mesej, setMesej] = useState<{ jenis: 'ok' | 'ralat'; teks: string } | null>(null);

  const [categoryCode, setCategoryCode] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [bankInfo, setBankInfo] = useState('');
  const [caj, setCaj] = useState('1.00');
  const [sandbox, setSandbox] = useState(true);
  // Togol paparan kaedah bayaran. Lalai BENAR — tetapan lama tanpa lajur ini
  // tidak sepatutnya mematikan bayaran manual apabila disimpan semula.
  const [bolehFpx, setBolehFpx] = useState(true);
  const [bolehPindahan, setBolehPindahan] = useState(true);
  const [bolehCek, setBolehCek] = useState(true);

  const muat = async () => {
    setMemuat(true);
    const s = await getGatewaySettings(scope, code);
    setSedia(s);
    if (s) {
      setCategoryCode(s.categoryCode || '');
      setBankInfo(s.bankAccountInfo || '');
      setCaj(String(s.transactionFeeFlat ?? 1));
      setSandbox(s.isSandbox);
      setBolehFpx(s.allowFpx ?? true);
      setBolehPindahan(s.allowBankTransfer ?? true);
      setBolehCek(s.allowCheque ?? true);
    }
    setSecretKey('');   // tidak pernah diisi semula
    setMemuat(false);
  };

  useEffect(() => { muat(); }, [scope, code]);

  const simpan = async () => {
    setMenyimpan(true);
    setMesej(null);
    const res = await saveGatewaySettings({
      scope,
      negeriCode: scope === 'negeri' ? code : undefined,
      daerahCode: scope === 'daerah' ? code : undefined,
      categoryCode: categoryCode.trim(),
      userSecretKey: secretKey.trim() || undefined,
      bankAccountInfo: bankInfo.trim() || undefined,
      transactionFeeFlat: caj.trim() ? Number(caj) : 1,
      isSandbox: sandbox,
      allowFpx: bolehFpx,
      allowBankTransfer: bolehPindahan,
      allowCheque: bolehCek,
    });
    setMesej({ jenis: res.status === 'success' ? 'ok' : 'ralat', teks: res.message || '' });
    if (res.status === 'success') await muat();
    setMenyimpan(false);
  };

  if (memuat) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-2 text-sm text-gray-400">
        <Loader2 size={16} className="animate-spin" /> Memuat tetapan pembayaran…
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
      <div className="bg-slate-50 px-4 py-3 border-b flex items-center justify-between">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <CreditCard size={16} className="text-emerald-600" /> Akaun Pembayaran — {label}
        </h3>
        {sedia?.isActive ? (
          <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center gap-1">
            <ShieldCheck size={11} /> {sedia.isSandbox ? 'SANDBOX' : 'PRODUKSI'} · disahkan
          </span>
        ) : (
          <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
            Belum ditetapkan
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        <p className="text-[11px] text-gray-500">
          Setiap daerah/negeri mengutip ke akaun sendiri. <strong>Tanpa akaun ToyyibPay,
          bayaran manual masih berfungsi</strong> — isi maklumat akaun bank sahaja, dan skrin
          bayaran akan menawarkan pindahan bank &amp; cek.
        </p>

        {/* Sandbox / Produksi */}
        <div className="flex items-center gap-2">
          {([[true, 'Sandbox'], [false, 'Produksi']] as [boolean, string][]).map(([nilai, teks]) => (
            <button
              key={teks}
              type="button"
              onClick={() => setSandbox(nilai)}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-full border transition ${
                sandbox === nilai
                  ? nilai ? 'bg-amber-500 text-white border-amber-500' : 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {teks}
            </button>
          ))}
          {!sandbox && (
            <span className="text-[10px] text-red-600 font-bold flex items-center gap-1">
              <AlertTriangle size={11} /> Duit sebenar akan bergerak
            </span>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-0.5">Kod Kategori ToyyibPay</label>
          <input
            value={categoryCode}
            onChange={(e) => setCategoryCode(e.target.value)}
            placeholder="Cth: c4ajt1mb"
            className="w-full p-2 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-emerald-400 outline-none"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-0.5">
            Kunci Rahsia (userSecretKey)
            {sedia?.maskedKey && <span className="ml-2 font-mono text-gray-400">tersimpan: {sedia.maskedKey}</span>}
          </label>
          <input
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder={sedia?.maskedKey ? 'Biar kosong untuk kekalkan kunci sedia ada' : 'Tampal kunci dari dashboard ToyyibPay'}
            autoComplete="off"
            className="w-full p-2 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-emerald-400 outline-none"
          />
          <p className="text-[10px] text-gray-400 mt-1">
            Disimpan dalam Supabase Vault, bukan dalam jadual biasa. Tidak pernah dipulangkan ke pelayar
            selepas disimpan.
          </p>
        </div>

        {/* KAEDAH BAYARAN YANG DIPAPARKAN KEPADA SEKOLAH */}
        <div className="border border-gray-200 rounded-lg p-3">
          <p className="text-[11px] font-bold text-gray-600 uppercase mb-0.5">Kaedah Bayaran Dibuka</p>
          <p className="text-[10px] text-gray-400 mb-2">
            Hanya kaedah yang dihidupkan muncul pada skrin bayaran sekolah.
          </p>
          {([
            ['FPX / Online', bolehFpx, setBolehFpx,
             'Memerlukan kredensial sah di atas. Togol ini tidak boleh menghidupkannya tanpa akaun yang berfungsi.'],
            ['Pindahan Bank', bolehPindahan, setBolehPindahan,
             'Sekolah membayar ke akaun di bawah, kemudian memuat naik resit.'],
            ['Cek', bolehCek, setBolehCek,
             'Sekolah merekod no. cek dan memuat naik gambarnya.'],
          ] as [string, boolean, (v: boolean) => void, string][]).map(([label, nilai, tetap, nota]) => (
            <label key={label} className="flex items-start justify-between gap-3 py-1.5 cursor-pointer">
              <span>
                <span className="block text-sm font-semibold text-gray-700">{label}</span>
                <span className="block text-[10px] text-gray-400">{nota}</span>
              </span>
              <input
                type="checkbox"
                checked={nilai}
                onChange={(e) => tetap(e.target.checked)}
                className="w-5 h-5 accent-emerald-600 shrink-0 mt-0.5"
              />
            </label>
          ))}
          {!bolehFpx && !bolehPindahan && !bolehCek && (
            <p className="text-[10px] text-red-600 font-semibold bg-red-50 border border-red-200 rounded p-2 mt-1">
              Semua kaedah ditutup. Sekolah dalam skop ini tidak akan dapat membayar langsung.
            </p>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-0.5 flex items-center gap-1">
            <Landmark size={12} /> Maklumat Akaun Bank (untuk bayaran manual)
          </label>
          <textarea
            value={bankInfo}
            onChange={(e) => setBankInfo(e.target.value)}
            rows={2}
            placeholder={'Cth: Maybank 1234 5678 9012\nPPM Daerah Kinta Utara'}
            className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-400 outline-none"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-0.5">Caj Transaksi FPX (RM)</label>
          <input
            type="number" min="0" step="0.01"
            value={caj}
            onChange={(e) => setCaj(e.target.value)}
            className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-400 outline-none"
          />
          <p className="text-[10px] text-gray-400 mt-1">Ditambah atas yuran; sekolah membayar jumlah ini.</p>
        </div>

        {mesej && (
          <div className={`text-[11px] font-semibold p-2 rounded-lg ${
            mesej.jenis === 'ok' ? 'bg-green-50 text-green-700 border border-green-200'
                                 : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {mesej.teks}
          </div>
        )}

        <button
          onClick={simpan}
          disabled={menyimpan || !categoryCode.trim()}
          className="w-full py-2.5 rounded-lg font-bold text-white flex items-center justify-center gap-2 transition bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {menyimpan ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          {menyimpan ? 'Menguji sambungan…' : 'Simpan & Uji Sambungan'}
        </button>
        <p className="text-[10px] text-gray-400 text-center">
          Kredensial diuji dengan ToyyibPay sebelum disimpan. Kunci yang salah ditolak di sini,
          bukan ketika sekolah pertama cuba membayar.
        </p>
      </div>
    </div>
  );
};
