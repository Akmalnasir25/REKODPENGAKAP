import React from 'react';

export const LoadingSpinner: React.FC<{ size?: 'sm' | 'md' | 'lg', color?: string }> = ({ size = 'md', color = 'border-blue-600' }) => {
  const dims = size === 'sm' ? 'w-4 h-4 border-2' : size === 'lg' ? 'w-8 h-8 border-4' : 'w-6 h-6 border-4';
  
  return (
    <div className={`${dims} ${color} border-t-transparent rounded-full animate-spin`}></div>
  );
};