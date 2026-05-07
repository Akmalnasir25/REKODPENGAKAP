import React, { useState, useEffect } from 'react';
import { LOGO_URL, APP_VERSION } from '../constants';
import { Wrench, Clock, RefreshCw } from 'lucide-react';

export const MaintenancePage: React.FC = () => {
  const [dots, setDots] = useState('');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const dotInterval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    const progressInterval = setInterval(() => {
      setProgress(prev => prev >= 95 ? 60 : prev + Math.random() * 5);
    }, 2000);
    return () => { clearInterval(dotInterval); clearInterval(progressInterval); };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-blue-600 rounded-full blur-[150px] opacity-15 animate-pulse" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-amber-600 rounded-full blur-[150px] opacity-10" />
      
      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white/20 rounded-full"
            style={{
              left: `${15 + i * 15}%`,
              top: `${20 + (i % 3) * 25}%`,
              animation: `float ${3 + i * 0.5}s ease-in-out infinite alternate`,
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes float {
          from { transform: translateY(0px) scale(1); opacity: 0.3; }
          to { transform: translateY(-20px) scale(1.5); opacity: 0.7; }
        }
        @keyframes gearSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="relative z-10 text-center max-w-md w-full">
        {/* Logo with gear animation */}
        <div className="relative inline-block mb-8">
          <div className="absolute -inset-4 bg-amber-500/10 rounded-full blur-xl" />
          <div className="relative">
            <img 
              src={LOGO_URL} 
              alt="Logo" 
              className="h-28 w-auto mx-auto drop-shadow-2xl" 
            />
            <div className="absolute -bottom-2 -right-2 bg-amber-500 rounded-full p-2 shadow-lg">
              <Wrench className="w-4 h-4 text-white" style={{ animation: 'gearSpin 3s linear infinite' }} />
            </div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">
          Penyelenggaraan Sistem
        </h1>
        <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-xs mx-auto">
          Kami sedang menambah baik sistem untuk pengalaman yang lebih lancar. Sila kembali sebentar lagi.
        </p>

        {/* Progress bar */}
        <div className="max-w-xs mx-auto mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Sedang diproses{dots}
            </span>
            <span className="text-xs text-slate-500 font-mono">{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-1000 ease-out relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" 
                   style={{ animation: 'shimmerProgress 2s ease-in-out infinite' }} />
            </div>
          </div>
          <style>{`
            @keyframes shimmerProgress {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(200%); }
            }
          `}</style>
        </div>

        {/* Retry button */}
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white text-sm font-medium rounded-xl border border-white/10 hover:border-white/20 transition-all duration-200 active:scale-95 backdrop-blur-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Cuba Semula
        </button>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-slate-800/50">
          <p className="text-[10px] text-slate-600 uppercase tracking-widest font-medium">
            Sistem Pengurusan Data Pengakap
          </p>
          <p className="text-[9px] text-slate-700 font-mono mt-1">{APP_VERSION}</p>
        </div>
      </div>
    </div>
  );
};
