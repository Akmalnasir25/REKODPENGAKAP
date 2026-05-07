import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'card';
  width?: string;
  height?: string;
  lines?: number;
}

const shimmerStyle = `
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
`;

const baseClass = 'rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]';
const animClass = 'motion-reduce:animate-none';

export const Skeleton: React.FC<SkeletonProps> = ({ 
  className = '', 
  variant = 'text', 
  width, 
  height,
  lines = 1 
}) => {
  const style: React.CSSProperties = {
    animation: 'shimmer 1.5s ease-in-out infinite',
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };

  if (variant === 'card') {
    return (
      <>
        <style>{shimmerStyle}</style>
        <div className={`${baseClass} ${animClass} rounded-xl p-6 space-y-4 ${className}`} style={{ ...style, height: height || '180px' }}>
          <div className="bg-gray-300/40 rounded h-4 w-1/3"></div>
          <div className="bg-gray-300/40 rounded h-8 w-2/3"></div>
          <div className="bg-gray-300/40 rounded h-3 w-full"></div>
          <div className="bg-gray-300/40 rounded h-3 w-4/5"></div>
        </div>
      </>
    );
  }

  if (variant === 'circular') {
    return (
      <>
        <style>{shimmerStyle}</style>
        <div className={`${baseClass} ${animClass} rounded-full ${className}`} style={{ ...style, width: width || '40px', height: height || '40px' }} />
      </>
    );
  }

  if (variant === 'rectangular') {
    return (
      <>
        <style>{shimmerStyle}</style>
        <div className={`${baseClass} ${animClass} rounded-lg ${className}`} style={{ ...style, height: height || '120px' }} />
      </>
    );
  }

  // Text variant
  return (
    <>
      <style>{shimmerStyle}</style>
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${baseClass} ${animClass} h-4 rounded`}
            style={{ ...style, width: i === lines - 1 && lines > 1 ? '75%' : width || '100%' }}
          />
        ))}
      </div>
    </>
  );
};

// Pre-built skeleton layouts
export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 5, cols = 4 }) => (
  <>
    <style>{shimmerStyle}</style>
    <div className="space-y-3">
      {/* Header */}
      <div className="flex gap-4 p-3 bg-gray-50 rounded-lg">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className={`${baseClass} h-4 rounded flex-1`} style={{ animation: 'shimmer 1.5s ease-in-out infinite' }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 p-3">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className={`${baseClass} h-4 rounded flex-1`} style={{ animation: 'shimmer 1.5s ease-in-out infinite', animationDelay: `${(r * cols + c) * 50}ms` }} />
          ))}
        </div>
      ))}
    </div>
  </>
);

export const DashboardSkeleton: React.FC = () => (
  <>
    <style>{shimmerStyle}</style>
    <div className="space-y-6 p-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className={`${baseClass} rounded-xl h-24`} style={{ animation: 'shimmer 1.5s ease-in-out infinite', animationDelay: `${i * 100}ms` }} />
        ))}
      </div>
      {/* Table */}
      <div className={`${baseClass} rounded-xl h-64`} style={{ animation: 'shimmer 1.5s ease-in-out infinite', animationDelay: '500ms' }} />
    </div>
  </>
);
