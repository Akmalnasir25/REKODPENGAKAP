import { supabase } from './supabaseClient';

// ============================================================
// TYPES
// ============================================================

export interface LeaderRegisterInput {
  email: string;
  password: string;
  icNumber?: string;
  fullName: string;
  phoneNumber: string;
  leaderType: 'guru' | 'luar';
  schoolId?: string | null;
  negeriId?: string | null;
  daerahId?: string | null;
}

export interface LeaderLoginInput {
  email: string;
  password: string;
}

export interface LeaderAuthResult {
  success: boolean;
  message?: string;
  leader?: {
    id: string;
    email: string;
    fullName: string;
    icNumber: string;
    phoneNumber: string;
    leaderType: 'guru' | 'luar';
    schoolId?: string | null;
    schoolName?: string | null;
    negeriId?: string | null;
    negeriName?: string | null;
    daerahId?: string | null;
    daerahName?: string | null;
  };
}

// ============================================================
// PASSWORD HASHING (client-side SHA-256 + salt)
// ============================================================

const PASSWORD_SALT = 'scoutnadi_leader_2026';

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + PASSWORD_SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// VALIDATION HELPERS
// ============================================================

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateIC(ic: string): boolean {
  // Format: 12 digit (kad pengenalan Malaysia) ATAU pasport (alphanumeric 6-12)
  const cleanIC = ic.replace(/\D/g, '');
  if (cleanIC.length === 12) return true;
  // Allow alphanumeric for foreign / passport
  return /^[A-Z0-9]{6,12}$/i.test(ic.replace(/-/g, ''));
}

function validatePhone(phone: string): boolean {
  const clean = phone.replace(/\D/g, '');
  return clean.length >= 9 && clean.length <= 15;
}

// ============================================================
// REGISTER LEADER
// ============================================================

export async function registerLeader(input: LeaderRegisterInput): Promise<LeaderAuthResult> {
  try {
    // Validation
    if (!validateEmail(input.email)) {
      return { success: false, message: 'Format email tidak sah.' };
    }
    if (input.password.length < 8) {
      return { success: false, message: 'Kata laluan mesti sekurang-kurangnya 8 aksara.' };
    }
    if (!input.fullName.trim()) {
      return { success: false, message: 'Nama penuh diperlukan.' };
    }
    // IC opsyenal masa daftar - hanya validate jika ada
    if (input.icNumber && input.icNumber.trim() && !validateIC(input.icNumber)) {
      return { success: false, message: 'Nombor IC tidak sah (12 digit untuk warga Malaysia).' };
    }
    if (!validatePhone(input.phoneNumber)) {
      return { success: false, message: 'Nombor telefon tidak sah.' };
    }
    if (input.leaderType !== 'guru' && input.leaderType !== 'luar') {
      return { success: false, message: 'Jenis pemimpin tidak sah.' };
    }

    const email = input.email.trim().toLowerCase();
    // IC clean - null kalau kosong
    const icClean = input.icNumber && input.icNumber.trim()
      ? (input.icNumber.replace(/\D/g, '') || input.icNumber.trim().toUpperCase())
      : null;

    // Cek email duplicate
    const { data: existingEmail } = await supabase
      .from('leader_accounts')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existingEmail) {
      return { success: false, message: 'Email sudah berdaftar. Sila log masuk atau guna email lain.' };
    }

    // Cek IC duplicate
    const { data: existingIC } = await supabase
      .from('leader_accounts')
      .select('id')
      .eq('ic_number', icClean)
      .maybeSingle();
    if (existingIC) {
      return { success: false, message: 'Nombor IC sudah berdaftar dengan akaun lain.' };
    }

    // VALIDASI: Untuk pemimpin guru, sekolah mesti ada akaun school_user (claimed)
    if (input.leaderType === 'guru' && input.schoolId) {
      const { data: schoolCheck } = await supabase
        .from('schools')
        .select('id, name, school_code, is_claimed')
        .eq('id', input.schoolId)
        .maybeSingle();

      if (!schoolCheck) {
        return { success: false, message: 'Sekolah dipilih tidak dijumpai dalam database.' };
      }

      if (!schoolCheck.is_claimed) {
        return {
          success: false,
          message: `Sekolah "${schoolCheck.name}" belum mempunyai akaun pengguna sekolah. Sila hubungi pihak sekolah untuk daftar akaun terlebih dahulu sebelum anda boleh link sebagai pemimpin.`,
        };
      }
    }

    const passwordHash = await hashPassword(input.password);

    // Untuk guru dengan school_id - status pending sehingga di-approve
    const isLinkingSchool = input.leaderType === 'guru' && !!input.schoolId;
    const linkStatus = isLinkingSchool ? 'pending' : null;
    const requestedAt = isLinkingSchool ? new Date().toISOString() : null;

    const { data, error } = await supabase
      .from('leader_accounts')
      .insert({
        email,
        password_hash: passwordHash,
        ic_number: icClean,
        full_name: input.fullName.trim(),
        phone_number: input.phoneNumber.trim(),
        leader_type: input.leaderType,
        school_id: input.schoolId || null,
        negeri_id: input.negeriId || null,
        daerah_id: input.daerahId || null,
        email_verified: false,
        is_active: true,
        school_link_status: linkStatus,
        school_link_requested_at: requestedAt,
      })
      .select('id, email, full_name, ic_number, phone_number, leader_type, school_id, negeri_id, daerah_id, school_link_status, school:school_id(name, school_code), negeri:negeri_id(name), daerah:daerah_id(name)')
      .single();

    if (error || !data) {
      console.error('Register leader error:', error);
      return { success: false, message: error?.message || 'Gagal mendaftar akaun pemimpin.' };
    }

    return {
      success: true,
      leader: {
        id: data.id,
        email: data.email,
        fullName: data.full_name,
        icNumber: data.ic_number,
        phoneNumber: data.phone_number,
        leaderType: data.leader_type,
        schoolId: data.school_id,
        schoolName: (data as any).school?.name || null,
        schoolCode: (data as any).school?.school_code || null,
        negeriId: data.negeri_id,
        negeriName: (data as any).negeri?.name || null,
        daerahId: data.daerah_id,
        daerahName: (data as any).daerah?.name || null,
      } as any,
    };
  } catch (err: any) {
    console.error('registerLeader error:', err);
    return { success: false, message: err.message || 'Ralat sistem semasa pendaftaran.' };
  }
}

// ============================================================
// LOGIN LEADER
// ============================================================

export async function loginLeader(input: LeaderLoginInput): Promise<LeaderAuthResult> {
  try {
    if (!validateEmail(input.email)) {
      return { success: false, message: 'Format email tidak sah.' };
    }
    if (!input.password) {
      return { success: false, message: 'Kata laluan diperlukan.' };
    }

    const email = input.email.trim().toLowerCase();
    const passwordHash = await hashPassword(input.password);

    const { data, error } = await supabase
      .from('leader_accounts')
      .select('id, email, password_hash, full_name, ic_number, phone_number, leader_type, school_id, negeri_id, daerah_id, is_active, school_link_status, school:school_id(name, school_code), negeri:negeri_id(name), daerah:daerah_id(name)')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error('Login error:', error);
      return { success: false, message: 'Ralat semasa log masuk.' };
    }

    if (!data) {
      return { success: false, message: 'Email atau kata laluan salah.' };
    }

    if (!data.is_active) {
      return { success: false, message: 'Akaun anda telah dinyahaktifkan. Sila hubungi admin.' };
    }

    if (data.password_hash !== passwordHash) {
      return { success: false, message: 'Email atau kata laluan salah.' };
    }

    // Update last_login
    await supabase
      .from('leader_accounts')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', data.id);

    return {
      success: true,
      leader: {
        id: data.id,
        email: data.email,
        fullName: data.full_name,
        icNumber: data.ic_number,
        phoneNumber: data.phone_number,
        leaderType: data.leader_type,
        schoolId: data.school_id,
        schoolName: (data as any).school?.name || null,
        schoolCode: (data as any).school?.school_code || null,
        schoolLinkStatus: data.school_link_status,
        passwordHash: passwordHash, // Untuk auth ke edge function
        negeriId: data.negeri_id,
        negeriName: (data as any).negeri?.name || null,
        daerahId: data.daerah_id,
        daerahName: (data as any).daerah?.name || null,
      } as any,
    };
  } catch (err: any) {
    console.error('loginLeader error:', err);
    return { success: false, message: err.message || 'Ralat sistem semasa log masuk.' };
  }
}

// ============================================================
// CHANGE PASSWORD (oleh leader sendiri, perlu sah pwd lama)
// ============================================================

export async function changeLeaderPassword(
  leaderId: string,
  oldPassword: string,
  newPassword: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    if (newPassword.length < 8) {
      return { success: false, message: 'Kata laluan baru mesti sekurang-kurangnya 8 aksara.' };
    }

    const { data } = await supabase
      .from('leader_accounts')
      .select('password_hash')
      .eq('id', leaderId)
      .maybeSingle();

    if (!data) return { success: false, message: 'Akaun tidak dijumpai.' };

    const oldHash = await hashPassword(oldPassword);
    if (data.password_hash !== oldHash) {
      return { success: false, message: 'Kata laluan lama salah.' };
    }

    const newHash = await hashPassword(newPassword);
    const { error } = await supabase
      .from('leader_accounts')
      .update({ password_hash: newHash, updated_at: new Date().toISOString() })
      .eq('id', leaderId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message || 'Ralat sistem.' };
  }
}

// ============================================================
// RESET PASSWORD (guna IC + email sebagai security check)
// ============================================================

export async function resetLeaderPasswordByIC(
  email: string,
  icNumber: string,
  newPassword: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    if (newPassword.length < 8) {
      return { success: false, message: 'Kata laluan baru mesti sekurang-kurangnya 8 aksara.' };
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanIC = icNumber.replace(/\D/g, '') || icNumber.trim().toUpperCase();

    const { data } = await supabase
      .from('leader_accounts')
      .select('id, ic_number')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (!data) {
      return { success: false, message: 'Email tidak berdaftar dalam sistem.' };
    }

    if (data.ic_number !== cleanIC) {
      return { success: false, message: 'Maklumat tidak sepadan. Pastikan IC betul.' };
    }

    const newHash = await hashPassword(newPassword);
    const { error } = await supabase
      .from('leader_accounts')
      .update({ password_hash: newHash, updated_at: new Date().toISOString() })
      .eq('id', data.id);

    if (error) return { success: false, message: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message || 'Ralat sistem.' };
  }
}

// ============================================================
// SESSION HELPERS
// ============================================================

const LEADER_SESSION_KEY = 'LEADER_SESSION_DATA';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function saveLeaderSession(leader: NonNullable<LeaderAuthResult['leader']>): void {
  const session = {
    leaderId: leader.id,
    email: leader.email,
    fullName: leader.fullName,
    icNumber: leader.icNumber,
    phoneNumber: leader.phoneNumber,
    leaderType: leader.leaderType,
    schoolId: leader.schoolId,
    schoolName: leader.schoolName,
    schoolCode: (leader as any).schoolCode || null,
    schoolLinkStatus: (leader as any).schoolLinkStatus || null,
    passwordHash: (leader as any).passwordHash || null,
    negeriId: leader.negeriId,
    negeriName: leader.negeriName,
    daerahId: leader.daerahId,
    daerahName: leader.daerahName,
    isLoggedIn: true,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  };
  localStorage.setItem(LEADER_SESSION_KEY, JSON.stringify(session));
}

export function getLeaderSession(): any | null {
  try {
    const raw = localStorage.getItem(LEADER_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (session.expiresAt && session.expiresAt < Date.now()) {
      localStorage.removeItem(LEADER_SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function clearLeaderSession(): void {
  localStorage.removeItem(LEADER_SESSION_KEY);
}

export const LEADER_SESSION_STORAGE_KEY = LEADER_SESSION_KEY;
// ============================================================
// UPDATE LEADER PROFILE
// ============================================================

export interface UpdateLeaderProfileInput {
  fullName?: string;
  icNumber?: string;
  phoneNumber?: string;
}

export async function updateLeaderProfile(
  leaderId: string,
  input: UpdateLeaderProfileInput,
): Promise<{ success: boolean; message?: string; updatedSession?: any }> {
  try {
    const update: any = {};

    if (input.fullName !== undefined) {
      if (!input.fullName.trim()) return { success: false, message: 'Nama penuh tidak boleh kosong.' };
      update.full_name = input.fullName.trim();
    }

    if (input.icNumber !== undefined) {
      if (input.icNumber.trim()) {
        if (!validateIC(input.icNumber)) {
          return { success: false, message: 'Nombor IC tidak sah.' };
        }
        const icClean = input.icNumber.replace(/\D/g, '') || input.icNumber.trim().toUpperCase();
        // Cek IC duplicate (tapi bukan diri sendiri)
        const { data: existingIC } = await supabase
          .from('leader_accounts')
          .select('id')
          .eq('ic_number', icClean)
          .neq('id', leaderId)
          .maybeSingle();
        if (existingIC) {
          return { success: false, message: 'Nombor IC sudah berdaftar dengan akaun lain.' };
        }
        update.ic_number = icClean;
      } else {
        update.ic_number = null;
      }
    }

    if (input.phoneNumber !== undefined) {
      if (!validatePhone(input.phoneNumber)) {
        return { success: false, message: 'Nombor telefon tidak sah.' };
      }
      update.phone_number = input.phoneNumber.trim();
    }

    if (Object.keys(update).length === 0) {
      return { success: false, message: 'Tiada perubahan.' };
    }

    update.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('leader_accounts')
      .update(update)
      .eq('id', leaderId);

    if (error) return { success: false, message: error.message };

    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message || 'Ralat sistem.' };
  }
}