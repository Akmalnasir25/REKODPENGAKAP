import React from 'react';

interface CardProps {
  children: React.ReactNode;
  variant?: 'elevated' | 'outlined' | 'flat' | 'glass';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  className?: string;
  onClick?: () => void;
}

const variantClasses: Record<string, string> = {
  elevated: 'bg-white rounded-xl shadow-md border border-gray-100/80',
  outlined: 'bg-white rounded-xl border-2 border-gray-200',
  flat: 'bg-gray-50 rounded-xl border border-gray-100',
  glass: 'bg-white/80 backdrop-blur-sm rounded-xl border border-white/20 shadow-lg',
};

const paddingClasses: Record<string, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'elevated',
  padding = 'md',
  hover = false,
  className = '',
  onClick,
}) => {
  return (
    <div
      className={`
        ${variantClasses[variant]}
        ${paddingClasses[padding]}
        ${hover ? 'hover:shadow-lg hover:-translate-y-0.5 cursor-pointer' : ''}
        transition-all duration-200
        ${className}
      `}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
};

// Stat Card
interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: { value: number; label: string };
  color?: string;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  trend,
  color = 'blue',
  className = '',
}) => {
  const colorMap: Record<string, { bg: string; text: string; iconBg: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', iconBg: 'bg-blue-100' },
    green: { bg: 'bg-emerald-50', text: 'text-emerald-600', iconBg: 'bg-emerald-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', iconBg: 'bg-amber-100' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', iconBg: 'bg-purple-100' },
    red: { bg: 'bg-red-50', text: 'text-red-600', iconBg: 'bg-red-100' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-600', iconBg: 'bg-orange-100' },
  };

  const c = colorMap[color] || colorMap.blue;

  return (
    <div className={`bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-all duration-200 group ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
          <p className={`text-2xl font-bold mt-2 ${c.text}`}>{value}</p>
          {trend && (
            <p className={`text-xs mt-1.5 font-medium ${trend.value >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        {icon && (
          <div className={`${c.iconBg} ${c.text} p-2.5 rounded-xl group-hover:scale-110 transition-transform duration-200`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};
