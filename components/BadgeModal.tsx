import React, { useEffect, useRef } from 'react';
import { X, Sparkles, Award } from 'lucide-react';
import { LoadingSpinner } from './ui/LoadingSpinner';

interface BadgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  badgeType: string;
  content: string;
  loading: boolean;
}

// Safe HTML renderer - strips scripts and dangerous attributes
const SafeContent: React.FC<{ html: string }> = ({ html }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !html) return;
    
    // Parse and sanitize
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Remove dangerous elements
    const dangerous = doc.querySelectorAll('script, iframe, object, embed, form, input, link, style, meta');
    dangerous.forEach(el => el.remove());
    
    // Remove dangerous attributes
    const allElements = doc.body.querySelectorAll('*');
    allElements.forEach(el => {
      const attrs = Array.from(el.attributes);
      attrs.forEach(attr => {
        if (attr.name.startsWith('on') || attr.name === 'style' || attr.name === 'srcdoc') {
          el.removeAttribute(attr.name);
        }
        if (attr.name === 'href' && attr.value.toLowerCase().startsWith('javascript:')) {
          el.removeAttribute(attr.name);
        }
      });
    });
    
    containerRef.current.innerHTML = doc.body.innerHTML;
  }, [html]);

  // Check if content looks like HTML
  const isHTML = /<[a-z][\s\S]*>/i.test(html);
  
  if (!isHTML) {
    return <div className="whitespace-pre-wrap break-words leading-relaxed">{html}</div>;
  }

  return <div ref={containerRef} className="prose prose-sm max-w-none prose-li:marker:text-purple-400" />;
};

export const BadgeModal: React.FC<BadgeModalProps> = ({ isOpen, onClose, badgeType, content, loading }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="badge-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      style={{ animation: 'fadeIn 0.2s ease-out' }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
      <div 
        className="bg-white p-0 rounded-2xl shadow-2xl w-full max-w-lg relative border border-purple-100/50 overflow-hidden"
        style={{ animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* Header gradient */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 id="badge-modal-title" className="font-bold text-lg text-white flex gap-2 items-center">
              <Award className="w-5 h-5" /> Syarat {badgeType || 'Lencana'}
            </h3>
            <button 
              onClick={onClose} 
              className="text-white/70 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-all duration-200"
              aria-label="Tutup"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-purple-400/20 rounded-full blur-xl animate-pulse" />
                <div className="relative bg-purple-50 p-4 rounded-2xl">
                  <Sparkles className="w-8 h-8 text-purple-500 animate-pulse" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700">AI sedang menganalisis...</p>
                <p className="text-xs text-gray-400 mt-1">Sila tunggu sebentar</p>
              </div>
              <LoadingSpinner size="sm" color="border-purple-500" />
            </div>
          ) : (
            <div className="text-sm text-gray-700">
              <SafeContent html={content} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 text-center italic flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3" />
            Maklumat dijana oleh Gemini AI. Sila rujuk skim latihan rasmi untuk kepastian.
          </p>
        </div>
      </div>
    </div>
  );
};
