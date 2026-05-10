/**
 * Audit Trail Service
 * Records user actions for accountability and tracking
 */

export interface AuditEntry {
  id: string;
  timestamp: number;
  action: AuditAction;
  actor: string; // schoolCode, admin username, or 'SYSTEM'
  actorRole: 'user' | 'admin' | 'district' | 'negeri' | 'daerah' | 'developer' | 'system';
  details: string;
  metadata?: Record<string, any>;
}

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'REGISTER'
  | 'SUBMIT_FORM'
  | 'DELETE_RECORD'
  | 'UPDATE_RECORD'
  | 'BULK_IMPORT'
  | 'LOCK_BADGE'
  | 'UNLOCK_BADGE'
  | 'APPROVE_BADGE'
  | 'ADD_SCHOOL'
  | 'DELETE_SCHOOL'
  | 'UPDATE_PERMISSION'
  | 'TOGGLE_REGISTRATION'
  | 'CHANGE_PASSWORD'
  | 'UPDATE_PROFILE'
  | 'EXPORT_DATA'
  | 'GENERATE_PDF'
  | 'MIGRATE_YEAR'
  | 'SYSTEM_CONFIG';

const STORAGE_KEY = 'AUDIT_TRAIL';
const MAX_ENTRIES = 500;

/**
 * Get all audit entries
 */
export const getAuditLog = (): AuditEntry[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

/**
 * Add new audit entry
 */
export const logAudit = (
  action: AuditAction,
  actor: string,
  actorRole: AuditEntry['actorRole'],
  details: string,
  metadata?: Record<string, any>
): void => {
  const entry: AuditEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    action,
    actor,
    actorRole,
    details,
    metadata,
  };

  const log = getAuditLog();
  const updated = [entry, ...log].slice(0, MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};

/**
 * Filter audit log by criteria
 */
export const filterAuditLog = (options: {
  actor?: string;
  action?: AuditAction;
  actorRole?: AuditEntry['actorRole'];
  startDate?: number;
  endDate?: number;
  search?: string;
}): AuditEntry[] => {
  let log = getAuditLog();

  if (options.actor) {
    log = log.filter(e => e.actor.toUpperCase().includes(options.actor!.toUpperCase()));
  }
  if (options.action) {
    log = log.filter(e => e.action === options.action);
  }
  if (options.actorRole) {
    log = log.filter(e => e.actorRole === options.actorRole);
  }
  if (options.startDate) {
    log = log.filter(e => e.timestamp >= options.startDate!);
  }
  if (options.endDate) {
    log = log.filter(e => e.timestamp <= options.endDate!);
  }
  if (options.search) {
    const q = options.search.toLowerCase();
    log = log.filter(e => 
      e.details.toLowerCase().includes(q) || 
      e.actor.toLowerCase().includes(q) ||
      e.action.toLowerCase().includes(q)
    );
  }

  return log;
};

/**
 * Clear all audit entries
 */
export const clearAuditLog = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

/**
 * Export audit log as CSV
 */
export const exportAuditCSV = (entries?: AuditEntry[]): string => {
  const log = entries || getAuditLog();
  const headers = ['Tarikh', 'Masa', 'Tindakan', 'Pengguna', 'Peranan', 'Butiran'];
  
  const rows = log.map(e => {
    const date = new Date(e.timestamp);
    return [
      date.toLocaleDateString('ms-MY'),
      date.toLocaleTimeString('ms-MY'),
      e.action,
      e.actor,
      e.actorRole,
      `"${e.details.replace(/"/g, '""')}"`,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
};

/**
 * Get action label in Malay
 */
export const getActionLabel = (action: AuditAction): string => {
  const labels: Record<AuditAction, string> = {
    LOGIN: 'Log Masuk',
    LOGOUT: 'Log Keluar',
    REGISTER: 'Daftar Akaun',
    SUBMIT_FORM: 'Hantar Borang',
    DELETE_RECORD: 'Padam Rekod',
    UPDATE_RECORD: 'Kemaskini Rekod',
    BULK_IMPORT: 'Import Data',
    LOCK_BADGE: 'Kunci Lencana',
    UNLOCK_BADGE: 'Buka Kunci Lencana',
    APPROVE_BADGE: 'Sahkan Lencana',
    ADD_SCHOOL: 'Tambah Sekolah',
    DELETE_SCHOOL: 'Padam Sekolah',
    UPDATE_PERMISSION: 'Ubah Kebenaran',
    TOGGLE_REGISTRATION: 'Tukar Status Pendaftaran',
    CHANGE_PASSWORD: 'Tukar Kata Laluan',
    UPDATE_PROFILE: 'Kemaskini Profil',
    EXPORT_DATA: 'Eksport Data',
    GENERATE_PDF: 'Jana PDF',
    MIGRATE_YEAR: 'Migrasi Tahun',
    SYSTEM_CONFIG: 'Konfigurasi Sistem',
  };
  return labels[action] || action;
};

/**
 * Get action color for UI
 */
export const getActionColor = (action: AuditAction): string => {
  const colors: Record<string, string> = {
    LOGIN: 'bg-green-100 text-green-700',
    LOGOUT: 'bg-gray-100 text-gray-700',
    REGISTER: 'bg-blue-100 text-blue-700',
    SUBMIT_FORM: 'bg-blue-100 text-blue-700',
    DELETE_RECORD: 'bg-red-100 text-red-700',
    DELETE_SCHOOL: 'bg-red-100 text-red-700',
    UPDATE_RECORD: 'bg-amber-100 text-amber-700',
    BULK_IMPORT: 'bg-purple-100 text-purple-700',
    LOCK_BADGE: 'bg-orange-100 text-orange-700',
    UNLOCK_BADGE: 'bg-green-100 text-green-700',
    APPROVE_BADGE: 'bg-emerald-100 text-emerald-700',
    SYSTEM_CONFIG: 'bg-slate-100 text-slate-700',
  };
  return colors[action] || 'bg-gray-100 text-gray-600';
};
