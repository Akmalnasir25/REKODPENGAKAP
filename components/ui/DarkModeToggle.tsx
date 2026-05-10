import React from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from '../../context/AppContext';

export const DarkModeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { theme, setTheme, isDark } = useTheme();

  return (
    <div className={`flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 ${className}`}>
      <button
        onClick={() => setTheme('light')}
        className={`p-1.5 rounded-md transition ${theme === 'light' ? 'bg-white dark:bg-gray-700 shadow-sm text-amber-500' : 'text-gray-400 hover:text-gray-600'}`}
        title="Mode Cerah"
        aria-label="Light mode"
      >
        <Sun size={14} />
      </button>
      <button
        onClick={() => setTheme('system')}
        className={`p-1.5 rounded-md transition ${theme === 'system' ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-500' : 'text-gray-400 hover:text-gray-600'}`}
        title="Ikut Sistem"
        aria-label="System mode"
      >
        <Monitor size={14} />
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={`p-1.5 rounded-md transition ${theme === 'dark' ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-500' : 'text-gray-400 hover:text-gray-600'}`}
        title="Mode Gelap"
        aria-label="Dark mode"
      >
        <Moon size={14} />
      </button>
    </div>
  );
};

/**
 * Simple toggle button (compact)
 */
export const DarkModeButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={`p-2 rounded-lg transition hover:bg-gray-200 dark:hover:bg-gray-700 ${className}`}
      title={isDark ? 'Tukar ke Mode Cerah' : 'Tukar ke Mode Gelap'}
      aria-label="Toggle dark mode"
    >
      {isDark ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-gray-600" />}
    </button>
  );
};
