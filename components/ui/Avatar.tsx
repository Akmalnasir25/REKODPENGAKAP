import React from 'react';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  src?: string;
}

const sizeClasses: Record<string, { container: string; text: string }> = {
  sm: { container: 'w-8 h-8', text: 'text-xs' },
  md: { container: 'w-10 h-10', text: 'text-sm' },
  lg: { container: 'w-14 h-14', text: 'text-lg' },
  xl: { container: 'w-20 h-20', text: 'text-2xl' },
};

const gradients = [
  'from-blue-500 to-blue-600',
  'from-emerald-500 to-emerald-600',
  'from-purple-500 to-purple-600',
  'from-amber-500 to-amber-600',
  'from-rose-500 to-rose-600',
  'from-cyan-500 to-cyan-600',
  'from-indigo-500 to-indigo-600',
  'from-orange-500 to-orange-600',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

export const Avatar: React.FC<AvatarProps> = ({ name, size = 'md', className = '', src }) => {
  const s = sizeClasses[size];
  const gradient = getGradient(name);
  const initials = getInitials(name);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`${s.container} rounded-full object-cover ring-2 ring-white shadow-sm ${className}`}
      />
    );
  }

  return (
    <div
      className={`${s.container} rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center ring-2 ring-white shadow-sm ${className}`}
      title={name}
      aria-label={name}
    >
      <span className={`${s.text} font-bold text-white select-none`}>{initials}</span>
    </div>
  );
};
