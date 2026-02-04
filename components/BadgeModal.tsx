import React from 'react';
import { X, Sparkles } from 'lucide-react';
import { LoadingSpinner } from './ui/LoadingSpinner';

interface BadgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  badgeType: string;
  content: string;
  loading: boolean;
}

export const BadgeModal: React.FC<BadgeModalProps> = ({ isOpen, onClose, badgeType, content, loading }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-[fadeIn_0.3s_ease-out] backdrop-blur-sm">
      <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-lg relative border-2 border-purple-100">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
        <h3 className="font-bold text-lg mb-4 flex gap-2 items-center text-purple-800">
          <Sparkles className="text-purple-600" /> Syarat {badgeType}
        </h3>
        <div className="bg-purple-50 p-4 rounded-lg text-sm text-gray-700 min-h-[100px] max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 text-purple-600 gap-3">
              <LoadingSpinner size="lg" color="border-purple-600" />
              <p className="animate-pulse">AI sedang menyemak buku log...</p>
            </div>
          ) : (
             <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: content }} />
          )}
        </div>
        <p className="text-[10px] text-gray-400 mt-2 text-center italic">
          Maklumat dijana oleh Gemini AI. Sila rujuk skim latihan rasmi untuk kepastian.
        </p>
      </div>
    </div>
  );
};