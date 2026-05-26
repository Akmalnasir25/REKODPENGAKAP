import { supabase, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from './supabaseClient';

// ============================================================
// TYPES
// ============================================================

export interface RegisterSchoolInput {
  schoolId: string;
  schoolCode: string;
  email: string;
  password: string;
  fullName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  status: 'success' | 'error';
  message?: string;
  user?: {
    id: string;
    email: string;
    schoolName?: string;
    schoolCode?: string;
    schoolId?: string;
    role?: string;
  };
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  school_id: string | null;
  negeri_id: string | null;
  daerah_id: string | null;
  is_active: boolean;
}

// ============================================================
// REGISTER SCHOOL USER (via Edge Function)
// ============================================================

export const registerSchoolUser = async (input: RegisterSchoolInput): Promise<AuthResult> => {
  try {
    const response = await fetch(`${EDGE_FUNCTION_URL}/register-school-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(input),
    });

    const result = await response.json();
    return result;
  } catch (error: any) {
    return { status: 'error', message: 'Gagal menghubungi server. Sila cuba lagi.' };
  }
};

// ============================================================
// LOGIN ADMIN / REGIONAL ADMIN (Supabase Auth, GAS data remains)
// ============================================================

export const loginAdminSupabase = async (
  input: LoginInput,
  expectedRole?: 'negeri' | 'daerah' | 'admin' | 'developer'
): Promise<{ status: 'success' | 'error'; message?: string; admin?: any }> => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email.trim(),
      password: input.password,
    });

    if (error || !data.user) {
      return { status: 'error', message: error?.message || 'Log masuk admin gagal.' };
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        full_name,
        role,
        is_active,
        negeri:negeri_id(code, name),
        daerah:daerah_id(code, name)
      `)
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile || !profile.is_active) {
      await supabase.auth.signOut();
      return { status: 'error', message: 'Profil admin tidak aktif atau tidak dijumpai.' };
    }

    const roleMap: Record<string, 'negeri' | 'daerah' | 'admin' | 'developer' | 'school'> = {
      negeri_admin: 'negeri',
      daerah_admin: 'daerah',
      admin: 'admin',
      developer: 'developer',
      school_user: 'school',
    };

    const mappedRole = roleMap[profile.role] || 'school';
    if (mappedRole === 'school') {
      await supabase.auth.signOut();
      return { status: 'error', message: 'Akaun ini bukan akaun admin.' };
    }

    if (expectedRole && mappedRole !== expectedRole && !['admin', 'developer'].includes(mappedRole)) {
      await supabase.auth.signOut();
      return { status: 'error', message: 'Role admin tidak sepadan dengan pilihan login.' };
    }

    const negeri = Array.isArray(profile.negeri) ? profile.negeri[0] : profile.negeri;
    const daerah = Array.isArray(profile.daerah) ? profile.daerah[0] : profile.daerah;
    const adminRole = mappedRole === 'admin' || mappedRole === 'developer' ? 'negeri' : mappedRole;

    const admin = {
      username: profile.email || data.user.email || input.email.trim().toLowerCase(),
      role: adminRole,
      fullName: profile.full_name || profile.email || data.user.email || 'Admin',
      email: profile.email || data.user.email,
      negeriCode: negeri?.code,
      daerahCode: daerah?.code,
      authToken: data.session?.access_token,
      expiresAt: data.session?.expires_at ? data.session.expires_at * 1000 : Date.now() + (24 * 60 * 60 * 1000),
      scope: {
        canManageNegeri: ['admin', 'developer', 'negeri'].includes(mappedRole),
        canManageDaerah: true,
        canManageSchools: true,
        canManageBadges: true,
        canViewAllNegeri: ['admin', 'developer'].includes(mappedRole),
        canViewAllDaerah: ['admin', 'developer', 'negeri'].includes(mappedRole),
        negeriAccess: negeri?.code ? [negeri.code] : [],
        daerahAccess: mappedRole === 'daerah' ? [daerah?.code].filter(Boolean) : 'ALL_IN_NEGERI',
      },
    };

    return { status: 'success', admin };
  } catch (error: any) {
    return { status: 'error', message: 'Gagal menghubungi Supabase Auth.' };
  }
};

// ============================================================
// LOGIN
// ============================================================

export const loginUser = async (input: LoginInput): Promise<AuthResult> => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email.trim(),
      password: input.password,
    });

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        return { status: 'error', message: 'Email atau kata laluan tidak sah.' };
      }
      return { status: 'error', message: error.message };
    }

    if (!data.user) {
      return { status: 'error', message: 'Gagal log masuk.' };
    }

    // Fetch profile + school info
    const profile = await getProfileWithSchool(data.user.id);
    const school = profile?.school as any;

    // Check if profile is active
    if (!profile?.is_active) {
      await supabase.auth.signOut();
      return { status: 'error', message: 'Akaun anda telah dinyahaktifkan. Sila hubungi admin.' };
    }

    return {
      status: 'success',
      message: 'Log masuk berjaya!',
      user: {
        id: data.user.id,
        email: data.user.email || '',
        schoolName: school?.name || data.user.user_metadata?.school_name || '',
        schoolCode: school?.school_code || data.user.user_metadata?.school_code || '',
        schoolId: school?.id || '',
        role: profile?.role || 'school_user',
      },
    };
  } catch (error: any) {
    return { status: 'error', message: 'Gagal menghubungi server.' };
  }
};

// ============================================================
// LOGOUT
// ============================================================

export const logoutUser = async (): Promise<void> => {
  await supabase.auth.signOut();
};

// ============================================================
// GET CURRENT SESSION
// ============================================================

export const getCurrentSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

// ============================================================
// GET PROFILE
// ============================================================

export const getProfile = async (userId: string): Promise<UserProfile | null> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data as UserProfile;
};

// ============================================================
// GET PROFILE WITH SCHOOL INFO
// ============================================================

export const getProfileWithSchool = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      *,
      school:schools(id, name, school_code, negeri_id, daerah_id, allow_students, allow_assistants, allow_examiners, is_active)
    `)
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data;
};

// ============================================================
// CHANGE PASSWORD
// ============================================================

export const changePassword = async (newPassword: string): Promise<AuthResult> => {
  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return { status: 'error', message: error.message };
    }

    return { status: 'success', message: 'Kata laluan berjaya ditukar.' };
  } catch (error: any) {
    return { status: 'error', message: 'Gagal menukar kata laluan.' };
  }
};

// ============================================================
// RESET PASSWORD (send email)
// ============================================================

export const resetPassword = async (email: string): Promise<AuthResult> => {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/#/reset-password`,
    });

    if (error) {
      return { status: 'error', message: error.message };
    }

    return { status: 'success', message: 'Link reset kata laluan telah dihantar ke email anda.' };
  } catch (error: any) {
    return { status: 'error', message: 'Gagal menghantar email reset.' };
  }
};

// ============================================================
// REGISTER ADMIN (developer/admin/negeri_admin only)
// ============================================================

export const registerAdmin = async (input: {
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
  role: 'admin' | 'negeri_admin' | 'daerah_admin' | 'developer';
  negeriCode?: string;
  daerahCode?: string;
}): Promise<AuthResult> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return { status: 'error', message: 'Sila log masuk sebagai admin terlebih dahulu.' };
    }

    const response = await fetch(`${EDGE_FUNCTION_URL}/register-admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(input),
    });

    const result = await response.json();
    return result;
  } catch (error: any) {
    return { status: 'error', message: 'Gagal menghubungi server. Sila cuba lagi.' };
  }
};

// ============================================================
// RESET SCHOOL CLAIM (admin only)
// ============================================================

export const resetSchoolClaim = async (input: { schoolId?: string; schoolCode?: string }): Promise<AuthResult> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return { status: 'error', message: 'Sila log masuk sebagai admin terlebih dahulu.' };
    }

    const response = await fetch(`${EDGE_FUNCTION_URL}/reset-school-claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(input),
    });

    const result = await response.json();
    return result;
  } catch (error: any) {
    return { status: 'error', message: 'Gagal menghubungi server. Sila cuba lagi.' };
  }
};

// ============================================================
// AUTH STATE LISTENER
// ============================================================

export const onAuthStateChange = (callback: (event: string, session: any) => void) => {
  return supabase.auth.onAuthStateChange(callback);
};

// ============================================================
// FETCH SCHOOLS FOR REGISTRATION (public/anon access)
// ============================================================

export const fetchSchoolsForRegistration = async () => {
  const { data, error } = await supabase
    .from('schools')
    .select('id, name, school_code, is_claimed, negeri:negeri_id(code), daerah:daerah_id(code)')
    .eq('is_active', true)
    .order('name');

  if (error) return [];
  return data || [];
};
