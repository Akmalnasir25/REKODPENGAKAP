import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, CheckCheck, MessageSquare } from 'lucide-react';
import { getUserNotifications, markNotificationRead, markAllNotificationsRead } from '../services/telegramService';

interface Notification {
  id: string;
  feedback_id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationBellProps {
  userId: string;
}

export function NotificationBell({ userId }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const fetchNotifications = async () => {
    const data = await getUserNotifications(userId);
    setNotifications(data as Notification[]);
  };

  useEffect(() => {
    if (!userId) return;
    fetchNotifications();
    // Poll setiap 30 saat untuk check notification baru
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  // Tutup panel bila klik luar
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleOpen = () => {
    setIsOpen((prev) => !prev);
  };

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const handleMarkAllRead = async () => {
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
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-full hover:bg-slate-100 transition-colors"
        aria-label="Notifikasi"
        title="Notifikasi"
      >
        <Bell size={22} className="text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50">
          {/* Header */}
          <div className="px-4 py-3 bg-amber-500 flex items-center justify-between">
            <p className="text-white font-bold text-sm">Notifikasi</p>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-amber-100 hover:text-white text-xs flex items-center gap-1 transition-colors"
                  title="Tandakan semua sebagai dibaca"
                >
                  <CheckCheck size={14} />
                  Baca semua
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-white hover:text-amber-200 transition-colors"
                aria-label="Tutup"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                <MessageSquare size={32} className="text-slate-200" />
                <p className="text-slate-400 text-sm">Tiada notifikasi</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`px-4 py-3 flex gap-3 cursor-pointer hover:bg-slate-50 transition-colors ${
                    !notif.is_read ? 'bg-amber-50' : ''
                  }`}
                  onClick={() => handleMarkRead(notif.id)}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    <div className={`w-2 h-2 rounded-full mt-1.5 ${!notif.is_read ? 'bg-amber-500' : 'bg-slate-200'}`} />
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
  );
}
