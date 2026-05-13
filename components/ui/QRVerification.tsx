import React, { useState, useEffect, useRef, useMemo } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { QrCode, Download, Printer, X, CheckCircle, School, Users, ScanLine, Camera, Keyboard } from 'lucide-react';
import { SubmissionData } from '../../types';

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
