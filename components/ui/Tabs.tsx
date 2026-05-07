import React, { useState, useRef, useEffect } from 'react';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
  disabled?: boolean;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'default' | 'pills' | 'underline';
  size?: 'sm' | 'md';
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'default',
  size = 'md',
  className = '',
}) => {
  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (variant !== 'underline' || !tabsRef.current) return;
    const activeEl = tabsRef.current.querySelector(`[data-tab-id="${activeTab}"]`) as HTMLElement;
    if (activeEl) {
      setIndicatorStyle({
        width: activeEl.offsetWidth,
        left: activeEl.offsetLeft,
      });
    }
  }, [activeTab, variant, tabs]);

  const sizeClasses = size === 'sm' ? 'text-xs px-3 py-1.5' : 'text-sm px-4 py-2.5';

  if (variant === 'pills') {
    return (
      <div className={`flex gap-1.5 p-1 bg-gray-100 rounded-xl ${className}`} role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.id)}
            className={`
              flex items-center gap-2 ${sizeClasses} rounded-lg font-medium transition-all duration-200
              ${activeTab === tab.id
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }
              ${tab.disabled ? 'opacity-40 cursor-not-allowed' : ''}
            `}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
                activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
              }`}>
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  if (variant === 'underline') {
    return (
      <div className={`relative ${className}`}>
        <div ref={tabsRef} className="flex gap-0 border-b border-gray-200" role="tablist">
          {tabs.map(tab => (
            <button
              key={tab.id}
              data-tab-id={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              disabled={tab.disabled}
              onClick={() => !tab.disabled && onChange(tab.id)}
              className={`
                flex items-center gap-2 ${sizeClasses} font-medium transition-colors duration-200 border-b-2 -mb-px
                ${activeTab === tab.id
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
                }
                ${tab.disabled ? 'opacity-40 cursor-not-allowed' : ''}
              `}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Default variant
  return (
    <div className={`flex gap-1 overflow-x-auto scrollbar-hide ${className}`} role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          disabled={tab.disabled}
          onClick={() => !tab.disabled && onChange(tab.id)}
          className={`
            flex items-center gap-2 ${sizeClasses} rounded-lg font-medium whitespace-nowrap transition-all duration-200
            ${activeTab === tab.id
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-100'
            }
            ${tab.disabled ? 'opacity-40 cursor-not-allowed' : ''}
          `}
        >
          {tab.icon}
          <span>{tab.label}</span>
          {tab.badge !== undefined && tab.badge > 0 && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
              activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              {tab.badge > 99 ? '99+' : tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};
