import React from 'react';
import { FileX, Search, Users, Database, Shield, Inbox, FolderOpen } from 'lucide-react';

type EmptyStateVariant = 'no-data' | 'no-results' | 'no-users' | 'no-schools' | 'no-access' | 'empty-inbox' | 'empty-folder';

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  title?: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  compact?: boolean;
}

const variantConfig: Record<EmptyStateVariant, { icon: React.ReactNode; defaultTitle: string; defaultDesc: string; color: string }> = {
  'no-data': {
    icon: <Database className="w-12 h-12" />,
    defaultTitle: 'Tiada Data',
    defaultDesc: 'Belum ada data yang direkodkan. Mulakan dengan menambah data baru.',
    color: 'text-blue-400',
  },
  'no-results': {
    icon: <Search className="w-12 h-12" />,
    defaultTitle: 'Tiada Keputusan',
    defaultDesc: 'Carian anda tidak menemui sebarang padanan. Cuba kata kunci lain.',
    color: 'text-gray-400',
  },
  'no-users': {
    icon: <Users className="w-12 h-12" />,
    defaultTitle: 'Tiada Pengguna',
    defaultDesc: 'Belum ada pengguna yang berdaftar dalam sistem.',
    color: 'text-purple-400',
  },
  'no-schools': {
    icon: <FileX className="w-12 h-12" />,
    defaultTitle: 'Tiada Sekolah',
    defaultDesc: 'Belum ada sekolah yang didaftarkan. Tambah sekolah untuk bermula.',
    color: 'text-amber-400',
  },
  'no-access': {
    icon: <Shield className="w-12 h-12" />,
    defaultTitle: 'Akses Terhad',
    defaultDesc: 'Anda tidak mempunyai kebenaran untuk melihat kandungan ini.',
    color: 'text-red-400',
  },
  'empty-inbox': {
    icon: <Inbox className="w-12 h-12" />,
    defaultTitle: 'Peti Masuk Kosong',
    defaultDesc: 'Tiada notifikasi atau mesej baru.',
    color: 'text-green-400',
  },
  'empty-folder': {
    icon: <FolderOpen className="w-12 h-12" />,
    defaultTitle: 'Folder Kosong',
    defaultDesc: 'Tiada fail dalam folder ini.',
    color: 'text-orange-400',
  },
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  variant = 'no-data',
  title,
  description,
  action,
  className = '',
  compact = false,
}) => {
  const config = variantConfig[variant];

  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8 px-4' : 'py-16 px-6'} ${className}`}>
      {/* Decorative circles */}
      <div className="relative mb-6">
        <div className={`absolute inset-0 ${config.color} opacity-10 rounded-full blur-xl scale-150`} />
        <div className={`relative ${config.color} p-4 rounded-2xl bg-gray-50 border border-gray-100`}>
          {config.icon}
        </div>
      </div>

      <h3 className={`font-bold text-gray-800 mb-2 ${compact ? 'text-base' : 'text-lg'}`}>
        {title || config.defaultTitle}
      </h3>
      <p className={`text-gray-500 max-w-sm leading-relaxed ${compact ? 'text-xs' : 'text-sm'}`}>
        {description || config.defaultDesc}
      </p>

      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:scale-95 transition-all duration-200 shadow-sm hover:shadow-md"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
