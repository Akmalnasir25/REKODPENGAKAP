import React, { useState } from 'react';
import { MessageCircle, Send, Users, Copy, Check, ExternalLink } from 'lucide-react';
import { SubmissionData } from '../../types';

interface BulkWhatsAppProps {
  data: SubmissionData[];
  className?: string;
}

/**
 * Format phone number for WhatsApp (Malaysian format)
 */
const formatWhatsAppNumber = (phone: string | number): string | null => {
  if (!phone) return null;
  let cleaned = String(phone).replace(/[^0-9+]/g, '');
  
  // Malaysian number formats
  if (cleaned.startsWith('0')) {
    cleaned = '60' + cleaned.slice(1);
  } else if (cleaned.startsWith('+60')) {
    cleaned = cleaned.slice(1);
  } else if (!cleaned.startsWith('60')) {
    cleaned = '60' + cleaned;
  }
  
  // Validate length (Malaysian mobile: 60 + 9-10 digits)
  if (cleaned.length < 11 || cleaned.length > 12) return null;
  return cleaned;
};

/**
 * Generate WhatsApp click-to-chat URL
 */
const getWhatsAppUrl = (phone: string | number, message: string): string => {
  const formatted = formatWhatsAppNumber(phone);
  if (!formatted) return '';
  return `https://wa.me/${formatted}?text=${encodeURIComponent(message)}`;
};

/**
 * Template messages
 */
const MESSAGE_TEMPLATES = {
  deadline: (badge: string, days: number) => 
    `Assalamualaikum & Salam Sejahtera,\n\nIni adalah peringatan bahawa tarikh akhir pendaftaran *${badge}* tinggal *${days} hari* lagi.\n\nSila pastikan pendaftaran dilengkapkan sebelum tarikh akhir.\n\nTerima kasih.`,
  
  confirmation: (name: string, badge: string) =>
    `Assalamualaikum & Salam Sejahtera,\n\nPendaftaran *${name}* untuk *${badge}* telah berjaya diterima.\n\nTerima kasih atas kerjasama anda.`,
  
  reminder: (school: string) =>
    `Assalamualaikum & Salam Sejahtera,\n\nIni adalah peringatan kepada *${school}* untuk melengkapkan pendaftaran pengakap tahun semasa.\n\nSila log masuk ke sistem untuk kemaskini data.\n\nTerima kasih.`,
  
  custom: '',
};

export const BulkWhatsApp: React.FC<BulkWhatsAppProps> = ({ data, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<keyof typeof MESSAGE_TEMPLATES>('reminder');
  const [customMessage, setCustomMessage] = useState('');
  const [copied, setCopied] = useState(false);

  // Get unique contacts with phone numbers
  const contacts = React.useMemo(() => {
    const seen = new Set<string>();
    return data
      .filter(d => d.studentPhone && formatWhatsAppNumber(d.studentPhone))
      .filter(d => {
        const phone = formatWhatsAppNumber(d.studentPhone!);
        if (!phone || seen.has(phone)) return false;
        seen.add(phone);
        return true;
      })
      .map(d => ({
        name: d.student,
        phone: d.studentPhone!,
        school: d.school,
        formatted: formatWhatsAppNumber(d.studentPhone!)!,
      }));
  }, [data]);

  const getMessage = (): string => {
    if (selectedTemplate === 'custom') return customMessage;
    if (selectedTemplate === 'reminder') return MESSAGE_TEMPLATES.reminder('Sekolah');
    if (selectedTemplate === 'deadline') return MESSAGE_TEMPLATES.deadline('Lencana', 7);
    return MESSAGE_TEMPLATES.confirmation('Peserta', 'Lencana');
  };

  const handleCopyAll = () => {
    const numbers = contacts.map(c => c.formatted).join('\n');
    navigator.clipboard.writeText(numbers);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendSingle = (phone: string | number) => {
    const url = getWhatsAppUrl(phone, getMessage());
    if (url) window.open(url, '_blank');
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(true)}
        disabled={contacts.length === 0}
        className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-bold hover:bg-green-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <MessageCircle size={14} /> WhatsApp ({contacts.length})
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b bg-green-50">
              <h3 className="font-bold text-green-800 flex items-center gap-2">
                <MessageCircle size={18} /> Hantar WhatsApp
              </h3>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Template Selection */}
              <div>
                <label className="text-xs font-bold text-gray-600 uppercase block mb-2">Template Mesej</label>
                <select
                  value={selectedTemplate}
                  onChange={e => setSelectedTemplate(e.target.value as any)}
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 outline-none"
                >
                  <option value="reminder">Peringatan Pendaftaran</option>
                  <option value="deadline">Peringatan Tarikh Akhir</option>
                  <option value="confirmation">Pengesahan Pendaftaran</option>
                  <option value="custom">Mesej Sendiri</option>
                </select>
              </div>

              {/* Message Preview / Custom Input */}
              <div>
                <label className="text-xs font-bold text-gray-600 uppercase block mb-2">Mesej</label>
                {selectedTemplate === 'custom' ? (
                  <textarea
                    value={customMessage}
                    onChange={e => setCustomMessage(e.target.value)}
                    placeholder="Taip mesej anda di sini..."
                    className="w-full p-3 border border-gray-300 rounded-lg text-sm h-28 resize-none focus:ring-2 focus:ring-green-500 outline-none"
                  />
                ) : (
                  <div className="bg-gray-50 p-3 rounded-lg text-xs text-gray-700 whitespace-pre-wrap border">
                    {getMessage()}
                  </div>
                )}
              </div>

              {/* Contact List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-gray-600 uppercase flex items-center gap-1">
                    <Users size={12} /> Senarai Kenalan ({contacts.length})
                  </label>
                  <button
                    onClick={handleCopyAll}
                    className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 transition"
                  >
                    {copied ? <Check size={10} /> : <Copy size={10} />}
                    {copied ? 'Disalin!' : 'Salin Semua No.'}
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                  {contacts.slice(0, 50).map((contact, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                      <div>
                        <p className="text-xs font-bold text-gray-800">{contact.name}</p>
                        <p className="text-[10px] text-gray-500">{contact.phone} • {contact.school}</p>
                      </div>
                      <button
                        onClick={() => handleSendSingle(contact.phone)}
                        className="bg-green-500 text-white p-1.5 rounded-full hover:bg-green-600 transition"
                        title="Hantar WhatsApp"
                      >
                        <Send size={10} />
                      </button>
                    </div>
                  ))}
                  {contacts.length > 50 && (
                    <div className="px-3 py-2 text-center text-[10px] text-gray-400">
                      +{contacts.length - 50} lagi kenalan
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t bg-gray-50 flex items-center justify-between">
              <p className="text-[10px] text-gray-400">
                WhatsApp akan dibuka dalam tab baru untuk setiap kenalan
              </p>
              <button onClick={() => setIsOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-300 transition">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Single WhatsApp link component (inline)
 */
export const WhatsAppLink: React.FC<{ phone?: string; message?: string; className?: string }> = ({ phone, message = '', className = '' }) => {
  if (!phone) return <span className="text-xs text-gray-400">-</span>;
  
  const formatted = formatWhatsAppNumber(phone);
  if (!formatted) return <span className="text-xs text-gray-600">{phone}</span>;

  const url = `https://wa.me/${formatted}${message ? '?text=' + encodeURIComponent(message) : ''}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-900 font-medium transition ${className}`}
      title="Buka WhatsApp"
    >
      <MessageCircle size={11} />
      {phone}
      <ExternalLink size={9} className="opacity-50" />
    </a>
  );
};
