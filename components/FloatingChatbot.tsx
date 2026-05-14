import React, { useState, useEffect } from 'react';
import { MessageCircle, X, Send, CheckCircle, AlertCircle, Loader, Bell, CheckCheck, MessageSquare } from 'lucide-react';
import { sendTelegramFeedback, getUserNotifications, markNotificationRead, markAllNotificationsRead } from '../services/telegramService';

interface FloatingChatbotProps {
  userId?: string;
  senderName: string;
  senderEmail: string;
  role: string;
  schoolName?: string;
}

interface Notification {
  id: string;
  feedback_id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

type Status = 'idle' | 'sending' | 'success' | 'error';
type Tab = 'chat' | 'notifications';

export function FloatingChatbot({ userId, senderName, senderEmail, role, schoolName }: FloatingChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const roleLabel: Record<string, string> = {
    school_user: 'Guru',
    daerah_admin: 'Admin Daerah',
    negeri_admin: 'Admin Negeri',
    admin: 'Admin',
    developer: 'Developer',
  };

  const fetchNotifications = async () => {
    if (!userId) return;
    const data = await getUserNotifications(userId);
    setNotifications(data as Notification[]);
  };

  useEffect(() => {
    if (!userId) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  // Auto switch ke tab notifikasi bila ada unread
  useEffect(() => {
    if (isOpen && unreadCount > 0 && activeTab === 'chat') {
      // Jangan auto switch — biar user pilih sendiri
    }
  }, [isOpen, unreadCount]);

  const handleSend = async () => {
    if (!message.trim()) return;
    setStatus('sending');
    const success = await sendTelegramFeedback({
      userId,
      senderName,
      senderEmail,
      role,
      schoolName,
      message: message.trim(),
    });

    if (success) {
      setStatus('success');
      setMessage('');
      setTimeout(() => setStatus('idle'), 2500);
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

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const handleMarkAllRead = async () => {
    if (!userId) return;
    await markAllNotificationsRead(userId);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ms-MY', {
      timeZone: 'Asia/Kuala_Lumpur',
      dateStyle: 'short',
      timeStyle: 'short',
    });
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9997] flex flex-col items-end gap-3">
      {/* Panel */}
      {isOpen && (
        <div className="w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-amber-500 px-4 py-3 flex items-center justify-between">
            <p className="text-white font-bold text-sm">Pusat Bantuan</p>
            <button
              onClick={() => { setIsOpen(false); setStatus('idle'); setMessage(''); }}
              className="text-white hover:text-amber-200 transition-colors"
              aria-label="Tutup"
            >
              <X size={18} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === 'chat'
                  ? 'text-amber-600 border-b-2 border-amber-500 bg-amber-50'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <MessageSquare size={14} />
              Hantar Aduan
            </button>
            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors relative ${
                activeTab === 'notifications'
                  ? 'text-amber-600 border-b-2 border-amber-500 bg-amber-50'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Bell size={14} />
              Notifikasi
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-6 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'chat' ? (
            <div className="p-4 flex flex-col gap-3">
              {/* Sender Info */}
              <div className="px-0 py-1">
                <p className="text-xs text-slate-500">
                  Daripada: <span className="font-semibold text-slate-700">{senderName}</span>
                  {' · '}
                  <span className="text-amber-600">{roleLabel[role] ?? role}</span>
                </p>
                {schoolName && <p className="text-xs text-slate-400 truncate">{schoolName}</p>}
              </div>

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
                      {status === 'sending' ? <Loader size={15} className="animate-spin" /> : <Send size={15} />}
                      {status === 'sending' ? 'Menghantar...' : 'Hantar'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              {/* Mark all read */}
              {unreadCount > 0 && (
                <div className="px-4 py-2 flex justify-end border-b border-slate-50">
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1"
                  >
                    <CheckCheck size={13} /> Baca semua
                  </button>
                </div>
              )}

              {/* Notification list */}
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                    <Bell size={32} className="text-slate-200" />
                    <p className="text-slate-400 text-sm">Tiada notifikasi</p>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`px-4 py-3 flex gap-3 cursor-pointer hover:bg-slate-50 transition-colors ${!notif.is_read ? 'bg-amber-50' : ''}`}
                      onClick={() => handleMarkRead(notif.id)}
                    >
                      <div className="flex-shrink-0 mt-1.5">
                        <div className={`w-2 h-2 rounded-full ${!notif.is_read ? 'bg-amber-500' : 'bg-slate-200'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${!notif.is_read ? 'text-slate-800' : 'text-slate-500'}`}>
                          {notif.title}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap break-words">{notif.message}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{formatTime(notif.created_at)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative w-14 h-14 bg-amber-500 hover:bg-amber-600 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        aria-label="Buka pusat bantuan"
        title="Pusat Bantuan"
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
