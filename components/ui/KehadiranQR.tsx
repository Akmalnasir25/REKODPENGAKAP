import React, { useState, useMemo, useEffect } from "react";
import QRCode from "qrcode";
import { QrCode, Printer, X } from "lucide-react";
import { SubmissionData } from "../../types";

/**
 * QR PESERTA UNTUK KEHADIRAN & TARIK DIRI
 *
 * Bukan QR kad peserta. Kad menggunakan token kekal dan hidup dalam
 * ParticipantQRGenerator; yang ini menghasilkan muatan yang dijangka oleh
 * WithdrawalScanner:
 *
 *   { v: "1", type: "participant", participantId, schoolCode, badge, ... }
 *
 * Kedua-duanya pernah berkongsi satu komponen. Semasa kad diperkenalkan
 * (79e8a90), komponen itu ditulis semula menjadi penjana kad sambil
 * mengekalkan namanya, dan pemanggilnya dalam papan pemuka sekolah dibuang.
 * Akibatnya tiada apa lagi menghasilkan muatan type participant — pengimbas
 * tarik diri kekal menunggu bentuk yang tiada sesiapa hasilkan.
 *
 * Dipisahkan dan dinamakan ikut fungsi supaya penulisan semula pada satu
 * tidak boleh senyap mematikan satu lagi.
 */
interface KehadiranQRGeneratorProps {
  data: SubmissionData[];
  year?: number;
  className?: string;
}

export const KehadiranQRGenerator: React.FC<KehadiranQRGeneratorProps> = ({ data, year = new Date().getFullYear(), className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<string>('');
  const [search, setSearch] = useState('');
  const [selectedParticipant, setSelectedParticipant] = useState<SubmissionData | null>(null);

  const yearData = useMemo(() => data.filter(d => {
    try { return new Date(d.date).getFullYear() === year; } catch { return false; }
  }).filter(d => !(d as any).isWithdrawn), [data, year]);

  const badges = useMemo(() => {
    return Array.from(new Set(yearData.map(d => d.badge).filter(Boolean))).sort();
  }, [yearData]);

  const filteredParticipants = useMemo(() => {
    let list = yearData;
    if (selectedBadge) list = list.filter(d => d.badge === selectedBadge);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        (d.student || '').toLowerCase().includes(q) ||
        (d.icNumber || '').toLowerCase().includes(q) ||
        (d.id || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => (a.student || '').localeCompare(b.student || ''));
  }, [yearData, selectedBadge, search]);

  const buildQrPayload = (item: any) => JSON.stringify({
    v: '1',
    type: 'participant',
    participantId: item.participantId || '',
    schoolCode: item.schoolCode || '',
    schoolName: item.school || '',
    badge: item.badge || '',
    year,
    name: item.student || '',
    icNumber: item.icNumber || '',
  });

  // QR dijana TEMPATAN. Versi asal memuatkannya dari api.qrserver.com,
  // bermakna setiap kod memerlukan internet pada saat ia dipapar — dan ia
  // dipapar di tapak perkhemahan, tempat talian paling tidak boleh dipercayai.
  // Pustaka qrcode sudah ada dalam projek dan digunakan oleh penjana kad.
  const janaQr = (item: any, saiz: number) =>
    QRCode.toDataURL(buildQrPayload(item), { width: saiz, margin: 1 });

  // Muatan berubah bila peserta bertukar, jadi imej dijana semula. Bendera
  // batal menghalang hasil panggilan lama menimpa yang baharu.
  const [qrTerpilih, setQrTerpilih] = useState('');
  useEffect(() => {
    if (!selectedParticipant) { setQrTerpilih(''); return; }
    let batal = false;
    janaQr(selectedParticipant, 400).then(url => { if (!batal) setQrTerpilih(url); })
      .catch(() => { if (!batal) setQrTerpilih(''); });
    return () => { batal = true; };
  }, [selectedParticipant]);

  const handlePrintAll = async () => {
    // Semua imej dijana SEBELUM HTML dibina — templat itu rentetan biasa,
    // jadi ia tidak boleh menunggu janji di dalam map().
    const senarai = await Promise.all(
      filteredParticipants.map(async p => ({ p, qrUrl: await janaQr(p, 200) })),
    );
    const html = `<!DOCTYPE html><html><head><title>QR Peserta</title>
<style>
  @page { size: A4; margin: 10mm; }
  body { font-family: Arial; margin: 0; padding: 0; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm; padding: 5mm; }
  .card { border: 1px solid #000; padding: 6mm; text-align: center; page-break-inside: avoid; }
  .card .name { font-size: 11px; font-weight: bold; margin-top: 4mm; }
  .card .ic { font-size: 9px; font-family: monospace; color: #555; }
  .card .school { font-size: 9px; color: #777; margin-top: 2mm; }
  .card .badge { display: inline-block; background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 8px; font-size: 8px; font-weight: bold; margin-top: 2mm; }
  .card img { width: 35mm; height: 35mm; }
  .card .label { font-size: 7px; color: #aaa; margin-top: 1mm; }
</style></head><body>
  <div class="grid">
    ${senarai.map(({ p, qrUrl }) => {
      return `<div class="card">
        <img src="${qrUrl}" alt="QR" />
        <div class="name">${(p.student || '').toUpperCase()}</div>
        ${p.icNumber ? `<div class="ic">${p.icNumber}</div>` : ''}
        <div class="school">${p.school || ''}${p.schoolCode ? ` (${p.schoolCode})` : ''}</div>
        <div class="badge">${p.badge}</div>
        <div class="label">QR STATUS PESERTA</div>
      </div>`;
    }).join('')}
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 800);</script>
</body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const handlePrintSingle = async (p: SubmissionData) => {
    const qrUrl = await janaQr(p, 400);
    const html = `<!DOCTYPE html><html><head><title>QR ${p.student}</title>
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: Arial; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .card { border: 2px solid #000; padding: 12mm; text-align: center; max-width: 100mm; }
  .card .name { font-size: 18px; font-weight: bold; margin-top: 6mm; }
  .card .ic { font-size: 13px; font-family: monospace; color: #555; margin-top: 2mm; }
  .card .school { font-size: 12px; color: #777; margin-top: 4mm; }
  .card .badge { display: inline-block; background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: bold; margin-top: 4mm; }
  .card img { width: 70mm; height: 70mm; }
  .card .label { font-size: 10px; color: #aaa; margin-top: 4mm; letter-spacing: 1px; }
</style></head><body>
  <div class="card">
    <img src="${qrUrl}" alt="QR" />
    <div class="name">${(p.student || '').toUpperCase()}</div>
    ${p.icNumber ? `<div class="ic">${p.icNumber}</div>` : ''}
    <div class="school">${p.school || ''}${p.schoolCode ? ` (${p.schoolCode})` : ''}</div>
    <div class="badge">${p.badge}</div>
    <div class="label">QR STATUS PESERTA</div>
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 800);</script>
</body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        onClick={() => setIsOpen(true)}
        disabled={yearData.length === 0}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition shadow-sm border ${yearData.length === 0 ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'}`}
      >
        <QrCode size={14} /> QR Peserta
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => { setIsOpen(false); setSelectedParticipant(null); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-base flex items-center gap-2">
                <QrCode size={18} className="text-amber-600" /> {selectedParticipant ? 'QR Peserta' : 'QR Status Peserta (Tarik Diri)'}
              </h3>
              <button onClick={() => { setIsOpen(false); setSelectedParticipant(null); }} className="p-1 hover:bg-gray-100 rounded">
                <X size={18} />
              </button>
            </div>

            {selectedParticipant ? (
              <div className="p-5 overflow-y-auto flex-1 flex flex-col items-center">
                <button
                  onClick={() => setSelectedParticipant(null)}
                  className="self-start mb-3 text-xs font-bold text-gray-600 hover:text-gray-900 flex items-center gap-1"
                >
                  ← Kembali ke senarai
                </button>
                <div className="border-2 border-gray-300 rounded-lg p-6 bg-white text-center max-w-sm w-full">
                  <img
                    src={qrTerpilih}
                    alt="QR"
                    className="mx-auto"
                    style={{ width: '70mm', height: '70mm' }}
                  />
                  <div className="font-bold text-base mt-3 uppercase">{selectedParticipant.student}</div>
                  {selectedParticipant.icNumber && <div className="text-xs font-mono text-gray-600 mt-1">{selectedParticipant.icNumber}</div>}
                  <div className="text-xs text-gray-500 mt-2">{selectedParticipant.school}{selectedParticipant.schoolCode ? ` (${selectedParticipant.schoolCode})` : ''}</div>
                  <div className="inline-block bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-bold mt-3">{selectedParticipant.badge}</div>
                  <div className="text-[10px] text-gray-400 mt-3 tracking-widest">QR STATUS PESERTA</div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => handlePrintSingle(selectedParticipant)}
                    className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 flex items-center gap-1 font-bold"
                  >
                    <Printer size={14} /> Cetak QR Ini
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-3 text-center max-w-sm">Tunjuk QR ini kepada urusetia (admin daerah/negeri) untuk merekod status tarik diri.</p>
              </div>
            ) : (
              <>
                <div className="p-5 overflow-y-auto space-y-3 flex-1">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                    Cari nama peserta yang nak tarik diri, klik untuk papar QR. Tunjuk skrin QR pada urusetia atau cetak satu sahaja.
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Cari nama, IC, ID..."
                      className="p-2 border rounded-lg text-sm"
                    />
                    <select value={selectedBadge} onChange={e => setSelectedBadge(e.target.value)} className="p-2 border rounded-lg text-sm">
                      <option value="">Semua Program ({yearData.length})</option>
                      {badges.map(b => {
                        const count = yearData.filter(d => d.badge === b).length;
                        return <option key={b} value={b}>{b} ({count})</option>;
                      })}
                    </select>
                  </div>

                  <div className="border rounded-lg max-h-72 overflow-y-auto bg-gray-50">
                    {filteredParticipants.length === 0 ? (
                      <p className="p-4 text-center text-xs text-gray-400 italic">Tiada peserta dijumpai.</p>
                    ) : (
                      filteredParticipants.map((p, i) => (
                        <button
                          key={p.participantId || i}
                          onClick={() => setSelectedParticipant(p)}
                          className="w-full px-3 py-2 border-b last:border-0 hover:bg-amber-50 text-left flex items-center justify-between gap-2 transition"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold uppercase truncate">{p.student}</div>
                            <div className="text-[10px] text-gray-500 truncate">
                              {p.icNumber ? <span className="font-mono">{p.icNumber}</span> : ''} {p.role && <span className="ml-1">| {p.role}</span>} {p.badge && <span className="ml-1">| {p.badge}</span>}
                            </div>
                          </div>
                          <QrCode size={14} className="text-amber-600 flex-shrink-0" />
                        </button>
                      ))
                    )}
                  </div>

                  <div className="text-xs text-gray-600">
                    <strong>{filteredParticipants.length}</strong> peserta dipaparkan dari {yearData.length}
                  </div>
                </div>

                <div className="p-4 border-t flex justify-between items-center gap-2 bg-gray-50">
                  <span className="text-[10px] text-gray-500">Boleh juga cetak semua QR sekaligus dalam satu helai A4</span>
                  <div className="flex gap-2">
                    <button onClick={() => { setIsOpen(false); setSelectedParticipant(null); }} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Tutup</button>
                    <button
                      onClick={handlePrintAll}
                      disabled={filteredParticipants.length === 0}
                      className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 flex items-center gap-1 font-bold disabled:opacity-50"
                    >
                      <Printer size={14} /> Cetak Semua ({filteredParticipants.length})
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
