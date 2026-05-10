import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'deadline' | 'status';
  timestamp: number;
  read: boolean;
  link?: string; // Optional deep link hash
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  removeNotification: (id: string) => void;
  requestPushPermission: () => Promise<boolean>;
  pushPermission: NotificationPermission;
}

const STORAGE_KEY = 'APP_NOTIFICATIONS';
const MAX_NOTIFICATIONS = 50;

const NotificationContext = createContext<NotificationContextType | null>(null);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [pushPermission, setPushPermission] = useState<NotificationPermission>(
    'Notification' in window ? Notification.permission : 'denied'
  );

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  }, [notifications]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const addNotification = useCallback((notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
    const newNotif: AppNotification = {
      ...notification,
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      read: false,
    };

    setNotifications(prev => {
      const updated = [newNotif, ...prev].slice(0, MAX_NOTIFICATIONS);
      return updated;
    });

    // Send browser push notification if permitted
    if (pushPermission === 'granted' && 'Notification' in window) {
      try {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/icons/icon-192x192.svg',
          badge: '/icons/icon-96x96.svg',
          tag: newNotif.id,
        });
      } catch {
        // Silent fail for environments that don't support Notification constructor
      }
    }
  }, [pushPermission]);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const requestPushPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;
    
    const permission = await Notification.requestPermission();
    setPushPermission(permission);
    return permission === 'granted';
  }, []);

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearAll,
      removeNotification,
      requestPushPermission,
      pushPermission,
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider');
  return context;
};

// ============ DEADLINE CHECKER HOOK ============
/**
 * Hook that checks badge deadlines and generates notifications
 */
export const useDeadlineChecker = (badges: { name: string; isOpen: boolean; deadline?: string }[]) => {
  const { addNotification, notifications } = useNotifications();

  useEffect(() => {
    if (!badges || badges.length === 0) return;

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    badges.forEach(badge => {
      if (!badge.deadline || !badge.isOpen) return;

      const deadline = new Date(badge.deadline);
      const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Check if we already notified today for this badge
      const alreadyNotified = notifications.some(n => 
        n.type === 'deadline' && 
        n.title.includes(badge.name) &&
        new Date(n.timestamp).toISOString().split('T')[0] === today
      );

      if (alreadyNotified) return;

      if (daysLeft <= 0) {
        addNotification({
          title: `Tarikh Akhir: ${badge.name}`,
          message: `Pendaftaran untuk ${badge.name} telah TAMAT.`,
          type: 'deadline',
        });
      } else if (daysLeft <= 3) {
        addNotification({
          title: `Peringatan: ${badge.name}`,
          message: `Tinggal ${daysLeft} hari lagi sebelum tarikh akhir pendaftaran ${badge.name}!`,
          type: 'warning',
        });
      } else if (daysLeft <= 7) {
        addNotification({
          title: `Tarikh Akhir Hampir: ${badge.name}`,
          message: `Pendaftaran ${badge.name} akan ditutup dalam ${daysLeft} hari.`,
          type: 'info',
        });
      }
    });
  }, [badges]);
};
