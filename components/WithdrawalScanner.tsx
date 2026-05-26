import React, { useEffect, useRef, useState } from 'react';
import { ScanLine, X, AlertTriangle, CheckCircle, Camera, Keyboard, RefreshCw } from 'lucide-react';
import jsQR from 'jsqr';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { withdrawParticipant } from '../services/supabaseApi';

export interface ParticipantQRData {
  v: string;
  type: 'participant';
  participantId: string;
  schoolCode: string;
  schoolName: string;
  badge: string;
  year: number;
  name: string;
  icNumber?: string;
}

const WITHDRAWAL_REASONS = [
  'Sakit',
  'Kecemasan keluarga',
  'Tidak selesa dengan persekitaran',
  'Disiplin',
  'Cuaca buruk',
  'Lain-lain',
];

interface WithdrawalScannerProps {
  onWithdrawn?: (data: ParticipantQRData, reason: string, notes: string) => void;
  className?: string;
}

export const WithdrawalScanner: React.FC<WithdrawalScannerProps> = ({ onWithdrawn, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [scanned, setScanned] = useState<ParticipantQRData | null>(null);
  const [scanMode, setScanMode] = useState<'camera' | 'manual'>('camera');
  const [manualInput, setManualInput] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [reason, setReason] = useState(WITHDRAWAL_REASONS[0]);
  const [otherReason, setOtherReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const parseQR = (text: string): ParticipantQRData | null => {
    try {
      const p = JSON.parse(text);
      if (p.type === 'participant' && p.participantId && p.schoolCode && p.badge) {
        return p as ParticipantQRData;
      }
    } catch {}
    return null;
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startCamera = async () => {
    setCameraError('');
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        scanLoop();
      }
    } catch (e: any) {
      setCameraError(e.message || 'Camera tak dapat dibuka.');
    }
  };

  const scanLoop = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      requestAnimationFrame(scanLoop);
      return;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code?.data) {
        const parsed = parseQR(code.data);
        if (parsed) {
          setScanned(parsed);
          stopCamera();
          return;
        }
      }
    } catch {}
    requestAnimationFrame(scanLoop);
  };

  useEffect(() => {
    if (isOpen && scanMode === 'camera' && !scanned) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, scanMode, scanned]);

  const handleManualSubmit = () => {
    const parsed = parseQR(manualInput.trim());
    if (parsed) {
      setScanned(parsed);
    } else {
      alert('QR tidak sah. Sila pastikan QR jenis peserta yang betul.');
    }
  };

  const handleSubmit = async () => {
    if (!scanned) return;
    const finalReason = reason === 'Lain-lain' ? otherReason.trim() : reason;
    if (reason === 'Lain-lain' && !finalReason) {
      alert('Sila nyatakan sebab tarik diri.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await withdrawParticipant(scanned.participantId, finalReason, notes);
      if (res.status === 'success') {
        setSuccess(true);
        onWithdrawn?.(scanned, finalReason, notes);
        setTimeout(() => {
          resetAll();
        }, 2000);
      } else {
        alert('Gagal: ' + res.message);
      }
    } catch (e: any) {
      alert('Ralat: ' + (e?.message || ''));
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setIsOpen(false);
    setScanned(null);
    setReason(WITHDRAWAL_REASONS[0]);
    setOtherReason('');
    setNotes('');
    setManualInput('');
    setSuccess(false);
  };

  return (
    <div className={className}>
      <button
        onClick={() => setIsOpen(true)}
        className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-700 flex items-center gap-2 shadow"
      >
        <ScanLine size={16} /> Tarik Diri Peserta
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => !submitting && resetAll()}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center bg-red-50">
              <h3 className="font-bold text-base flex items-center gap-2 text-red-800">
                <AlertTriangle size={18} /> Kemaskini Status Peserta (Tarik Diri)
              </h3>
              <button onClick={resetAll} disabled={submitting} className="p-1 hover:bg-red-100 rounded">
                <X size={18} />
              </button>
            </div>

            {success ? (
              <div className="p-8 text-center">
                <CheckCircle size={64} className="text-green-600 mx-auto mb-3" />
                <h4 className="text-xl font-bold text-green-700">Berjaya!</h4>
                <p className="text-sm text-gray-600 mt-2">{scanned?.name} telah dikeluarkan dari senarai aktif.</p>
              </div>
            ) : !scanned ? (
              <div className="p-5 overflow-y-auto flex-1">
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setScanMode('camera')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 ${scanMode === 'camera' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                  >
                    <Camera size={14} /> Camera
                  </button>
                  <button
                    onClick={() => setScanMode('manual')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 ${scanMode === 'manual' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                  >
                    <Keyboard size={14} /> Manual
                  </button>
                </div>

                {scanMode === 'camera' ? (
                  <div>
                    <div className="bg-black rounded-lg overflow-hidden aspect-video relative">
                      <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                      <canvas ref={canvasRef} className="hidden" />
                      <div className="absolute inset-0 border-4 border-red-400 rounded-lg pointer-events-none" />
                    </div>
                    {cameraError && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                        {cameraError}
                        <button onClick={startCamera} className="ml-2 underline font-bold"><RefreshCw size={10} className="inline" /> Cuba lagi</button>
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-2 text-center">Halakan kamera ke QR peserta yang nak ditarik balik</p>
                  </div>
                ) : (
                  <div>
                    <textarea
                      value={manualInput}
                      onChange={e => setManualInput(e.target.value)}
                      placeholder="Tampal kandungan QR peserta di sini..."
                      className="w-full p-3 border rounded-lg text-xs font-mono h-32"
                    />
                    <button
                      onClick={handleManualSubmit}
                      disabled={!manualInput.trim()}
                      className="mt-2 w-full bg-red-600 text-white py-2 rounded-lg font-bold text-sm disabled:opacity-50"
                    >
                      Sahkan QR
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-5 overflow-y-auto flex-1 space-y-4">
                {/* Maklumat peserta */}
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-[10px] font-bold text-amber-700 uppercase mb-2">Maklumat Peserta</p>
                  <div className="space-y-1 text-sm">
                    <div><strong>Nama:</strong> {scanned.name}</div>
                    {scanned.icNumber && <div><strong>No. KP:</strong> <span className="font-mono">{scanned.icNumber}</span></div>}
                    <div><strong>Sekolah:</strong> {scanned.schoolName} ({scanned.schoolCode})</div>
                    <div><strong>Program:</strong> {scanned.badge}</div>
                    <div><strong>Tarikh:</strong> {new Date().toLocaleDateString('ms-MY')} <strong>Masa:</strong> {new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Sebab Tarik Diri *</label>
                  <select
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    className="w-full p-2 border rounded-lg text-sm"
                  >
                    {WITHDRAWAL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>

                {reason === 'Lain-lain' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Nyatakan Sebab *</label>
                    <input
                      type="text"
                      value={otherReason}
                      onChange={e => setOtherReason(e.target.value)}
                      placeholder="Cth: Cedera bermain..."
                      className="w-full p-2 border rounded-lg text-sm"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Nota Tambahan (pilihan)</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Cth: Diiringi oleh ibu bapa..."
                    className="w-full p-2 border rounded-lg text-sm h-20"
                  />
                </div>

                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  <strong>Amaran:</strong> Selepas disahkan, peserta akan dikeluarkan dari senarai aktif dan status akan dikemaskini. Kehadiran QR juga tidak akan diambil kira.
                </div>
              </div>
            )}

            {!success && scanned && (
              <div className="p-4 border-t flex justify-end gap-2 bg-gray-50">
                <button onClick={() => { setScanned(null); }} disabled={submitting} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Scan Semula</button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || (reason === 'Lain-lain' && !otherReason.trim())}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-1 font-bold disabled:opacity-50"
                >
                  {submitting ? <LoadingSpinner size="sm" color="border-white" /> : <CheckCircle size={14} />}
                  {submitting ? 'Menyimpan...' : 'Sahkan Tarik Diri'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
