import { supabase } from './supabaseClient';

// ============================================================
// LEADER SCHOOL LINK APPROVAL SERVICE
// ============================================================
// Untuk akaun pengguna sekolah (school_user) approve/reject
// permintaan akses pemimpin ke modul sekolah.

export interface LeaderRequest {
  id: string;
  fullName: string;
  email: string;
  icNumber: string;
  phoneNumber: string;
  leaderType: 'guru' | 'luar';
  schoolId: string | null;
  schoolName?: string | null;
  schoolLinkStatus: 'pending' | 'approved' | 'rejected' | null;
  schoolLinkRequestedAt: string | null;
  schoolLinkApprovedBy: string | null;
  schoolLinkApprovedAt: string | null;
  schoolLinkRejectReason: string | null;
  createdAt: string;
}

function mapLeaderRow(row: any): LeaderRequest {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    icNumber: row.ic_number,
    phoneNumber: row.phone_number,
    leaderType: row.leader_type,
    schoolId: row.school_id,
    schoolName: row.school?.name || null,
    schoolLinkStatus: row.school_link_status,
    schoolLinkRequestedAt: row.school_link_requested_at,
    schoolLinkApprovedBy: row.school_link_approved_by,
    schoolLinkApprovedAt: row.school_link_approved_at,
    schoolLinkRejectReason: row.school_link_reject_reason,
    createdAt: row.created_at,
  };
}

// Senaraikan semua permintaan pemimpin untuk sekolah tertentu
export async function listLeaderRequestsForSchool(
  schoolId: string,
  status?: 'pending' | 'approved' | 'rejected',
): Promise<LeaderRequest[]> {
  try {
    let query = supabase
      .from('leader_accounts')
      .select('id, email, full_name, ic_number, phone_number, leader_type, school_id, school_link_status, school_link_requested_at, school_link_approved_by, school_link_approved_at, school_link_reject_reason, created_at, school:school_id(name)')
      .eq('school_id', schoolId)
      .order('school_link_requested_at', { ascending: false });

    if (status) {
      query = query.eq('school_link_status', status);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data.map(mapLeaderRow);
  } catch (err) {
    console.error('listLeaderRequestsForSchool error:', err);
    return [];
  }
}

// Approve permintaan
export async function approveLeaderRequest(
  leaderId: string,
  approvedBy: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    const { error } = await supabase
      .from('leader_accounts')
      .update({
        school_link_status: 'approved',
        school_link_approved_by: approvedBy,
        school_link_approved_at: new Date().toISOString(),
        school_link_reject_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leaderId);

    if (error) return { success: false, message: error.message };

    // Audit log
    const { data: leader } = await supabase
      .from('leader_accounts')
      .select('school_id')
      .eq('id', leaderId)
      .maybeSingle();

    await supabase.from('leader_school_audit').insert({
      leader_id: leaderId,
      school_id: leader?.school_id || null,
      action: 'approve',
      performed_by: approvedBy,
      performed_by_role: 'school_user',
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message || 'Ralat sistem.' };
  }
}

// Reject permintaan dengan sebab
export async function rejectLeaderRequest(
  leaderId: string,
  rejectedBy: string,
  reason: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    if (!reason?.trim()) {
      return { success: false, message: 'Sebab penolakan diperlukan.' };
    }

    const { error } = await supabase
      .from('leader_accounts')
      .update({
        school_link_status: 'rejected',
        school_link_approved_by: rejectedBy,
        school_link_approved_at: new Date().toISOString(),
        school_link_reject_reason: reason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', leaderId);

    if (error) return { success: false, message: error.message };

    const { data: leader } = await supabase
      .from('leader_accounts')
      .select('school_id')
      .eq('id', leaderId)
      .maybeSingle();

    await supabase.from('leader_school_audit').insert({
      leader_id: leaderId,
      school_id: leader?.school_id || null,
      action: 'reject',
      performed_by: rejectedBy,
      performed_by_role: 'school_user',
      reason: reason.trim(),
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message || 'Ralat sistem.' };
  }
}

// Revoke akses pemimpin yang dah approved (kalau dah berhenti, dll)
export async function revokeLeaderAccess(
  leaderId: string,
  revokedBy: string,
  reason: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    const { error } = await supabase
      .from('leader_accounts')
      .update({
        school_link_status: 'rejected',
        school_link_reject_reason: reason || 'Akses ditarik balik',
        updated_at: new Date().toISOString(),
      })
      .eq('id', leaderId);

    if (error) return { success: false, message: error.message };

    const { data: leader } = await supabase
      .from('leader_accounts')
      .select('school_id')
      .eq('id', leaderId)
      .maybeSingle();

    await supabase.from('leader_school_audit').insert({
      leader_id: leaderId,
      school_id: leader?.school_id || null,
      action: 'revoke',
      performed_by: revokedBy,
      performed_by_role: 'school_user',
      reason: reason,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message || 'Ralat sistem.' };
  }
}

// Kira jumlah permintaan pending untuk badge counter
export async function countPendingLeaderRequests(schoolId: string): Promise<number> {
  const { count } = await supabase
    .from('leader_accounts')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('school_link_status', 'pending');
  return count || 0;
}
