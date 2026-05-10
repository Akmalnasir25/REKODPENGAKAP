import React, { useState, useEffect } from 'react';
import { Users, Circle } from 'lucide-react';

/**
 * Lightweight presence indicator using localStorage + BroadcastChannel
 * Shows who else is currently active in the system (same browser/device tabs)
 * For full real-time across devices, would need WebSocket backend.
 */

interface ActiveUser {
  id: string;
  name: string;
  role: string;
  lastSeen: number;
  view: string;
}

const CHANNEL_NAME = 'pengakap_presence';
const STORAGE_KEY = 'ACTIVE_USERS';
const HEARTBEAT_INTERVAL = 5000; // 5 seconds
const TIMEOUT = 15000; // 15 seconds before considered offline

export const usePresence = (userName: string, userRole: string, currentView: string) => {
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const userId = React.useRef(`user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);

  useEffect(() => {
    if (!userName) return;

    let channel: BroadcastChannel | null = null;
    
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      // BroadcastChannel not supported
      return;
    }

    const broadcastPresence = () => {
      const myPresence: ActiveUser = {
        id: userId.current,
        name: userName,
        role: userRole,
        lastSeen: Date.now(),
        view: currentView,
      };

      // Store in localStorage for cross-tab visibility
      const stored = getStoredUsers();
      const updated = stored.filter(u => u.id !== userId.current && Date.now() - u.lastSeen < TIMEOUT);
      updated.push(myPresence);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

      // Broadcast to other tabs
      channel?.postMessage({ type: 'heartbeat', user: myPresence });
      
      setActiveUsers(updated.filter(u => u.id !== userId.current));
    };

    const getStoredUsers = (): ActiveUser[] => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    };

    // Listen for messages from other tabs
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'heartbeat') {
        const stored = getStoredUsers();
        const active = stored.filter(u => u.id !== userId.current && Date.now() - u.lastSeen < TIMEOUT);
        setActiveUsers(active);
      }
    };

    channel.addEventListener('message', handleMessage);

    // Start heartbeat
    broadcastPresence();
    const interval = setInterval(broadcastPresence, HEARTBEAT_INTERVAL);

    // Cleanup on unmount
    return () => {
      clearInterval(interval);
      channel?.removeEventListener('message', handleMessage);
      channel?.close();
      
      // Remove self from stored users
      const stored = getStoredUsers();
      const cleaned = stored.filter(u => u.id !== userId.current);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    };
  }, [userName, userRole, currentView]);

  return activeUsers;
};

/**
 * Presence indicator component
 */
export const PresenceIndicator: React.FC<{ 
  userName: string; 
  userRole: string; 
  currentView: string;
  className?: string;
}> = ({ userName, userRole, currentView, className = '' }) => {
  const activeUsers = usePresence(userName, userRole, currentView);

  if (activeUsers.length === 0) return null;

  return (
    <div className={`flex items-center gap-2 ${className}`} title={`${activeUsers.length} pengguna lain aktif`}>
      <div className="flex -space-x-2">
        {activeUsers.slice(0, 3).map((user, i) => (
          <div
            key={user.id}
            className="w-6 h-6 rounded-full bg-green-500 border-2 border-white dark:border-gray-800 flex items-center justify-center text-[8px] font-bold text-white"
            title={`${user.name} (${user.role})`}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
        ))}
        {activeUsers.length > 3 && (
          <div className="w-6 h-6 rounded-full bg-gray-400 border-2 border-white dark:border-gray-800 flex items-center justify-center text-[8px] font-bold text-white">
            +{activeUsers.length - 3}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Circle size={6} className="text-green-500 fill-green-500 animate-pulse" />
        <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
          {activeUsers.length} aktif
        </span>
      </div>
    </div>
  );
};
