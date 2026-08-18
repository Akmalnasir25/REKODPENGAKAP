import React, { useState, useEffect, useRef, useMemo } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import jsPDF from 'jspdf';
import { QrCode, Download, Printer, X, CheckCircle, School, Users, ScanLine, Camera, Keyboard, Link2 } from 'lucide-react';
import { SubmissionData } from '../../types';
import { LOGO_URL } from '../../constants';
import { ensureParticipantCards, normalizeIcNumber, relinkParticipantCard } from '../../services/supabaseApi';
import { getLogoUrl } from '../../services/logoService';

/**
 * QR Verification System - Per Sekolah
 * Scan satu QR = sahkan kehadiran SEMUA peserta sekolah tersebut
 */

interface SchoolQRData {
  v: 3; // compact school-based QR
  schoolCode: string;
  schoolName: string;
  badge: string;
  year: number;
  totalParticipants: number;
  generatedAt: string;
  ref: string;
}

interface SchoolGroup {
  schoolCode: string;
  schoolName: string;
  badge: string;
  participants: SubmissionData[];
}

const safeGetYear = (value: unknown): number | null => {
  if (!value) return null;
  const date = new Date(value as string);
  return isNaN(date.getTime()) ? null : date.getFullYear();
};

/**
 * Generate QR payload for a school group
 */
const generateSchoolQRPayload = (group: SchoolGroup, year: number): string => {
  const ref = `${group.schoolCode}-${group.badge.replace(/\s/g, '')}-${year}`.toUpperCase();
  const payload: SchoolQRData = {
    v: 3,
    schoolCode: group.schoolCode,
    schoolName: group.schoolName,
    badge: group.badge,
    year,
    totalParticipants: group.participants.length,
    generatedAt: new Date().toISOString(),
    ref,
  };
  return JSON.stringify(payload);
};

/**
 * Attendance record stored in localStorage
 */
interface AttendanceRecord {
  schoolCode: string;
  schoolName: string;
  badge: string;
  year: number;
  verifiedAt: number;
  verifiedBy: string;
  totalParticipants: number;
  participants: string[]; // names, if available
}

const ATTENDANCE_KEY = 'ATTENDANCE_RECORDS';

const getAttendanceRecords = (): AttendanceRecord[] => {
  try {
    const stored = localStorage.getItem(ATTENDANCE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
};

const saveAttendanceRecord = (record: AttendanceRecord) => {
  const records = getAttendanceRecords();
  records.unshift(record);
  localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(records.slice(0, 200)));
};

/**
 * School QR Code Generator - generates one QR per school+badge combo
 */
interface SchoolQRGeneratorProps {
  data: SubmissionData[];
  year?: number;
  className?: string;
}

export const SchoolQRGenerator: React.FC<SchoolQRGeneratorProps> = ({ data, year = new Date().getFullYear(), className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [qrImages, setQrImages] = useState<{ group: SchoolGroup; dataUrl: string }[]>([]);

  // Group data by school + badge
  const schoolGroups = useMemo((): SchoolGroup[] => {
    const yearData = data.filter(d => safeGetYear(d.date) === year);
    const map: Record<string, SchoolGroup> = {};

    yearData.forEach(d => {
      const key = `${d.schoolCode}|${d.badge}`;
      if (!map[key]) {
        map[key] = {
          schoolCode: d.schoolCode || '',
          schoolName: d.school || '',
          badge: d.badge || '',
          participants: [],
        };
      }
      map[key].participants.push(d);
    });

    return Object.values(map).sort((a, b) => a.schoolName.localeCompare(b.schoolName));
  }, [data, year]);

  const handleGenerate = async () => {
    setGenerating(true);
    const images: typeof qrImages = [];

    for (const group of schoolGroups) {
      try {
        const payload = generateSchoolQRPayload(group, year);
        const dataUrl = await QRCode.toDataURL(payload, {
          width: 250,
          margin: 2,
          color: { dark: '#0f172a', light: '#ffffff' },
          errorCorrectionLevel: 'L', // Lower error correction for larger data
        });
        images.push({ group, dataUrl });
      } catch (e) {
        console.error('QR generation failed for:', group.schoolName, e);
      }
    }

    setQrImages(images);
    setGenerating(false);
  };

  const handleDownloadSingle = (item: typeof qrImages[0]) => {
    const a = document.createElement('a');
    a.href = item.dataUrl;
    a.download = `QR_${item.group.schoolCode}_${String(item.group.badge).replace(/\s/g, '_')}.png`;
    a.click();
  };

  const handlePrintAll = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Pengesahan Kehadiran Sekolah</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
          .card { text-align: center; border: 2px solid #1e3a8a; border-radius: 12px; padding: 20px; page-break-inside: avoid; }
          .card img { width: 200px; height: 200px; margin: 0 auto; }
          .school { font-weight: bold; font-size: 13px; margin-top: 10px; text-transform: uppercase; color: #1e3a8a; }
          .code { font-size: 10px; color: #6b7280; font-family: monospace; }
          .badge { display: inline-block; background: #fef3c7; color: #92400e; padding: 3px 10px; border-radius: 10px; font-size: 10px; font-weight: bold; margin-top: 6px; }
          .count { font-size: 11px; color: #374151; margin-top: 6px; font-weight: bold; }
          .instruction { font-size: 9px; color: #9ca3af; margin-top: 8px; border-top: 1px dashed #e5e7eb; padding-top: 6px; }
          @media print { body { padding: 10mm; } .grid { gap: 15px; } }
        </style>
      </head>
      <body>
        <h2 style="text-align:center; margin-bottom: 5px; color: #1e3a8a;">QR PENGESAHAN KEHADIRAN</h2>
        <p style="text-align:center; font-size: 11px; color: #6b7280; margin-bottom: 20px;">Scan QR ini untuk mengesahkan kehadiran SEMUA peserta sekolah</p>
        <div class="grid">
          ${qrImages.map(item => `
            <div class="card">
              <img src="${item.dataUrl}" alt="QR ${item.group.schoolName}" />
              <div class="school">${item.group.schoolName}</div>
              <div class="code">${item.group.schoolCode}</div>
              <span class="badge">${item.group.badge}</span>
              <div class="count">${item.group.participants.length} peserta</div>
              <div class="instruction">Scan QR ini = Sahkan kehadiran semua ${item.group.participants.length} peserta sekolah ini</div>
            </div>
          `).join('')}
        </div>
        <script>window.onload = () => window.print();</script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className={className}>
      <button
        onClick={() => { setIsOpen(true); if (qrImages.length === 0) handleGenerate(); }}
        disabled={schoolGroups.length === 0}
        className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold hover:bg-indigo-100 transition disabled:opacity-50"
      >
        <QrCode size={14} /> QR Sekolah ({schoolGroups.length})
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b bg-indigo-50">
              <div>
                <h3 className="font-bold text-indigo-800 flex items-center gap-2">
                  <QrCode size={18} /> QR Pengesahan Kehadiran Sekolah
                </h3>
                <p className="text-[10px] text-indigo-600 mt-0.5">Scan 1 QR = Sahkan semua peserta sekolah tersebut</p>
              </div>
              <div className="flex items-center gap-2">
                {qrImages.length > 0 && (
                  <button onClick={handlePrintAll} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs font-bold text-indigo-700 hover:bg-indigo-50 transition">
                    <Printer size={12} /> Cetak Semua
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {generating ? (
                <div className="text-center py-12">
                  <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                  <p className="text-sm text-gray-500">Menjana QR Code untuk {schoolGroups.length} sekolah...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {qrImages.map((item, i) => (
                    <div key={i} className="border border-gray-200 rounded-xl p-4 hover:shadow-lg transition text-center">
                      <img src={item.dataUrl} alt={item.group.schoolName} className="w-36 h-36 mx-auto" />
                      <div className="mt-3">
                        <p className="text-xs font-bold text-gray-900 uppercase">{item.group.schoolName}</p>
                        <p className="text-[10px] text-gray-500 font-mono">{item.group.schoolCode}</p>
                        <div className="flex items-center justify-center gap-2 mt-2">
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{item.group.badge}</span>
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                            <Users size={9} /> {item.group.participants.length}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownloadSingle(item)}
                        className="mt-3 flex items-center gap-1 mx-auto px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-bold hover:bg-blue-100 transition"
                      >
                        <Download size={10} /> Muat Turun
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * QR Scanner - scan school QR to verify attendance
 * Uses device camera to scan QR and mark all participants as present
 */
interface QRScannerProps {
  onVerified?: (record: AttendanceRecord) => void;
  verifierName?: string;
  className?: string;
}

export const QRAttendanceScanner: React.FC<QRScannerProps> = ({ onVerified, verifierName = 'Admin', className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [scannedData, setScannedData] = useState<SchoolQRData | null>(null);
  const [verified, setVerified] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [records, setRecords] = useState<AttendanceRecord[]>(getAttendanceRecords());
  const [scanMode, setScanMode] = useState<'camera' | 'manual'>('camera');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const parseQRText = (text: string): SchoolQRData | null => {
    try {
      const parsed = JSON.parse(text) as any;
      if ((parsed.v === 2 || parsed.v === 3) && parsed.schoolCode && parsed.schoolName && parsed.badge) {
        return {
          v: 3,
          schoolCode: parsed.schoolCode,
          schoolName: parsed.schoolName,
          badge: parsed.badge,
          year: parsed.year || new Date().getFullYear(),
          totalParticipants: parsed.totalParticipants || parsed.participants?.length || 0,
          generatedAt: parsed.generatedAt || new Date().toISOString(),
          ref: parsed.ref || `${parsed.schoolCode}-${String(parsed.badge).replace(/\s/g, '')}-${parsed.year || new Date().getFullYear()}`.toUpperCase(),
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleDecodedText = (text: string) => {
    const parsed = parseQRText(text.trim());
    if (parsed) {
      setScannedData(parsed);
      setManualInput('');
      stopCamera();
      return true;
    }
    return false;
  };

  const handleManualVerify = () => {
    if (!handleDecodedText(manualInput)) {
      alert('Data tidak sah. Sila scan QR yang betul atau tampal data QR.');
    }
  };

  const loadCameraDevices = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
      setDevices(videoDevices);
      if (!selectedDeviceId && videoDevices[0]?.deviceId) setSelectedDeviceId(videoDevices[0].deviceId);
    } catch (_) {}
  };

  const startCamera = async (deviceIdOverride?: string) => {
    setCameraError('');
    stopCamera();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera API tidak disokong oleh browser ini.');
      }

      const deviceId = deviceIdOverride || selectedDeviceId;
      const attempts: MediaStreamConstraints[] = [];
      
      // Try selected device with ideal (not exact)
      if (deviceId) {
        attempts.push({ video: { deviceId: { ideal: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      }
      
      // Try environment camera
      attempts.push({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      
      // Try any camera with resolution
      attempts.push({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      
      // Try any camera without constraints
      attempts.push({ video: true, audio: false });

      let stream: MediaStream | null = null;
      let lastError: any = null;
      
      for (const constraints of attempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (stream) break;
        } catch (err) {
          lastError = err;
          console.warn('Camera attempt failed:', err);
        }
      }
      
      if (!stream) {
        throw lastError || new Error('Kamera tidak dapat dimulakan.');
      }

      streamRef.current = stream;
      await loadCameraDevices();

      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.muted = true;
        
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error('Video timeout selepas 5 saat.')), 5000);
          
          const cleanup = () => {
            window.clearTimeout(timer);
            video.onloadedmetadata = null;
          };
          
          if (video.readyState >= 1) {
            cleanup();
            return resolve();
          }
          
          video.onloadedmetadata = () => {
            cleanup();
            resolve();
          };
        });
        
        await video.play();
      }
      
      setCameraActive(true);
      setCameraError('');
    } catch (e: any) {
      stopCamera();
      console.error('Camera error:', e);
      
      let msg = 'Tidak dapat akses kamera.';
      
      if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') {
        msg = 'Permission kamera ditolak. Klik icon lock di sebelah URL, kemudian allow camera.';
      } else if (e?.name === 'NotReadableError' || e?.name === 'TrackStartError') {
        msg = 'Kamera sedang digunakan oleh app/tab lain. Tutup app tersebut (Zoom/Teams/WhatsApp), kemudian cuba semula.';
      } else if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError') {
        msg = 'Tiada kamera dijumpai pada device ini.';
      } else if (e?.name === 'NotSupportedError' || e?.name === 'TypeError') {
        msg = 'Browser ini tidak menyokong camera API. Guna Chrome/Edge/Firefox terkini.';
      } else if (e?.message) {
        msg = e.message;
      }
      
      setCameraError(`${msg} (Error: ${e?.name || 'Unknown'})`);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    loadCameraDevices();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || scanMode !== 'camera' || scannedData || verified) return;
    startCamera();
    return () => stopCamera();
  }, [isOpen, scanMode, scannedData, verified]);

  useEffect(() => {
    if (!cameraActive || !videoRef.current || !canvasRef.current || scannedData) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled || !videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
        if (code?.data && handleDecodedText(code.data)) return;
      }
      requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelled = true; };
  }, [cameraActive, scannedData]);

  useEffect(() => {
    if (!isOpen) stopCamera();
  }, [isOpen]);

  const handleConfirmAttendance = () => {
    if (!scannedData) return;

    const record: AttendanceRecord = {
      schoolCode: scannedData.schoolCode,
      schoolName: scannedData.schoolName,
      badge: scannedData.badge,
      year: scannedData.year,
      verifiedAt: Date.now(),
      verifiedBy: verifierName,
      totalParticipants: scannedData.totalParticipants,
      participants: [],
    };

    saveAttendanceRecord(record);
    setRecords(getAttendanceRecords());
    setVerified(true);
    onVerified?.(record);

    // Reset after 3 seconds
    setTimeout(() => {
      setScannedData(null);
      setVerified(false);
    }, 3000);
  };

  const todayRecords = records.filter(r => {
    const today = new Date().toDateString();
    return new Date(r.verifiedAt).toDateString() === today;
  });

  return (
    <div className={className}>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-bold hover:bg-green-100 transition"
      >
        <ScanLine size={14} /> Imbas Kehadiran
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b bg-green-50">
              <h3 className="font-bold text-green-800 flex items-center gap-2">
                <ScanLine size={18} /> Pengesahan Kehadiran
              </h3>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Verified Success */}
              {verified && scannedData && (
                <div className="bg-green-50 border-2 border-green-500 rounded-xl p-6 text-center animate-[fadeIn_0.3s_ease-out]">
                  <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
                  <h4 className="font-bold text-green-800 text-lg">Kehadiran Disahkan!</h4>
                  <p className="text-green-700 font-bold mt-1">{scannedData.schoolName}</p>
                  <p className="text-sm text-green-600 mt-1">{scannedData.totalParticipants} peserta telah disahkan hadir</p>
                  <p className="text-[10px] text-green-500 mt-2">{scannedData.badge}</p>
                </div>
              )}

              {/* Scanned Data Preview */}
              {scannedData && !verified && (
                <div className="border-2 border-blue-300 rounded-xl p-4 bg-blue-50">
                  <div className="flex items-center gap-2 mb-3">
                    <School size={18} className="text-blue-700" />
                    <div>
                      <p className="font-bold text-blue-900">{scannedData.schoolName}</p>
                      <p className="text-[10px] text-blue-600 font-mono">{scannedData.schoolCode} | {scannedData.badge}</p>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-3 mb-3">
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Maklumat QR</p>
                    <p className="text-xs text-gray-700">Jumlah peserta berdaftar: <strong>{scannedData.totalParticipants}</strong></p>
                    <p className="text-[10px] text-gray-400 font-mono mt-1">Ref: {scannedData.ref}</p>
                  </div>

                  <button
                    onClick={handleConfirmAttendance}
                    className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-2 text-sm"
                  >
                    <CheckCircle size={18} /> Sahkan Kehadiran ({scannedData.totalParticipants} peserta)
                  </button>
                </div>
              )}

              {/* Scanner Input */}
              {!scannedData && !verified && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setScanMode('camera')} className={`py-2 rounded-lg text-xs font-bold border flex items-center justify-center gap-1 ${scanMode === 'camera' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                      <Camera size={14} /> Kamera
                    </button>
                    <button onClick={() => { setScanMode('manual'); stopCamera(); }} className={`py-2 rounded-lg text-xs font-bold border flex items-center justify-center gap-1 ${scanMode === 'manual' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                      <Keyboard size={14} /> Scanner Device / Manual
                    </button>
                  </div>

                  {scanMode === 'camera' && (
                    <div className="space-y-2">
                      {devices.length > 1 && (
                        <select
                          value={selectedDeviceId}
                          onChange={e => { setSelectedDeviceId(e.target.value); startCamera(e.target.value); }}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-semibold bg-white"
                        >
                          {devices.map((device, idx) => (
                            <option key={device.deviceId || idx} value={device.deviceId}>{device.label || `Kamera ${idx + 1}`}</option>
                          ))}
                        </select>
                      )}
                      <div className="bg-black rounded-xl overflow-hidden aspect-video flex items-center justify-center">
                        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                        <canvas ref={canvasRef} className="hidden" />
                      </div>
                      {cameraError && (
                        <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2 space-y-2">
                          <p>{cameraError}</p>
                          <button onClick={startCamera} className="px-3 py-1 bg-red-600 text-white rounded font-bold text-[10px]">Cuba Buka Kamera Semula</button>
                        </div>
                      )}
                      <p className="text-[10px] text-gray-400 text-center">Halakan kamera kepada QR. Pastikan laman dibuka melalui HTTPS dan permission kamera dibenarkan.</p>
                    </div>
                  )}

                  {scanMode === 'manual' && (
                    <div>
                      <p className="text-xs text-gray-600 mb-2 font-bold">Scanner device / tampal data QR:</p>
                      <input
                        value={manualInput}
                        onChange={e => setManualInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && manualInput.trim()) handleManualVerify(); }}
                        placeholder="Klik sini dan scan guna scanner device, atau tampal kandungan QR"
                        autoFocus
                        className="w-full p-3 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-green-500 outline-none font-mono"
                      />
                      <button
                        onClick={handleManualVerify}
                        disabled={!manualInput.trim()}
                        className="mt-2 w-full py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Sahkan Data QR
                      </button>
                      <p className="text-[10px] text-gray-400 mt-2 text-center">
                        Untuk scanner USB/Bluetooth, fokuskan cursor dalam kotak ini kemudian scan QR.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Today's Records */}
              {todayRecords.length > 0 && (
                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-xs font-bold text-gray-600 uppercase mb-2 flex items-center gap-1">
                    <CheckCircle size={12} className="text-green-500" /> Disahkan Hari Ini ({todayRecords.length})
                  </h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {todayRecords.map((r, i) => (
                      <div key={i} className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-xs font-bold text-gray-800">{r.schoolName}</p>
                          <p className="text-[10px] text-gray-500">{r.badge} | {r.totalParticipants} peserta</p>
                        </div>
                        <span className="text-[10px] text-green-600 font-mono">
                          {new Date(r.verifiedAt).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Keep backward compatibility export
export const BulkQRGenerator = SchoolQRGenerator;

// =====================================================================
// PARTICIPANT QR GENERATOR - Kad peserta kekal dengan QR token legap
// =====================================================================

interface ParticipantQRGeneratorProps {
  data: SubmissionData[];
  year?: number;
  className?: string;
  logoUrl?: string;
  issuerLabel?: string;
  mode?: 'button' | 'panel';
  title?: string;
  description?: string;
}

const PARTICIPANT_CARDS_PER_PAGE = 8;
const DEV_PARTICIPANT_CARD_CACHE_KEY = 'PARTICIPANT_CARD_DEV_CACHE';

const escapeHtml = (value: unknown): string => {
  const text = String(value ?? '');
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, char => entities[char] || char);
};

const normalizePrintableUrl = (url: string): string => {
  if (!url) return LOGO_URL;
  if (/^(data:|https?:)/i.test(url)) return url;
  if (typeof window === 'undefined') return url;
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
};

const chunkCards = (items: string[], size: number): string[][] => {
  const chunks: string[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

const normalizeRoleValue = (role?: string): string =>
  String(role || 'PESERTA').trim().toUpperCase();

const getParticipantRoleMeta = (participant?: Pick<SubmissionData, 'role' | 'isPenguji'> | string) => {
  const rawRole = typeof participant === 'string' ? participant : participant?.role;
  const value = normalizeRoleValue(rawRole);
  const isPenguji = typeof participant === 'object' && Boolean(participant?.isPenguji);

  if (isPenguji || value === 'PENGUJI') {
    return { label: 'PENGUJI', accent: '#7c3aed', accentDark: '#3f236f', accentSoft: '#f6f0ff', trim: '#f2b84b' };
  }
  if (value === 'PEMIMPIN' || value === 'PENOLONG PEMIMPIN') {
    return {
      label: value === 'PENOLONG PEMIMPIN' ? 'PENOLONG PEMIMPIN' : 'PEMIMPIN',
      accent: '#2563eb',
      accentDark: '#17356f',
      accentSoft: '#eff6ff',
      trim: '#f2b84b',
    };
  }
  if (value === 'PEMBANTU') {
    return { label: 'PEMBANTU', accent: '#b45309', accentDark: '#57310f', accentSoft: '#fff7ed', trim: '#16a34a' };
  }
  if (value === 'PENERIMA RAMBU') {
    return { label: 'PENERIMA RAMBU', accent: '#0d9488', accentDark: '#164e63', accentSoft: '#ecfeff', trim: '#f2b84b' };
  }
  return { label: 'PESERTA', accent: '#0f7c56', accentDark: '#173744', accentSoft: '#f1faf5', trim: '#d8ad3f' };
};

const getNameFontSize = (name: string): number => {
  if (name.length > 34) return 10.4;
  if (name.length > 27) return 11.6;
  if (name.length > 18) return 13.1;
  return 14.8;
};

const getCardDisplayName = (name: string): string => {
  const fullName = String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .replace(/\bA\s*\/\s*L\b/g, 'A/L')
    .replace(/\bA\s*\/\s*P\b/g, 'A/P');

  const connectorWords = new Set([
    'BIN',
    'BINTI',
    'BT',
    'BTE',
    'B.',
    'A/L',
    'A/P',
    'AL',
    'AP',
    'ANAK',
    'IBN',
    'IBNI',
  ]);
  const words = fullName
    .split(' ')
    .map(word => word.trim())
    .filter(Boolean);
  const connectorIndex = words.findIndex(word => connectorWords.has(word.replace(/[.,]/g, '')));
  const displayWords = connectorIndex > 0 ? words.slice(0, connectorIndex) : words;
  const displayName = displayWords.join(' ') || fullName;
  if (displayName.length <= 34) return displayName;

  const threeWords = displayWords.slice(0, 3).join(' ');
  if (threeWords && threeWords.length <= 34) return threeWords;
  const twoWords = displayWords.slice(0, 2).join(' ');
  if (twoWords) return twoWords;
  return displayName.slice(0, 34).trim();
};

const getDistrictIssuerLabel = (participant: SubmissionData, fallbackLabel: string): string => {
  const district = String(participant.daerahName || participant.daerahCode || '').trim();
  if (district) return `DAERAH ${district}`.toUpperCase();
  return fallbackLabel || 'PENGAKAP MALAYSIA';
};

const formatParticipantSiri = (siri?: number): string => {
  const value = Number(siri);
  return Number.isFinite(value) && value > 1 ? `Siri ${value}` : '';
};

const isParticipantRole = (role?: string, isPenguji?: boolean): boolean => {
  const value = normalizeRoleValue(role);
  return Boolean(isPenguji)
    || value === 'PESERTA'
    || value === 'PENERIMA RAMBU'
    || value === 'PEMIMPIN'
    || value === 'PENOLONG PEMIMPIN'
    || value === 'PENGUJI'
    || value === 'PEMBANTU';
};

const isCardEligibleParticipant = (item: SubmissionData): boolean =>
  isParticipantRole(item.role, item.isPenguji) && /^\d{12}$/.test(normalizeIcNumber(item.icNumber));

const buildParticipantCardScanUrl = (token: string): string => {
  if (typeof window === 'undefined') return `#/kad-peserta/${encodeURIComponent(token)}`;
  return `${window.location.origin}${window.location.pathname}#/kad-peserta/${encodeURIComponent(token)}`;
};

const extractParticipantCardToken = (value: string): string => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  const routeMatch = /kad-peserta\/([^/?#\s]+)/i.exec(trimmed);
  if (routeMatch?.[1]) {
    try {
      return decodeURIComponent(routeMatch[1]).trim().toLowerCase();
    } catch {
      return routeMatch[1].trim().toLowerCase();
    }
  }

  const devMatch = /dev-[0-9a-f]{22}/i.exec(trimmed);
  if (devMatch?.[0]) return devMatch[0].toLowerCase();

  const tokenMatch = /[0-9a-f]{22}/i.exec(trimmed);
  if (tokenMatch?.[0]) return tokenMatch[0].toLowerCase();

  return trimmed.toLowerCase();
};

const isParticipantCardTokenSyntax = (token: string): boolean =>
  /^(dev-)?[0-9a-f]{22}$/i.test(token);

const isDevParticipantCardPreview = () =>
  Boolean((import.meta as any).env?.DEV) && typeof window !== 'undefined';

const randomPreviewToken = (): string => {
  const bytes = new Uint8Array(11);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(16).slice(2).padEnd(22, '0').slice(0, 22);
};

const ageFromIc = (icNumber?: string): number | null => {
  const ic = normalizeIcNumber(icNumber);
  if (!/^\d{12}$/.test(ic)) return null;
  const yy = Number(ic.slice(0, 2));
  const mm = Number(ic.slice(2, 4));
  const dd = Number(ic.slice(4, 6));
  const now = new Date();
  const currentYY = now.getFullYear() % 100;
  const fullYear = yy <= currentYY ? 2000 + yy : 1900 + yy;
  const birth = new Date(fullYear, mm - 1, dd);
  if (birth.getFullYear() !== fullYear || birth.getMonth() !== mm - 1 || birth.getDate() !== dd) return null;
  let age = now.getFullYear() - fullYear;
  const birthdayPassed = now.getMonth() > birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!birthdayPassed) age -= 1;
  return age;
};

const readDevParticipantCardCache = (): Record<string, any> => {
  if (!isDevParticipantCardPreview()) return {};
  try {
    return JSON.parse(localStorage.getItem(DEV_PARTICIPANT_CARD_CACHE_KEY) || '{}') || {};
  } catch {
    return {};
  }
};

const writeDevParticipantCardCache = (token: string, participant: SubmissionData, allRows: SubmissionData[]) => {
  if (!isDevParticipantCardPreview()) return;
  const ic = normalizeIcNumber(participant.icNumber);
  const programs = allRows
    .filter(row => normalizeIcNumber(row.icNumber) === ic && isParticipantRole(row.role, row.isPenguji))
    .map(row => ({
      badge: row.badge || '',
      year: safeGetYear(row.date) || new Date().getFullYear(),
      siri: row.siri || 1,
    }))
    .filter((program, index, list) =>
      program.badge && list.findIndex(p => p.badge === program.badge && p.year === program.year && p.siri === program.siri) === index
    )
    .sort((a, b) => b.year - a.year || a.badge.localeCompare(b.badge) || a.siri - b.siri);

  const cache = readDevParticipantCardCache();
  cache[token] = {
    ok: true,
    name: participant.student || '',
    role: getParticipantRoleMeta(participant).label,
    age: ageFromIc(participant.icNumber),
    schoolName: participant.school || '',
    schoolCode: participant.schoolCode || '',
    negeriName: participant.negeriName || '',
    negeriCode: participant.negeriCode || '',
    daerahName: participant.daerahName || '',
    daerahCode: participant.daerahCode || '',
    programs,
    preview: true,
  };
  localStorage.setItem(DEV_PARTICIPANT_CARD_CACHE_KEY, JSON.stringify(cache));
};

const createParticipantQrDataUrl = (token: string) => {
  return QRCode.toDataURL(buildParticipantCardScanUrl(token), {
    width: 360,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#111827', light: '#ffffff' },
  });
};

const buildParticipantCardHtml = (
  participant: SubmissionData,
  qrDataUrl: string,
  logoUrl: string,
  issuerLabel: string
): string => {
  const palette = getParticipantRoleMeta(participant);
  const fullName = String(participant.student || '').trim().toUpperCase();
  const nameRaw = getCardDisplayName(fullName);
  const districtLabel = getDistrictIssuerLabel(participant, issuerLabel);
  const schoolCode = participant.schoolCode ? ` (${participant.schoolCode})` : '';

  return `
    <article class="program-card" style="--accent:${palette.accent}; --accent-dark:${palette.accentDark}; --accent-soft:${palette.accentSoft}; --trim:${palette.trim};">
      <div class="card-spine">
        <div class="spine-role">${escapeHtml(palette.label)}</div>
      </div>
      <div class="card-top-shape"></div>
      <div class="card-watermark"></div>
      <div class="card-inner">
        <header class="card-header">
          <img class="district-logo" src="${escapeHtml(logoUrl)}" alt="" onerror="this.style.display='none'" />
          <div class="issuer">
            <div class="issuer-main">PERSEKUTUAN PENGAKAP MALAYSIA</div>
            <div class="issuer-sub">${escapeHtml(districtLabel)}</div>
          </div>
        </header>
        <section class="identity">
          <div class="participant-name" style="font-size:${getNameFontSize(nameRaw)}px">${escapeHtml(nameRaw)}</div>
        </section>
        <section class="school-box">
          <div class="field-label">SEKOLAH</div>
          <div class="school-name">${escapeHtml(`${participant.school || ''}${schoolCode}`)}</div>
        </section>
        <section class="qr-box">
          <img class="participant-qr" src="${qrDataUrl}" alt="QR peserta" />
        </section>
        <div class="bottom-trim"><span></span><span></span><span></span></div>
      </div>
    </article>
  `;
};

const buildParticipantCardsDocument = (
  cards: string[],
  mode: 'single' | 'grid'
): string => {
  const body = mode === 'single'
    ? `<main class="single-sheet">${cards[0] || ''}</main>`
    : chunkCards(cards, PARTICIPANT_CARDS_PER_PAGE).map(page => `<section class="sheet">${page.join('')}</section>`).join('');

  return `<!DOCTYPE html><html><head><title>Kad Peserta</title>
<style>
  @page { size: A4 ${mode === 'single' ? 'portrait' : 'landscape'}; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #ffffff; font-family: Arial, Helvetica, sans-serif; color: #111827; }
  .sheet {
    width: 297mm;
    height: 210mm;
    padding: 14mm 16mm;
    display: grid;
    grid-template-columns: repeat(4, 54mm);
    grid-template-rows: repeat(2, 85.6mm);
    gap: 6mm;
    justify-content: center;
    align-content: center;
    break-after: page;
    page-break-after: always;
  }
  .sheet:last-child { break-after: auto; page-break-after: auto; }
  .single-sheet {
    width: 210mm;
    min-height: 297mm;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .program-card {
    width: 54mm;
    height: 85.6mm;
    position: relative;
    overflow: hidden;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.94), rgba(255,255,255,0.99)),
      linear-gradient(135deg, var(--accent-soft), #ffffff 58%, rgba(216,173,63,0.18));
    border: 0.28mm solid #d6dee3;
    border-radius: 2.8mm;
    box-shadow: none;
  }
  .program-card::after {
    content: "";
    position: absolute;
    inset: 1.7mm;
    border: 0.22mm solid rgba(23,55,68,0.12);
    border-radius: 2mm;
    pointer-events: none;
  }
  .card-spine {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 8.4mm;
    background: linear-gradient(180deg, var(--accent-dark), var(--accent));
  }
  .spine-role {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 68mm;
    transform: translate(-50%, -50%) rotate(-90deg);
    color: #ffffff;
    font-size: 9.2pt;
    line-height: 1;
    font-weight: 900;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-shadow: 0 0.35mm 1mm rgba(15,23,42,0.22);
  }
  .card-spine::after {
    content: "";
    position: absolute;
    top: 0;
    right: -1mm;
    width: 1mm;
    height: 100%;
    background: var(--trim);
  }
  .card-top-shape {
    position: absolute;
    top: 0;
    left: 8.4mm;
    right: 0;
    height: 18.5mm;
    background: linear-gradient(135deg, var(--accent-dark), var(--accent));
    clip-path: polygon(0 0, 100% 0, 100% 72%, 45% 100%, 0 78%);
  }
  .card-watermark {
    position: absolute;
    right: -11mm;
    top: 31mm;
    width: 42mm;
    height: 42mm;
    border: 2.4mm solid rgba(15,124,86,0.07);
    border-radius: 50%;
  }
  .card-inner {
    position: relative;
    height: 100%;
    padding: 3.8mm 4.2mm 2.8mm 11.6mm;
    display: flex;
    flex-direction: column;
  }
  .card-header {
    height: 12mm;
    display: flex;
    align-items: center;
    gap: 2mm;
    color: #ffffff;
  }
  .district-logo {
    width: 10.8mm;
    height: 10.8mm;
    object-fit: contain;
    padding: 0.9mm;
    background: #ffffff;
    border-radius: 50%;
    box-shadow: 0 0.5mm 2mm rgba(15,23,42,0.18);
  }
  .issuer { min-width: 0; line-height: 1.1; }
  .issuer-main { font-size: 5.2pt; font-weight: 900; letter-spacing: 0; }
  .issuer-sub { margin-top: 0.7mm; font-size: 4.8pt; font-weight: 700; opacity: 0.92; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 32mm; letter-spacing: 0; }
  .identity {
    min-height: 18mm;
    margin-top: 5.2mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: center;
  }
  .participant-name {
    color: #0f172a;
    font-weight: 900;
    line-height: 1.06;
    text-wrap: balance;
    overflow-wrap: anywhere;
    letter-spacing: 0;
  }
  .school-box {
    min-height: 10.8mm;
    margin-top: 1.7mm;
    padding: 1.6mm 2mm;
    background: rgba(255,255,255,0.82);
    border: 0.25mm solid rgba(23,55,68,0.14);
    border-left: 1mm solid var(--trim);
    border-radius: 2mm;
  }
  .field-label {
    color: #475569;
    font-size: 4.8pt;
    font-weight: 900;
    letter-spacing: 0;
  }
  .school-name {
    margin-top: 0.7mm;
    color: #111827;
    font-size: 6.2pt;
    line-height: 1.12;
    font-weight: 800;
    max-height: 6.9mm;
    overflow: hidden;
  }
  .qr-box {
    width: 28.2mm;
    min-height: 28.2mm;
    margin: 2mm auto 0;
    padding: 1.2mm;
    border: 0.32mm solid rgba(23,55,68,0.18);
    border-radius: 2.4mm;
    background: #ffffff;
    box-shadow: 0 1mm 3mm rgba(15,23,42,0.08);
  }
  .participant-qr {
    width: 25.8mm;
    height: 25.8mm;
    display: block;
  }
  .bottom-trim {
    margin-top: auto;
    height: 2mm;
    display: flex;
    gap: 1mm;
    align-items: end;
  }
  .bottom-trim span {
    height: 0.9mm;
    border-radius: 99px;
    background: var(--trim);
  }
  .bottom-trim span:nth-child(1) { width: 8mm; background: var(--accent-dark); }
  .bottom-trim span:nth-child(2) { width: 15mm; background: var(--trim); }
  .bottom-trim span:nth-child(3) { flex: 1; background: var(--accent); }
  @media screen {
    body { background: #e5e7eb; }
    .sheet, .single-sheet { background: #ffffff; margin: 12px auto; box-shadow: 0 12px 35px rgba(15,23,42,0.16); }
  }
  @media print {
    body { background: #ffffff; }
    .sheet, .single-sheet { margin: 0; box-shadow: none; }
  }
</style></head><body>${body}
<script>window.onload = () => setTimeout(() => window.print(), 350);</script>
</body></html>`;
};

const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace('#', '').trim();
  const full = normalized.length === 3
    ? normalized.split('').map(char => char + char).join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
};

const setPdfFill = (doc: jsPDF, hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  doc.setFillColor(r, g, b);
};

const setPdfDraw = (doc: jsPDF, hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  doc.setDrawColor(r, g, b);
};

const imageUrlToDataUrl = async (url: string): Promise<string> => {
  if (!url || /^data:/i.test(url)) return url;
  const absoluteUrl = normalizePrintableUrl(url);
  const response = await fetch(absoluteUrl);
  if (!response.ok) throw new Error('Logo tidak dapat dimuatkan.');
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Gagal membaca logo.'));
    reader.readAsDataURL(blob);
  });
};

const waitForRenderableAssets = async (root: HTMLElement) => {
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(images.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>(resolve => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
  }));

  const fonts = (document as any).fonts;
  if (fonts?.ready) {
    try {
      await fonts.ready;
    } catch {
      // Browser font readiness is best-effort only.
    }
  }
};

const fitPdfText = (
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
  maxLines: number,
) => {
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(text, maxWidth).slice(0, maxLines);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line: string, index: number) => {
    doc.text(line, x, startY + (index * lineHeight), { align: 'center' });
  });
};

const addParticipantCardToPdf = (
  doc: jsPDF,
  participant: SubmissionData,
  qrDataUrl: string,
  logoDataUrl: string,
  issuerLabel: string,
  x: number,
  y: number,
) => {
  const cardWidth = 54;
  const cardHeight = 85.6;
  const palette = getParticipantRoleMeta(participant);
  const nameRaw = getCardDisplayName(String(participant.student || '').trim().toUpperCase());
  const districtLabel = getDistrictIssuerLabel(participant, issuerLabel);
  const schoolCode = participant.schoolCode ? ` (${participant.schoolCode})` : '';
  const schoolName = `${participant.school || ''}${schoolCode}`.trim();

  doc.setLineWidth(0.25);
  setPdfDraw(doc, '#d6dee3');
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, cardWidth, cardHeight, 2.8, 2.8, 'FD');

  setPdfFill(doc, palette.accentDark);
  doc.rect(x, y, 8.4, cardHeight, 'F');
  setPdfFill(doc, palette.accent);
  doc.rect(x, y + (cardHeight / 2), 8.4, cardHeight / 2, 'F');
  setPdfFill(doc, palette.trim);
  doc.rect(x + 8.4, y, 1, cardHeight, 'F');

  setPdfFill(doc, palette.accent);
  doc.rect(x + 9.4, y, cardWidth - 9.4, 18.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.2);
  doc.text(palette.label, x + 4.6, y + 43, { align: 'center', angle: 90 } as any);

  doc.setFillColor(255, 255, 255);
  doc.circle(x + 16.2, y + 9.2, 5.8, 'F');
  try {
    if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', x + 11.2, y + 4.2, 10, 10);
  } catch (_) {
    // Logo optional; QR and text are the important identity markers.
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.4);
  doc.text('PERSEKUTUAN PENGAKAP', x + 22.2, y + 7.6);
  doc.text('MALAYSIA', x + 22.2, y + 10.6);
  doc.setFontSize(4.8);
  doc.text(districtLabel.slice(0, 26), x + 22.2, y + 13.7);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  const nameFontSize = nameRaw.length > 27 ? 10 : nameRaw.length > 18 ? 11.2 : 12.5;
  fitPdfText(doc, nameRaw, x + 31.5, y + 35.5, 33, nameFontSize, 4.2, 3);

  const schoolBoxX = x + 13.6;
  const schoolBoxY = y + 44.5;
  setPdfDraw(doc, '#d6dee3');
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(schoolBoxX, schoolBoxY, 34.5, 11.2, 1.7, 1.7, 'FD');
  setPdfFill(doc, palette.trim);
  doc.rect(schoolBoxX, schoolBoxY, 1.1, 11.2, 'F');
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(4.8);
  doc.text('SEKOLAH', schoolBoxX + 3, schoolBoxY + 4);
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(5.8);
  doc.setFont('helvetica', 'bold');
  const schoolLines = doc.splitTextToSize(schoolName, 28).slice(0, 2);
  schoolLines.forEach((line: string, index: number) => doc.text(line, schoolBoxX + 3, schoolBoxY + 7.1 + (index * 2.7)));

  const qrBoxX = x + 19.1;
  const qrBoxY = y + 58;
  setPdfDraw(doc, '#d6dee3');
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(qrBoxX, qrBoxY, 28.2, 28.2, 2, 2, 'FD');
  try {
    doc.addImage(qrDataUrl, 'PNG', qrBoxX + 1.2, qrBoxY + 1.2, 25.8, 25.8);
  } catch (_) {
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(5);
    doc.text('QR', qrBoxX + 14.8, qrBoxY + 13.5, { align: 'center' });
  }

  setPdfFill(doc, palette.accentDark);
  doc.roundedRect(x + 13, y + 83.3, 7.5, 0.9, 0.4, 0.4, 'F');
  setPdfFill(doc, palette.trim);
  doc.roundedRect(x + 22, y + 83.3, 15, 0.9, 0.4, 0.4, 'F');
  setPdfFill(doc, palette.accent);
  doc.roundedRect(x + 38, y + 83.3, 11, 0.9, 0.4, 0.4, 'F');
};

const generateParticipantCardsPdf = async (
  items: Array<{ participant: SubmissionData; qrDataUrl: string; logoUrl: string }>,
  issuerLabel: string,
  filename: string,
) => {
  if (typeof document === 'undefined') {
    throw new Error('PDF hanya boleh dijana dalam browser.');
  }

  const logoDataCache: Record<string, string> = {};
  const cards: string[] = [];
  const { default: html2canvas } = await import('html2canvas');

  for (const item of items) {
    let logoDataUrl = logoDataCache[item.logoUrl];
    if (!logoDataUrl) {
      try {
        logoDataUrl = await imageUrlToDataUrl(item.logoUrl);
      } catch {
        try {
          logoDataUrl = await imageUrlToDataUrl(LOGO_URL);
        } catch {
          logoDataUrl = '';
        }
      }
      logoDataCache[item.logoUrl] = logoDataUrl;
    }
    cards.push(buildParticipantCardHtml(item.participant, item.qrDataUrl, logoDataUrl || normalizePrintableUrl(item.logoUrl), issuerLabel));
  }

  const parsed = new DOMParser().parseFromString(buildParticipantCardsDocument(cards, 'grid'), 'text/html');
  const styleText = Array.from(parsed.head.querySelectorAll('style')).map(style => style.textContent || '').join('\n');
  const sourceSheets = Array.from(parsed.body.querySelectorAll('.sheet'));
  if (sourceSheets.length === 0) throw new Error('Tiada helaian kad untuk dijana.');

  const container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  container.style.cssText = [
    'position:fixed',
    'left:-12000px',
    'top:0',
    'width:297mm',
    'background:#ffffff',
    'pointer-events:none',
    'z-index:-1',
  ].join(';');

  const style = document.createElement('style');
  style.textContent = `${styleText}
    .sheet { margin: 0 !important; box-shadow: none !important; }
    .program-card { box-shadow: none !important; }
  `;
  container.appendChild(style);
  sourceSheets.forEach(sheet => container.appendChild(document.importNode(sheet, true)));
  document.body.appendChild(container);

  try {
    await waitForRenderableAssets(container);
    await new Promise(resolve => window.requestAnimationFrame(() => resolve(null)));

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    const sheets = Array.from(container.querySelectorAll('.sheet')) as HTMLElement[];

    for (let index = 0; index < sheets.length; index += 1) {
      if (index > 0) doc.addPage('a4', 'landscape');

      const canvas = await html2canvas(sheets[index], {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        windowWidth: sheets[index].scrollWidth,
        windowHeight: sheets[index].scrollHeight,
      });

      doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 297, 210, undefined, 'FAST');
    }

    doc.save(filename);
  } finally {
    container.remove();
  }
};

const sanitizeFilenamePart = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);

export const ParticipantQRGenerator: React.FC<ParticipantQRGeneratorProps> = ({
  data,
  year = new Date().getFullYear(),
  className = '',
  logoUrl = LOGO_URL,
  issuerLabel = 'PENGAKAP MALAYSIA',
  mode = 'button',
  title = 'Kad Peserta',
  description = 'Jana kad CR80, muat turun PDF pukal, cetak ikut filter dan relink QR lama kepada IC yang telah dibetulkan.',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<string>('');
  const [selectedSiri, setSelectedSiri] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [search, setSearch] = useState('');
  const [selectedParticipant, setSelectedParticipant] = useState<SubmissionData | null>(null);
  const [selectedQrDataUrl, setSelectedQrDataUrl] = useState('');
  const [selectedLogoUrl, setSelectedLogoUrl] = useState(LOGO_URL);
  const [relinkTokenInput, setRelinkTokenInput] = useState('');
  const [relinkMessage, setRelinkMessage] = useState('');
  const [relinkError, setRelinkError] = useState('');
  const [isRelinking, setIsRelinking] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [cardError, setCardError] = useState('');
  const [devPreviewNotice, setDevPreviewNotice] = useState('');
  const tokenCacheRef = useRef<Record<string, string>>({});
  const logoCacheRef = useRef<Record<string, string>>({});

  const rawYearData = useMemo(() => data.filter(d => {
    try { return new Date(d.date).getFullYear() === year; } catch { return false; }
  }).filter(d => !(d as any).isWithdrawn), [data, year]);

  const sortText = (value?: string): string => String(value || '').trim().toUpperCase();

  const compareParticipantCardOrder = (a: SubmissionData, b: SubmissionData): number => {
    const schoolA = sortText(a.school || a.schoolCode);
    const schoolB = sortText(b.school || b.schoolCode);
    if (!schoolA && schoolB) return 1;
    if (schoolA && !schoolB) return -1;

    const schoolCompare = schoolA.localeCompare(schoolB, 'ms-MY', { sensitivity: 'base', numeric: true });
    if (schoolCompare !== 0) return schoolCompare;

    const codeCompare = sortText(a.schoolCode).localeCompare(sortText(b.schoolCode), 'ms-MY', { sensitivity: 'base', numeric: true });
    if (codeCompare !== 0) return codeCompare;

    return sortText(a.student).localeCompare(sortText(b.student), 'ms-MY', { sensitivity: 'base', numeric: true });
  };

  const dedupeByIc = (items: SubmissionData[]): SubmissionData[] => {
    const byIc = new Map<string, SubmissionData>();
    items.forEach(item => {
      const ic = normalizeIcNumber(item.icNumber);
      if (!ic) return;
      const existing = byIc.get(ic);
      if (!existing) {
        byIc.set(ic, item);
        return;
      }
      const currentTime = new Date(item.date || 0).getTime();
      const existingTime = new Date(existing.date || 0).getTime();
      if (Number.isFinite(currentTime) && currentTime > existingTime) byIc.set(ic, item);
    });
    return Array.from(byIc.values()).sort(compareParticipantCardOrder);
  };

  const yearData = useMemo(() => {
    return dedupeByIc(rawYearData.filter(isCardEligibleParticipant));
  }, [rawYearData]);

  const ineligibleParticipantCount = useMemo(() => {
    return rawYearData.filter(d => isParticipantRole(d.role, d.isPenguji) && !isCardEligibleParticipant(d)).length;
  }, [rawYearData]);

  const badges = useMemo(() => {
    return Array.from(new Set(rawYearData.filter(isCardEligibleParticipant).map(d => d.badge).filter(Boolean))).sort();
  }, [rawYearData]);

  const siriOptions = useMemo(() => {
    return Array.from(new Set(
      rawYearData
        .filter(isCardEligibleParticipant)
        .map(d => Number(d.siri || 1))
        .filter(value => Number.isFinite(value) && value > 0)
    )).sort((a, b) => a - b);
  }, [rawYearData]);

  const roleOptions = useMemo(() => {
    const counts = new Map<string, number>();
    dedupeByIc(rawYearData.filter(isCardEligibleParticipant)).forEach(item => {
      const roleLabel = getParticipantRoleMeta(item).label;
      counts.set(roleLabel, (counts.get(roleLabel) || 0) + 1);
    });
    const order = ['PESERTA', 'PENERIMA RAMBU', 'PEMIMPIN', 'PENOLONG PEMIMPIN', 'PENGUJI', 'PEMBANTU'];
    return Array.from(counts.entries()).sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a[0].localeCompare(b[0]);
    });
  }, [rawYearData]);

  const filteredParticipants = useMemo(() => {
    let list = rawYearData.filter(isCardEligibleParticipant);
    if (selectedBadge) list = list.filter(d => d.badge === selectedBadge);
    if (selectedSiri) list = list.filter(d => String(Number(d.siri || 1)) === selectedSiri);
    if (selectedRole) list = list.filter(d => getParticipantRoleMeta(d).label === selectedRole);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        (d.student || '').toLowerCase().includes(q) ||
        (d.icNumber || '').toLowerCase().includes(q) ||
        (d.school || '').toLowerCase().includes(q) ||
        (d.role || '').toLowerCase().includes(q)
      );
    }
    return dedupeByIc(list);
  }, [rawYearData, selectedBadge, selectedSiri, selectedRole, search]);

  const activeFilterSummary = useMemo(() => {
    return [
      selectedBadge,
      selectedSiri ? `Siri ${selectedSiri}` : '',
      selectedRole,
      search.trim() ? `Carian ${search.trim()}` : '',
    ].filter(Boolean).join(' | ') || 'Semua rekod';
  }, [selectedBadge, selectedSiri, selectedRole, search]);

  const selectedPalette = getParticipantRoleMeta(selectedParticipant || undefined);
  const selectedRoleLabel = selectedPalette.label;
  const selectedCardName = getCardDisplayName(String(selectedParticipant?.student || ''));
  const selectedDistrictLabel = selectedParticipant ? getDistrictIssuerLabel(selectedParticipant, issuerLabel) : issuerLabel;

  const getPrintableLogoForParticipant = async (participant: SubmissionData): Promise<string> => {
    const daerahCode = String(participant.daerahCode || '').trim();
    const cacheKey = daerahCode || '__default__';
    if (logoCacheRef.current[cacheKey]) return logoCacheRef.current[cacheKey];

    let resolved = LOGO_URL;
    if (daerahCode) {
      try {
        resolved = await getLogoUrl('daerah', daerahCode) || LOGO_URL;
      } catch {
        resolved = LOGO_URL;
      }
    } else if (logoUrl) {
      resolved = logoUrl;
    }

    const printable = normalizePrintableUrl(resolved);
    logoCacheRef.current[cacheKey] = printable;
    return printable;
  };

  const formatCardError = (err: any): string => {
    const message = String(err?.message || err || '');
    if (
      message.includes('ensure_participant_cards')
      || message.includes('get_participant_card_public')
      || message.includes('relink_participant_card')
    ) {
      return 'Migrasi kad peserta belum dipasang di Supabase.';
    }
    return message || 'Gagal menjana token kad peserta.';
  };

  const createDevPreviewTokens = (participants: SubmissionData[]): Record<string, string> => {
    const next = { ...tokenCacheRef.current };
    participants.forEach(participant => {
      const ic = normalizeIcNumber(participant.icNumber);
      if (!/^\d{12}$/.test(ic)) return;
      if (!next[ic]) next[ic] = `dev-${randomPreviewToken()}`;
      writeDevParticipantCardCache(next[ic], participant, rawYearData);
    });
    tokenCacheRef.current = next;
    setDevPreviewNotice('Mod ujian local: QR ini guna token preview sementara kerana migrasi 058 belum dipasang.');
    return next;
  };

  const ensureTokensForParticipants = async (participants: SubmissionData[]): Promise<Record<string, string>> => {
    const icNumbers = Array.from(new Set(
      participants
        .map(p => normalizeIcNumber(p.icNumber))
        .filter(ic => /^\d{12}$/.test(ic))
    ));
    const missing = icNumbers.filter(ic => !tokenCacheRef.current[ic]);

    if (missing.length > 0) {
      try {
        const cards = await ensureParticipantCards(missing);
        const next = { ...tokenCacheRef.current };
        cards.forEach(card => { next[card.icNumber] = card.token; });
        tokenCacheRef.current = next;
        setDevPreviewNotice('');
      } catch (err) {
        if (isDevParticipantCardPreview()) {
          console.warn('Guna token preview local untuk kad peserta:', err);
          return createDevPreviewTokens(participants);
        }
        throw err;
      }
    }

    return tokenCacheRef.current;
  };

  useEffect(() => {
    setRelinkTokenInput('');
    setRelinkMessage('');
    setRelinkError('');
    setIsRelinking(false);
  }, [selectedParticipant]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedParticipant) {
      setSelectedQrDataUrl('');
      setSelectedLogoUrl(LOGO_URL);
      setCardError('');
      setDevPreviewNotice('');
      return;
    }
    setSelectedQrDataUrl('');
    setSelectedLogoUrl(LOGO_URL);
    setCardError('');
    setDevPreviewNotice('');
    (async () => {
      try {
        const logo = await getPrintableLogoForParticipant(selectedParticipant);
        if (!cancelled) setSelectedLogoUrl(logo);
        const ic = normalizeIcNumber(selectedParticipant.icNumber);
        const tokens = await ensureTokensForParticipants([selectedParticipant]);
        const token = tokens[ic];
        if (!token) throw new Error('Token kad tidak dijana. Pastikan peserta ini mempunyai pendaftaran yang disahkan.');
        const url = await createParticipantQrDataUrl(token);
        if (!cancelled) setSelectedQrDataUrl(url);
      } catch (err: any) {
        if (!cancelled) {
          setSelectedQrDataUrl('');
          setCardError(formatCardError(err));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [selectedParticipant]);

  const openPrintWindow = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) alert('Popup disekat. Benarkan popup untuk cetak kad peserta.');
    return printWindow;
  };

  const writeLoadingPrintWindow = (w: Window) => {
    w.document.write('<!DOCTYPE html><html><body style="font-family:Arial;padding:24px">Menjana kad peserta...</body></html>');
    w.document.close();
  };

  const buildFilteredCardAssets = async () => {
    const cardAssets: Array<{ participant: SubmissionData; qrDataUrl: string; logoUrl: string }> = [];
    const tokens = await ensureTokensForParticipants(filteredParticipants);
    for (const participant of filteredParticipants) {
        const token = tokens[normalizeIcNumber(participant.icNumber)];
        if (!token) continue;
        const participantLogoUrl = await getPrintableLogoForParticipant(participant);
        const qrDataUrl = await createParticipantQrDataUrl(token);
      cardAssets.push({ participant, qrDataUrl, logoUrl: participantLogoUrl });
    }
    return cardAssets;
  };

  const handlePrintAll = async () => {
    const w = openPrintWindow();
    if (!w) return;
    writeLoadingPrintWindow(w);
    setIsPrinting(true);
    try {
      const cardAssets = await buildFilteredCardAssets();
      const cards = cardAssets.map(item => buildParticipantCardHtml(item.participant, item.qrDataUrl, item.logoUrl, issuerLabel));
      if (cards.length === 0) throw new Error('Tiada token kad berjaya dijana. Pastikan peserta telah disahkan dan migrasi 058 sudah dipasang.');
      w.document.open();
      w.document.write(buildParticipantCardsDocument(cards, 'grid'));
      w.document.close();
    } catch (err) {
      console.error('Gagal menjana kad peserta:', err);
      w.document.open();
      w.document.write(`<!DOCTYPE html><html><body style="font-family:Arial;padding:24px">Gagal menjana kad peserta. ${escapeHtml(formatCardError(err))}</body></html>`);
      w.document.close();
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const cardAssets = await buildFilteredCardAssets();
      if (cardAssets.length === 0) throw new Error('Tiada token kad berjaya dijana. Pastikan peserta telah disahkan dan migrasi 058 sudah dipasang.');
      const filenameParts = [
        'kad-peserta',
        String(year),
        selectedBadge ? sanitizeFilenamePart(selectedBadge) : '',
        selectedSiri ? `siri-${selectedSiri}` : '',
        selectedRole ? sanitizeFilenamePart(selectedRole) : '',
      ].filter(Boolean);
      await generateParticipantCardsPdf(cardAssets, issuerLabel, `${filenameParts.join('-')}.pdf`);
    } catch (err) {
      console.error('Gagal menjana PDF kad peserta:', err);
      alert(`Gagal menjana PDF kad peserta. ${formatCardError(err)}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleRelinkSelectedCard = async () => {
    if (!selectedParticipant) return;

    const targetIc = normalizeIcNumber(selectedParticipant.icNumber);
    const sourceToken = extractParticipantCardToken(relinkTokenInput);
    setRelinkError('');
    setRelinkMessage('');

    if (!/^\d{12}$/.test(targetIc)) {
      setRelinkError('IC peserta semasa tidak lengkap 12 digit.');
      return;
    }

    if (!isParticipantCardTokenSyntax(sourceToken)) {
      setRelinkError('Tampal link QR lama atau token 22 aksara yang sah.');
      return;
    }

    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(`Relink QR lama ini kepada ${selectedParticipant.student || 'peserta ini'} (${targetIc})?`);
    if (!confirmed) return;

    setIsRelinking(true);
    try {
      if (sourceToken.startsWith('dev-') && isDevParticipantCardPreview()) {
        writeDevParticipantCardCache(sourceToken, selectedParticipant, rawYearData);
        tokenCacheRef.current = { ...tokenCacheRef.current, [targetIc]: sourceToken };
        setSelectedQrDataUrl(await createParticipantQrDataUrl(sourceToken));
        setDevPreviewNotice('Mod ujian local: QR lama telah dipautkan semula dalam cache preview.');
        setRelinkMessage('Relink preview local berjaya.');
        setRelinkTokenInput('');
        return;
      }

      const result = await relinkParticipantCard(
        sourceToken,
        targetIc,
        `Pembetulan IC kad peserta kepada ${targetIc}`
      );

      const nextTokens = { ...tokenCacheRef.current };
      Object.keys(nextTokens).forEach(ic => {
        if (
          ic === result.oldIcNumber
          || ic === result.newIcNumber
          || nextTokens[ic] === result.token
          || (result.replacedToken && nextTokens[ic] === result.replacedToken)
        ) {
          delete nextTokens[ic];
        }
      });
      nextTokens[result.newIcNumber] = result.token;
      tokenCacheRef.current = nextTokens;

      setSelectedQrDataUrl(await createParticipantQrDataUrl(result.token));
      setCardError('');
      setDevPreviewNotice('');
      setRelinkMessage(result.message || 'QR lama berjaya dipautkan kepada IC peserta semasa.');
      setRelinkTokenInput('');
    } catch (err) {
      const formatted = formatCardError(err);
      if (isDevParticipantCardPreview() && formatted === 'Migrasi kad peserta belum dipasang di Supabase.') {
        writeDevParticipantCardCache(sourceToken, selectedParticipant, rawYearData);
        tokenCacheRef.current = { ...tokenCacheRef.current, [targetIc]: sourceToken };
        setSelectedQrDataUrl(await createParticipantQrDataUrl(sourceToken));
        setDevPreviewNotice('Mod ujian local: QR lama telah dipautkan semula dalam cache preview.');
        setRelinkMessage('Relink preview local berjaya.');
        setRelinkTokenInput('');
        return;
      }
      setRelinkError(formatted);
    } finally {
      setIsRelinking(false);
    }
  };

  const handlePrintSingle = async (p: SubmissionData) => {
    const w = openPrintWindow();
    if (!w) return;
    writeLoadingPrintWindow(w);
    setIsPrinting(true);
    try {
      const tokens = await ensureTokensForParticipants([p]);
      const token = tokens[normalizeIcNumber(p.icNumber)];
      if (!token) throw new Error('Token kad tidak dijana. Pastikan peserta ini telah disahkan.');
      const participantLogoUrl = await getPrintableLogoForParticipant(p);
      const qrDataUrl = await createParticipantQrDataUrl(token);
      const card = buildParticipantCardHtml(p, qrDataUrl, participantLogoUrl, issuerLabel);
      w.document.open();
      w.document.write(buildParticipantCardsDocument([card], 'single'));
      w.document.close();
    } catch (err) {
      console.error('Gagal menjana kad peserta:', err);
      w.document.open();
      w.document.write(`<!DOCTYPE html><html><body style="font-family:Arial;padding:24px">Gagal menjana kad peserta. ${escapeHtml(formatCardError(err))}</body></html>`);
      w.document.close();
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className={mode === 'panel' ? `w-full ${className}` : `relative inline-block ${className}`}>
      {mode === 'button' && (
        <button
          onClick={() => setIsOpen(true)}
          disabled={yearData.length === 0}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition shadow-sm border ${yearData.length === 0 ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'}`}
        >
          <QrCode size={14} /> {title} ({yearData.length})
        </button>
      )}

      {(mode === 'panel' || isOpen) && (
        <div
          className={mode === 'panel' ? 'w-full' : 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm'}
          onClick={mode === 'panel' ? undefined : () => { setIsOpen(false); setSelectedParticipant(null); }}
        >
          <div
            className={mode === 'panel' ? 'bg-white rounded-xl shadow-sm border border-slate-200 w-full min-h-[70vh] flex flex-col overflow-hidden' : 'bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col'}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b flex justify-between items-center gap-3">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <QrCode size={18} className="text-amber-600" /> {title}
                </h3>
                {mode === 'panel' && (
                  <p className="text-xs text-slate-500 mt-1 max-w-2xl">{description}</p>
                )}
              </div>
              {mode === 'button' && (
                <button onClick={() => { setIsOpen(false); setSelectedParticipant(null); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={18} />
                </button>
              )}
            </div>

            {selectedParticipant ? (
              <div className="p-5 overflow-y-auto flex-1 flex flex-col items-center">
                <button
                  onClick={() => setSelectedParticipant(null)}
                  className="self-start mb-3 text-xs font-bold text-gray-600 hover:text-gray-900 flex items-center gap-1"
                >
                  ← Kembali ke senarai
                </button>
                <div
                  className="relative overflow-hidden bg-white text-center shadow-xl border border-slate-200"
                  style={{
                    width: 216,
                    height: 342,
                    borderRadius: 11,
                    background: `linear-gradient(180deg, rgba(255,255,255,0.94), rgba(255,255,255,0.99)), linear-gradient(135deg, ${selectedPalette.accentSoft}, #ffffff 58%, rgba(216,173,63,0.18))`,
                  }}
                >
                  <div className="absolute inset-y-0 left-0 w-[34px] overflow-hidden" style={{ background: `linear-gradient(180deg, ${selectedPalette.accentDark}, ${selectedPalette.accent})` }}>
                    <div
                      className="absolute left-1/2 top-1/2 text-center text-white font-black whitespace-nowrap overflow-hidden text-ellipsis"
                      style={{
                        width: 272,
                        transform: 'translate(-50%, -50%) rotate(-90deg)',
                        fontSize: 14,
                        lineHeight: 1,
                        textShadow: '0 1px 3px rgba(15,23,42,0.25)',
                      }}
                    >
                      {selectedRoleLabel}
                    </div>
                  </div>
                  <div className="absolute inset-y-0 left-[34px] w-1" style={{ background: selectedPalette.trim }}></div>
                  <div
                    className="absolute left-[38px] right-0 top-0 h-[74px]"
                    style={{
                      background: `linear-gradient(135deg, ${selectedPalette.accentDark}, ${selectedPalette.accent})`,
                      clipPath: 'polygon(0 0, 100% 0, 100% 72%, 45% 100%, 0 78%)',
                    }}
                  ></div>
                  <div className="absolute -right-10 top-32 h-40 w-40 rounded-full border-[10px] border-emerald-700/5"></div>
                  <div className="relative h-full pl-[46px] pr-4 py-3.5 flex flex-col">
                    <div className="h-12 flex items-center gap-2 text-left text-white">
                      <img src={selectedLogoUrl} alt="Logo" className="w-11 h-11 rounded-full bg-white object-contain p-1 shadow" />
                      <div className="min-w-0 leading-tight">
                        <div className="text-[7px] font-black">PERSEKUTUAN PENGAKAP MALAYSIA</div>
                        <div className="text-[7px] font-bold opacity-90 truncate">{selectedDistrictLabel}</div>
                      </div>
                    </div>
                    <div className="mt-5 min-h-[72px] flex flex-col justify-center">
                      <div className="font-black text-slate-900 leading-tight break-words uppercase" style={{ fontSize: getNameFontSize(selectedCardName) + 2 }}>
                        {selectedCardName}
                      </div>
                    </div>
                    <div className="mt-1.5 text-left rounded-lg px-2.5 py-1.5 border bg-white/80" style={{ borderColor: 'rgba(23,55,68,0.14)', borderLeftWidth: 4, borderLeftColor: selectedPalette.trim }}>
                      <div className="text-[7px] font-black text-slate-500">SEKOLAH</div>
                      <div className="text-[9px] leading-tight font-extrabold text-slate-900 line-clamp-2">
                        {selectedParticipant.school}{selectedParticipant.schoolCode ? ` (${selectedParticipant.schoolCode})` : ''}
                      </div>
                    </div>
                    <div className="mt-2 mx-auto w-[112px] min-h-[112px] bg-white rounded-xl border border-slate-200 p-1.5 flex items-center justify-center shadow-sm">
                      {selectedQrDataUrl ? (
                        <img src={selectedQrDataUrl} alt="QR peserta" className="w-[100px] h-[100px]" />
                      ) : (
                        <div className="h-[100px] w-[100px] flex items-center justify-center text-[9px] text-slate-400 font-bold text-center px-1">
                          {cardError ? 'QR belum tersedia' : 'Menjana QR...'}
                        </div>
                      )}
                    </div>
                    <div className="mt-auto h-3 flex items-end gap-1.5">
                      <span className="h-1 w-8 rounded-full" style={{ background: selectedPalette.accentDark }}></span>
                      <span className="h-1 w-14 rounded-full" style={{ background: selectedPalette.trim }}></span>
                      <span className="h-1 flex-1 rounded-full" style={{ background: selectedPalette.accent }}></span>
                    </div>
                  </div>
                </div>
                {cardError && (
                  <div className="mt-3 max-w-sm rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 text-center">
                    {cardError}
                  </div>
                )}
                {devPreviewNotice && !cardError && (
                  <div className="mt-3 max-w-sm rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 text-center">
                    {devPreviewNotice}
                  </div>
                )}
                <div className="mt-4 w-full max-w-sm rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-black text-slate-800 flex items-center gap-1">
                        <Link2 size={13} className="text-slate-500" /> Relink QR Lama
                      </div>
                      <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                        Sasaran: <span className="font-mono">{normalizeIcNumber(selectedParticipant.icNumber)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRelinkSelectedCard}
                      disabled={isRelinking || !relinkTokenInput.trim()}
                      className="px-3 py-1.5 text-xs bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-bold disabled:opacity-50"
                    >
                      {isRelinking ? 'Relink...' : 'Relink'}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={relinkTokenInput}
                    onChange={e => { setRelinkTokenInput(e.target.value); setRelinkError(''); setRelinkMessage(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleRelinkSelectedCard(); }}
                    placeholder="Tampal link/token QR lama..."
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                  {relinkMessage && (
                    <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] font-semibold text-emerald-700">
                      {relinkMessage}
                    </div>
                  )}
                  {relinkError && (
                    <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] font-semibold text-red-700">
                      {relinkError}
                    </div>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => handlePrintSingle(selectedParticipant)}
                    disabled={isPrinting}
                    className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 flex items-center gap-1 font-bold disabled:opacity-50"
                  >
                    <Printer size={14} /> {isPrinting ? 'Menjana...' : 'Cetak Kad Ini'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-3 text-center max-w-sm">Saiz cetakan kad ialah 54 x 85.6 mm, potret CR80/ID-1.</p>
              </div>
            ) : (
              <>
                <div className="p-5 overflow-y-auto space-y-3 flex-1">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                    QR kad ialah token kekal. Kad dicetak sekali untuk setiap pemegang kad ber-IC 12 digit dan tidak memaparkan program atau nombor keahlian.
                  </div>
                  {ineligibleParticipantCount > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
                      {ineligibleParticipantCount} rekod tidak disenaraikan kerana IC tidak lengkap 12 digit.
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Cari nama, IC atau sekolah..."
                      className="p-2 border rounded-lg text-sm"
                    />
                    <select value={selectedBadge} onChange={e => setSelectedBadge(e.target.value)} className="p-2 border rounded-lg text-sm">
                      <option value="">Semua Program ({yearData.length})</option>
                      {badges.map(b => {
                        const count = dedupeByIc(rawYearData.filter(d =>
                          isCardEligibleParticipant(d)
                          && d.badge === b
                          && (!selectedSiri || String(Number(d.siri || 1)) === selectedSiri)
                          && (!selectedRole || getParticipantRoleMeta(d).label === selectedRole)
                        )).length;
                        return <option key={b} value={b}>{b} ({count})</option>;
                      })}
                    </select>
                    <select value={selectedSiri} onChange={e => setSelectedSiri(e.target.value)} className="p-2 border rounded-lg text-sm">
                      <option value="">Semua Siri ({yearData.length})</option>
                      {siriOptions.map(siri => {
                        const value = String(siri);
                        const count = dedupeByIc(rawYearData.filter(d =>
                          isCardEligibleParticipant(d)
                          && String(Number(d.siri || 1)) === value
                          && (!selectedBadge || d.badge === selectedBadge)
                          && (!selectedRole || getParticipantRoleMeta(d).label === selectedRole)
                        )).length;
                        return <option key={siri} value={value}>Siri {siri} ({count})</option>;
                      })}
                    </select>
                    <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)} className="p-2 border rounded-lg text-sm">
                      <option value="">Semua Peranan ({yearData.length})</option>
                      {roleOptions.map(([roleLabel]) => {
                        const count = dedupeByIc(rawYearData.filter(d =>
                          isCardEligibleParticipant(d)
                          && getParticipantRoleMeta(d).label === roleLabel
                          && (!selectedBadge || d.badge === selectedBadge)
                          && (!selectedSiri || String(Number(d.siri || 1)) === selectedSiri)
                        )).length;
                        return <option key={roleLabel} value={roleLabel}>{roleLabel} ({count})</option>;
                      })}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                    <span><strong>Filter cetak/PDF:</strong> {activeFilterSummary} <span className="font-bold text-slate-500">| Susunan: Sekolah - Nama</span></span>
                    {(selectedBadge || selectedSiri || selectedRole || search.trim()) && (
                      <button
                        onClick={() => { setSelectedBadge(''); setSelectedSiri(''); setSelectedRole(''); setSearch(''); }}
                        className="font-bold text-slate-500 hover:text-slate-900"
                      >
                        Reset filter
                      </button>
                    )}
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
                              {p.school && <span>{p.school}</span>} {p.schoolCode && <span className="ml-1 font-mono">({p.schoolCode})</span>} {p.icNumber ? <span className="ml-1 font-mono">| {p.icNumber}</span> : ''} <span className="ml-1">| {getParticipantRoleMeta(p).label}</span> {p.badge && <span className="ml-1">| {p.badge}</span>} {formatParticipantSiri(p.siri) && <span className="ml-1">| {formatParticipantSiri(p.siri)}</span>}
                            </div>
                          </div>
                          <QrCode size={14} className="text-amber-600 flex-shrink-0" />
                        </button>
                      ))
                    )}
                  </div>

                  <div className="text-xs text-gray-600">
                    <strong>{filteredParticipants.length}</strong> rekod dipaparkan dari {yearData.length}
                  </div>
                </div>

                <div className="p-4 border-t flex justify-between items-center gap-2 bg-gray-50">
                  <span className="text-[10px] text-gray-500">Layout cetak: 8 kad CR80 setiap helai A4 landskap. Susunan ikut sekolah, kemudian nama.</span>
                  <div className="flex gap-2">
                    {mode === 'button' && (
                      <button onClick={() => { setIsOpen(false); setSelectedParticipant(null); }} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Tutup</button>
                    )}
                    <button
                      onClick={handleDownloadPdf}
                      disabled={filteredParticipants.length === 0 || isPrinting || isGeneratingPdf}
                      className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-1 font-bold disabled:opacity-50"
                    >
                      <Download size={14} /> {isGeneratingPdf ? 'Menjana PDF...' : `PDF Pukal (${filteredParticipants.length})`}
                    </button>
                    <button
                      onClick={handlePrintAll}
                      disabled={filteredParticipants.length === 0 || isPrinting || isGeneratingPdf}
                      className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 flex items-center gap-1 font-bold disabled:opacity-50"
                    >
                      <Printer size={14} /> {isPrinting ? 'Menjana...' : `Cetak Semua (${filteredParticipants.length})`}
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
