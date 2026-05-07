import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info' | 'purple';
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

const variantClasses: Record<string, string> = {
  default: 'bg-gray-100 text-gray-700 border-gray-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
};

const dotColors: Record<string, string> = {
  default: 'bg-gray-400',
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
  purple: 'bg-purple-500',
};

export const StatusBadge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'sm',
  dot = false,
  className = '',
}) => {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-medium border rounded-full
        ${variantClasses[variant]}
        ${size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'}
        ${className}
      `}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  );
};

// Progress Bar
interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  color?: 'blue' | 'green' | 'amber' | 'red' | 'purple';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  animated?: boolean;
}

const progressColors: Record<string, string> = {
  blue: 'bg-blue-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
};

const progressBgColors: Record<string, string> = {
  blue: 'bg-blue-100',
  green: 'bg-emerald-100',
  amber: 'bg-amber-100',
  red: 'bg-red-100',
  purple: 'bg-purple-100',
};

const progressSizes: Record<string, string> = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  label,
  showValue = false,
  color = 'blue',
  size = 'md',
  className = '',
  animated = true,
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-1.5">
          {label && <span className="text-xs font-medium text-gray-600">{label}</span>}
          {showValue && <span className="text-xs font-semibold text-gray-700">{Math.round(percentage)}%</span>}
        </div>
      )}
      <div className={`w-full ${progressBgColors[color]} rounded-full overflow-hidden ${progressSizes[size]}`}>
        <div
          className={`${progressColors[color]} ${progressSizes[size]} rounded-full transition-all duration-700 ease-out ${
            animated ? 'relative overflow-hidden' : ''
          }`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        >
          {animated && (
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
              style={{ animation: 'shimmerProgress 2s ease-in-out infinite' }}
            />
          )}
        </div>
      </div>
      <style>{`
        @keyframes shimmerProgress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
};
