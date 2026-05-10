import React, { useState } from 'react';
import { Bell, X, Check, CheckCheck, Trash2, Clock, AlertTriangle, Info, CheckCircle, Calendar } from 'lucide-react';
import { useNotifications, AppNotification } from '../../context/NotificationContext';

const getIcon = (type: AppNotification['type']) => {
  switch (type) {
    case 'deadline': return <Calendar size={16} className="text-red-500" />;
    case 'warning': return <AlertTriangle size={16} className="text-amber-500" />;
    case 'success': return <CheckCircle size={16} className="text-green-500" />;
    case 'status': return <Info size={16} className="text-blue-500" />;
    default: return <Info size={16} className="text-gray-500" />;
  }
};

const formatTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Baru sahaja';
  if (minutes < 60) return `${minutes} minit lalu`;
  if (hours < 24) return `${hours} jam lalu`;
  if (days < 7) return `${days} hari lalu`;
  return new Date(timestamp).toLocaleDateString('ms-MY');
};

export const NotificationBell: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll, removeNotification, requestPushPermission, pushPermission } = useNotifications();

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-white/10 transition text-white"
        aria-label={`Notifikasi${unreadCount > 0 ? ` (${unreadCount} belum dibaca)` : ''}`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          
          {/* Panel */}
          <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden max-h-[70vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <h3 className="font-bold text-sm text-gray-800 dark:text-white flex items-center gap-2">
                <Bell size={16} /> Notifikasi
                {unreadCount > 0 && (
                  <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full font-bold">{unreadCount}</span>
                )}
              </h3>
              <div className="flex items-center gap-1">
                {pushPermission !== 'granted' && (
                  <button
                    onClick={requestPushPermission}
                    className="text-[10px] bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold hover:bg-blue-200 transition"
                    title="Aktifkan notifikasi push"
                  >
                    Aktifkan Push
                  </button>
                )}
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="text-gray-400 hover:text-blue-600 p-1 rounded transition" title="Tandai semua dibaca">
                    <CheckCheck size={16} />
                  </button>
                )}
                {notifications.length > 0 && (
                  <button onClick={clearAll} className="text-gray-400 hover:text-red-600 p-1 rounded transition" title="Padam semua">
                    <Trash2 size={16} />
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded transition">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Notification List */}
            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <Bell size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Tiada notifikasi</p>
                </div>
              ) : (
                notifications.map(notif => (
                  <div
                    key={notif.id}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition cursor-pointer ${!notif.read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                    onClick={() => markAsRead(notif.id)}
                  >
                    <div className="mt-0.5 shrink-0">{getIcon(notif.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-xs font-bold truncate ${!notif.read ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                          {notif.title}
                        </p>
                        {!notif.read && <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />}
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{notif.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                        <Clock size={10} /> {formatTime(notif.timestamp)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeNotification(notif.id); }}
                      className="text-gray-300 hover:text-red-500 p-1 rounded shrink-0 transition opacity-0 group-hover:opacity-100"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
