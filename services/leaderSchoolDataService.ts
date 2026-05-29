import { EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from './supabaseClient';

// ============================================================
// LEADER SCHOOL DATA SERVICE
// ============================================================
// Panggil edge function fetch-leader-school-data secara selamat.
// Edge function verify password leader + approval status sebelum
// return data sekolah (guna service_role bypass RLS).

export interface LeaderSchoolData {
  school: any;
  submissionPeople: any[];
  badges: any[];
  schoolProfiles: any[];
  schoolBadgeStatus: any[];
  leader: { id: string; email: string };
}

export interface FetchLeaderSchoolDataResult {
  success: boolean;
  data?: LeaderSchoolData;
  message?: string;
  linkStatus?: string;
}

export async function fetchLeaderSchoolData(
  email: string,
  passwordHash: string,
): Promise<FetchLeaderSchoolDataResult> {
  try {
    const response = await fetch(`${EDGE_FUNCTION_URL}/fetch-leader-school-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ email, passwordHash }),
    });

    const json = await response.json();
    if (!response.ok || json.error) {
      return {
        success: false,
        message: json.error || `HTTP ${response.status}`,
        linkStatus: json.linkStatus,
      };
    }

    return {
      success: true,
      data: {
        school: json.school,
        submissionPeople: json.submissionPeople || [],
        badges: json.badges || [],
        schoolProfiles: json.schoolProfiles || [],
        schoolBadgeStatus: json.schoolBadgeStatus || [],
        leader: json.leader,
      },
    };
  } catch (err: any) {
    console.error('fetchLeaderSchoolData error:', err);
    return {
      success: false,
      message: err.message || 'Ralat sistem semasa fetch data sekolah.',
    };
  }
}
