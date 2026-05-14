import React, { useState } from 'react';
import { MessageCircle, X, Send, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { sendTelegramFeedback } from '../services/telegramService';

interface FloatingChatbotProps {
  senderName: string;
  senderEmail: string;
  role: string;
  schoolName?: string;
}

type Status = 'idle' | 'sending' | 'success' | 'error';

export function FloatingChatbot({ senderName, senderEmail, role, schoolName }: FloatingChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const handleSend = async () => {
    if (!message.trim()) return;

    setStatus('sending');
    const success = await sendTelegramFeedback({
      senderName,
      senderEmail,
      role,
      schoolName,
      message: message.trim(),
    });

    if (success) {
      setStatus('success');
      setMessage('');
      setTimeout(() => {
        setStatus('idle');
        setIsOpen(false);
      }, 2500);
    } else {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const roleLabel: Record<string, string> = {
    school_user: 'Guru',
    daerah_admin: 'Admin Daerah',
    negeri_admin: 'Admin Negeri',
    admin: 'Admin',
    developer: 'Developer',
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat Panel */}
      {isOpen && (
        <div className="w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-amber-500 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-white font-bold text-sm">Hantar Maklum Balas</p>
              <p className="text-amber-100 text-xs">Mesej akan dihantar terus kepada admin sistem</p>
            </div>
            <button
              onClick={() => { setIsOpen(false); setStatus('idle'); setMessage(''); }}
              className="text-white hover:text-amber-200 transition-colors"
              aria-label="Tutup"
            >
              <X size={18} />
            </button>
          </div>

          {/* Sender Info */}
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
            <p className="text-xs text-slate-500">
              Daripada: <span className="font-semibold text-slate-700">{senderName}</span>
              {' · '}
              <span className="text-amber-600">{roleLabel[role] ?? role}</span>
            </p>
            {schoolName && (
              <p className="text-xs text-slate-400 truncate">{schoolName}</p>
            )}
          </div>

          {/* Body */}
          <div className="p-4 flex flex-col gap-3">
            {status === 'success' ? (
              <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
                <CheckCircle size={40} className="text-green-500" />
                <p className="text-green-700 font-semibold text-sm">Mesej berjaya dihantar!</p>
                <p className="text-slate-400 text-xs">Admin akan semak dan baiki secepat mungkin.</p>
              </div>
            ) : status === 'error' ? (
              <div className="flex flex-col items-center justify-center py-4 gap-2 text-center">
                <AlertCircle size={36} className="text-red-500" />
                <p className="text-red-600 font-semibold text-sm">Gagal menghantar mesej.</p>
                <p className="text-slate-400 text-xs">Sila semak sambungan internet dan cuba semula.</p>
              </div>
            ) : (
              <>
                <textarea
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-slate-300 min-h-[100px]"
                  placeholder="Taip masalah atau cadangan anda di sini..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={status === 'sending'}
                  maxLength={1000}
                  aria-label="Mesej maklum balas"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">{message.length}/1000</span>
                  <button
                    onClick={handleSend}
                    disabled={!message.trim() || status === 'sending'}
                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                    aria-label="Hantar mesej"
                  >
                    {status === 'sending' ? (
                      <Loader size={15} className="animate-spin" />
                    ) : (
                      <Send size={15} />
                    )}
                    {status === 'sending' ? 'Menghantar...' : 'Hantar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-14 h-14 bg-amber-500 hover:bg-amber-600 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        aria-label="Buka maklum balas"
        title="Hantar maklum balas / laporkan masalah"
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </button>
    </div>
  );
}
