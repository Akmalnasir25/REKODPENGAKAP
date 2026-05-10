import React, { useState, useRef } from 'react';
import { Paperclip, Upload, X, File, Image, FileText, Download, Eye } from 'lucide-react';

export interface FileAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  uploadedAt: number;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'image/gif'];

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return <Image size={16} className="text-green-600" />;
  if (type === 'application/pdf') return <FileText size={16} className="text-red-600" />;
  return <File size={16} className="text-gray-600" />;
};

interface FileUploadProps {
  attachments: FileAttachment[];
  onChange: (attachments: FileAttachment[]) => void;
  maxFiles?: number;
  label?: string;
  className?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  attachments,
  onChange,
  maxFiles = 5,
  label = 'Lampiran',
  className = ''
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    setError('');

    const newAttachments: FileAttachment[] = [...attachments];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validate
      if (newAttachments.length >= maxFiles) {
        setError(`Maksimum ${maxFiles} fail sahaja.`);
        break;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`Format ${file.type} tidak disokong. Gunakan JPG, PNG, WebP, atau PDF.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`Fail "${file.name}" melebihi had 2MB.`);
        continue;
      }

      // Read as base64
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const attachment: FileAttachment = {
          id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl,
          uploadedAt: Date.now(),
        };
        newAttachments.push(attachment);
        onChange([...newAttachments]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemove = (id: string) => {
    onChange(attachments.filter(a => a.id !== id));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDownload = (attachment: FileAttachment) => {
    const a = document.createElement('a');
    a.href = attachment.dataUrl;
    a.download = attachment.name;
    a.click();
  };

  return (
    <div className={className}>
      <label className="text-xs text-gray-500 font-bold uppercase block mb-2">{label}</label>
      
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition
          ${dragOver ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800'}
          ${attachments.length >= maxFiles ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <Upload size={20} className="mx-auto text-gray-400 mb-1" />
        <p className="text-xs text-gray-500">
          Seret fail ke sini atau <span className="text-blue-600 font-bold">klik untuk pilih</span>
        </p>
        <p className="text-[10px] text-gray-400 mt-1">JPG, PNG, WebP, PDF (Maks 2MB)</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={attachments.length >= maxFiles}
      />

      {/* Error */}
      {error && <p className="text-[10px] text-red-500 mt-1 font-bold">{error}</p>}

      {/* File list */}
      {attachments.length > 0 && (
        <div className="mt-3 space-y-2">
          {attachments.map(att => (
            <div key={att.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
              {getFileIcon(att.type)}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{att.name}</p>
                <p className="text-[10px] text-gray-400">{formatFileSize(att.size)}</p>
              </div>
              <div className="flex items-center gap-1">
                {att.type.startsWith('image/') && (
                  <button onClick={() => setPreviewUrl(att.dataUrl)} className="p-1 text-gray-400 hover:text-blue-600 transition" title="Pratonton">
                    <Eye size={12} />
                  </button>
                )}
                <button onClick={() => handleDownload(att)} className="p-1 text-gray-400 hover:text-green-600 transition" title="Muat turun">
                  <Download size={12} />
                </button>
                <button onClick={() => handleRemove(att.id)} className="p-1 text-gray-400 hover:text-red-600 transition" title="Padam">
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setPreviewUrl(null)}>
          <div className="relative max-w-3xl max-h-[80vh]">
            <button onClick={() => setPreviewUrl(null)} className="absolute -top-3 -right-3 bg-white rounded-full p-1 shadow-lg text-gray-600 hover:text-red-600">
              <X size={16} />
            </button>
            <img src={previewUrl} alt="Preview" className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain" />
          </div>
        </div>
      )}
    </div>
  );
};
