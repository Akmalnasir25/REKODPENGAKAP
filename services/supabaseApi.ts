import { supabase, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from './supabaseClient';
import { SubmissionData, Participant, LeaderInfo, ApiResponse, School, Badge, Negeri, Daerah, UserProfile } from '../types';

// ============================================================
// SUPABASE API LAYER - Replaces Google Apps Script API
// ============================================================

const currentYear = () => new Date().getFullYear();

const toDateOnly = (value?: string) => {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
};

const normalize = (value?: string) => (value || '').trim().toUpperCase();

const roleMap = (role?: string): string | undefined => {
  if (!role) return undefined;
  if (role === 'negeri') return 'negeri_admin';
  if (role === 'daerah') return 'daerah_admin';
  return role;
};

const getBadgeByName = async (badgeName: string) => {
  const name = badgeName.trim();
  const { data, error } = await supabase.from('badges').select('*').eq('name', name).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Badge '${name}' tidak dijumpai. Sila hubungi admin untuk tambah badge.`);
  return data;
};

const getSchoolByCodeOrName = async (schoolCode?: string, schoolName?: string) => {
  let query = supabase.from('schools').select('*, negeri:negeri_id(code,name), daerah:daerah_id(code,name)').eq('is_active', true);
  if (schoolCode) query = query.eq('school_code', normalize(schoolCode));
  else query = query.eq('name', normalize(schoolName));
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data;
};

// Hadkan operasi padam kpd submission untuk sekolah + program (badge) + tahun yg SAMA sahaja,
// supaya rekod tidak terpadam merentas program/tahun lain. Pulangkan null jika skop tak dapat ditentukan.
const getScopedSubmissionIds = async (
  schoolCode?: string, schoolName?: string, badgeName?: string, year?: number
): Promise<string[] | null> => {
  try {
    if (!badgeName || (!schoolCode && !schoolName)) return null;
    const school = await getSchoolByCodeOrName(schoolCode, schoolName);
    if (!school) return null;
    const badge = await getBadgeByName(badgeName);
    const { data, error } = await supabase
      .from('submissions')
      .select('id')
      .eq('school_id', school.id)
      .eq('badge_id', badge.id)
      .eq('submission_year', year || currentYear());
    if (error) throw error;
    return (data || []).map((s: any) => s.id);
  } catch {
    return null;
  }
};

export const getNegeriId = async (code: string) => {
  const { data, error } = await supabase.from('negeri').select('id').eq('code', normalize(code)).maybeSingle();
  if (error) throw error;
  return data?.id || null;
};

export const getDaerahId = async (code: string) => {
  const { data, error } = await supabase.from('daerah').select('id').eq('code', normalize(code)).maybeSingle();
  if (error) throw error;
  return data?.id || null;
};

export const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  if (!password || password.length < 6) errors.push('Kata laluan mesti sekurang-kurangnya 6 aksara');
  if (!/[A-Z]/.test(password)) errors.push('Kata laluan mesti mengandungi sekurang-kurangnya 1 huruf besar');
  if (!/[a-z]/.test(password)) errors.push('Kata laluan mesti mengandungi sekurang-kurangnya 1 huruf kecil');
  if (!/\d/.test(password)) errors.push('Kata laluan mesti mengandungi sekurang-kurangnya 1 nombor');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) errors.push('Kata laluan mesti mengandungi sekurang-kurangnya 1 karakter khas (!@#$%^&* dll)');
  return { valid: errors.length === 0, errors };
};

export const fetchCloudData = async (
  _url?: string,
  role?: string,
  negeriCode?: string,
  daerahCode?: string
): Promise<ApiResponse> => {
  try {
    let schoolsQuery = supabase.from('schools').select('*, negeri:negeri_id(code,name), daerah:daerah_id(code,name)').eq('is_active', true).order('name');
    // Paginated fetch to overcome Supabase 1000-row default limit
    const fetchAllSubmissionPeople = async () => {
      const pageSize = 1000;
      let allData: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase.from('submission_people').select(`
          *,
          submission:submissions(
            id, submission_year, submitted_at, status, remarks,
            school:schools(id, name, school_code, negeri:negeri_id(code,name), daerah:daerah_id(code,name)),
            badge:badges(id, name)
          )
        `).eq('is_deleted', false).not('float_status', 'in', '("floated","transferred")').order('created_at', { ascending: false }).range(from, from + pageSize - 1);
        if (error) return { data: null, error };
        allData = allData.concat(data || []);
        hasMore = (data || []).length === pageSize;
        from += pageSize;
      }
      return { data: allData, error: null };
    };
    const peopleRes = await fetchAllSubmissionPeople();

    if (role === 'negeri' && negeriCode) {
      const negeriId = await getNegeriId(negeriCode);
      if (negeriId) schoolsQuery = schoolsQuery.eq('negeri_id', negeriId);
    }
    if (role === 'daerah' && daerahCode) {
      const daerahId = await getDaerahId(daerahCode);
      if (daerahId) schoolsQuery = schoolsQuery.eq('daerah_id', daerahId);
    }

    const [schoolsRes, badgesRes, negeriRes, daerahRes, profilesRes, statusRes] = await Promise.all([
      schoolsQuery,
      supabase.from('badges').select('*, negeri:negeri_id(code,name), daerah:daerah_id(code,name)').order('name'),
      supabase.from('negeri').select('*').order('name'),
      supabase.from('daerah').select('*, negeri:negeri_id(code,name)').order('name'),
      supabase.from('school_profiles').select('*, school:school_id(school_code,name,group_number)').order('updated_at', { ascending: false }),
      supabase.from('school_badge_status').select('*, school:school_id(school_code,name), badge:badge_id(name)').order('updated_at', { ascending: false }),
    ]);

    for (const res of [schoolsRes, badgesRes, negeriRes, daerahRes, profilesRes, statusRes]) {
      if (res.error) throw res.error;
    }
    if (peopleRes.error) throw peopleRes.error;

    const allowedSchoolCodes = new Set((schoolsRes.data || []).map((s: any) => s.school_code));

    const schools: School[] = (schoolsRes.data || []).map((s: any) => {
      const statusRows = (statusRes.data || []).filter((r: any) => r.school?.school_code === s.school_code);
      const badgeEditPermissions = statusRows.reduce((acc: Record<string, any>, r: any) => {
        if (!r.badge?.name || !r.year) return acc;
        const key = `${r.badge.name}_${r.year}`;
        let notes: any = {};
        try {
          notes = typeof r.notes === 'string' && r.notes.trim().startsWith('{') ? JSON.parse(r.notes) : {};
        } catch (_) {
          notes = {};
        }
        if (notes.editPermissions) acc[key] = notes.editPermissions;
        return acc;
      }, {});
      return {
        name: s.name,
        schoolCode: s.school_code,
        negeriCode: s.negeri?.code,
        daerahCode: s.daerah?.code,
        isClaimed: Boolean(s.is_claimed),
        claimedEmail: s.claimed_email || undefined,
        claimedAt: s.claimed_at || undefined,
        allowStudents: s.allow_students,
        allowAssistants: s.allow_assistants,
        allowExaminers: s.allow_examiners,
        lockedBadges: statusRows
          .filter((r: any) => r.status === 'submitted')
          .map((r: any) => r.badge?.name ? `${r.badge.name}_${r.year}` : '')
          .filter(Boolean),
        approvedBadges: statusRows
          .filter((r: any) => r.status === 'approved')
          .map((r: any) => r.badge?.name ? `${r.badge.name}_${r.year}` : '')
          .filter(Boolean),
        badgeEditPermissions,
      };
    });

    const submissions: SubmissionData[] = (peopleRes.data || [])
      .filter((p: any) => p.submission?.school?.school_code && allowedSchoolCodes.has(p.submission.school.school_code))
      .map((p: any, idx: number) => ({
        rowIndex: idx + 2,
        date: p.submission?.submitted_at || p.created_at,
        school: p.submission?.school?.name || '',
        schoolCode: p.submission?.school?.school_code || '',
        negeriCode: p.submission?.school?.negeri?.code,
        daerahCode: p.submission?.school?.daerah?.code,
        badge: p.submission?.badge?.name || '',
        student: p.name || '',
        gender: p.gender || '',
        race: p.race || '',
        id: p.membership_id || '',
        personId: p.id,
        icNumber: p.ic_number || '',
        studentPhone: p.phone_number || '',
        role: p.role || 'PESERTA',
        category: p.category || '',
        shirtSize: p.shirt_size || '',
        unit: p.unit || '',
        makanan: p.makanan || '',
        masalahKesihatan: p.masalah_kesihatan || '',
        masalahKesihatanLain: p.masalah_kesihatan_lain || '',
        remarks: p.remarks || p.submission?.remarks || '',
        isWithdrawn: !!p.is_withdrawn,
        withdrawnAt: p.withdrawn_at || undefined,
        withdrawalReason: p.withdrawal_reason || undefined,
        withdrawalNotes: p.withdrawal_notes || undefined,
        participantId: p.id,
      }));

    const userProfiles: UserProfile[] = (profilesRes.data || []).map((p: any) => ({
      schoolCode: p.school?.school_code || '',
      schoolName: p.school?.name || '',
      groupNumber: p.school?.group_number || '',
      phone: p.phone || '',
      principalName: p.principal_name || '',
      principalPhone: p.principal_phone || '',
      leaderName: p.leader_name || '',
      leaderPhone: p.leader_phone || '',
      leaderIC: p.leader_ic || '',
      leaderGender: p.leader_gender || '',
      leaderMembershipId: p.leader_membership_id || '',
      leaderRace: p.leader_race || '',
      remarks: p.remarks || '',
      lastUpdated: p.updated_at || '',
    }));

    const negeriList: Negeri[] = (negeriRes.data || []).map((n: any) => ({ code: n.code, name: n.name, createdDate: n.created_at }));
    const daerahList: Daerah[] = (daerahRes.data || []).map((d: any) => ({ code: d.code, name: d.name, negeriCode: d.negeri?.code || '', createdDate: d.created_at }));
    const badges: Badge[] = (badgesRes.data || []).map((b: any) => ({
      name: b.name,
      isOpen: b.is_open,
      deadline: b.deadline,
      scope: b.scope || 'daerah',
      negeriCode: b.negeri?.code,
      daerahCode: b.daerah?.code,
      requiresDaerahApproval: !!b.requires_daerah_approval,
    }));

    return { status: 'success', schools, badges, badgeTypes: badges.map(b => b.name), submissions, userProfiles, negeriList, daerahList, isRegistrationOpen: badges.some(b => b.isOpen) };
  } catch (error: any) {
    console.error('Supabase fetchCloudData error:', error);
    return { status: 'error', message: error.message || 'Gagal mengambil data Supabase.' };
  }
};

const createSubmissionWithPeople = async (
  leaderInfo: LeaderInfo,
  people: Array<Participant & { role?: string }>,
  customDate?: string,
  source: 'manual' | 'bulk_import' | 'migration' = 'manual',
  submissionStatus: 'draft' | 'submitted' = 'draft'
) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { status: 'error', message: 'Sesi anda telah tamat. Sila log masuk semula.' };
  }

  const school = await getSchoolByCodeOrName(leaderInfo.schoolCode, leaderInfo.schoolName);
  if (!school) return { status: 'error', message: 'Sekolah tidak dijumpai dalam Supabase.' };
  if (leaderInfo.groupNumber) {
    const { error: schoolUpdateError } = await supabase
      .from('schools')
      .update({ group_number: leaderInfo.groupNumber })
      .eq('id', school.id);
    if (schoolUpdateError) throw schoolUpdateError;
  }

  const badge = await getBadgeByName(leaderInfo.badgeType);
  const submittedAt = toDateOnly(customDate);
  const year = new Date(submittedAt).getFullYear();
  const user = session.user;

  const { data: submission, error: subError } = await supabase
    .from('submissions')
    .insert({
      school_id: school.id,
      badge_id: badge.id,
      submission_year: year,
      submitted_at: submittedAt,
      submitted_by: user?.id || null,
      status: submissionStatus,
      source,
      remarks: leaderInfo.groupNumber ? `No Kumpulan: ${leaderInfo.groupNumber}` : null,
    })
    .select('*')
    .single();
  if (subError) throw subError;

  const formatIcNumber = (ic: string | undefined): string | null => {
    if (!ic) return null;
    const digits = ic.replace(/\D/g, '');
    if (digits.length === 12) return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
    return ic.trim() || null;
  };

  const formatPhoneNumber = (phone: string | undefined): string | null => {
    if (!phone) return null;
    let cleaned = phone.trim();
    if (!cleaned) return null;
    // Buang +6 atau 6 di depan dulu untuk normalize
    cleaned = cleaned.replace(/^\+6/, '').replace(/^6(?=0)/, '');
    // Tambah +6 di depan jika bermula dengan 0
    if (cleaned.startsWith('0')) {
      cleaned = '+6' + cleaned;
    } else if (!cleaned.startsWith('+')) {
      cleaned = '+6' + cleaned;
    }
    return cleaned;
  };

  const rows = people.filter(p => p.name?.trim()).map(p => {
    const role = (p as any).role || 'PESERTA';
    const isPeserta = role === 'PESERTA' || role === 'PENERIMA RAMBU';
    // Jaring keselamatan peringkat akar: PESERTA mesti ada kategori & unit walau caller terlupa hantar.
    // (Pemimpin/Penolong/Penguji: kategori & unit kekal null — bukan jenis pengakap.)
    return {
      submission_id: submission.id,
      name: normalize(p.name),
      gender: p.gender || null,
      race: p.race || null,
      membership_id: normalize(p.membershipId),
      ic_number: formatIcNumber(p.icNumber),
      phone_number: formatPhoneNumber(p.phoneNumber),
      role,
      category: (p as any).kategori || (isPeserta ? 'Pengakap Kanak-kanak' : null),
      shirt_size: (p as any).shirtSize || null,
      unit: (p as any).unit || (isPeserta ? 'Perdana' : null),
      makanan: (p as any).makanan || (isPeserta ? 'Biasa' : null),
      masalah_kesihatan: (p as any).masalahKesihatan || (isPeserta ? 'Tiada' : null),
      masalah_kesihatan_lain: (p as any).masalahKesihatanLain || null,
      remarks: p.remarks || null,
    };
  });

  if (rows.length > 0) {
    const { error: peopleError } = await supabase.from('submission_people').insert(rows);
    if (peopleError) throw peopleError;
  }

  // Only upsert school_profiles if no profile exists yet (don't overwrite existing profile data)
  const { data: existingProfile } = await supabase.from('school_profiles').select('id').eq('school_id', school.id).single();
  if (!existingProfile) {
    await supabase.from('school_profiles').insert({
      school_id: school.id,
      principal_name: normalize(leaderInfo.principalName),
      principal_phone: leaderInfo.principalPhone || null,
      leader_name: normalize(leaderInfo.leaderName),
      leader_phone: leaderInfo.phone || null,
      leader_race: leaderInfo.race || null,
      updated_by: user?.id || null,
    });
  }

  // Hanya upsert school_badge_status jika bukan draft
  if (submissionStatus !== 'draft') {
    await supabase.from('school_badge_status').upsert({
      school_id: school.id,
      badge_id: badge.id,
      year,
      status: 'submitted',
      submitted_at: submittedAt,
    }, { onConflict: 'school_id,badge_id,year' });
  }

  return { status: 'success', message: submissionStatus === 'draft' ? 'Data berjaya disimpan sebagai draf.' : 'Pendaftaran berjaya dihantar.' };
};

export const submitRegistration = async (
  _url: string,
  leaderInfo: LeaderInfo,
  participants: Participant[],
  assistants: Participant[] = [],
  examiners: Participant[] = [],
  customDate?: string,
  _csrfToken?: string,
  submissionStatus: 'draft' | 'submitted' = 'draft'
): Promise<ApiResponse> => {
  try {
    const allPeople = [
      ...participants.map(p => ({ ...p, role: 'PESERTA' })),
      ...assistants.map(p => ({ ...p, role: 'PENOLONG PEMIMPIN' })),
      ...examiners.map(p => ({ ...p, role: 'PENGUJI' })),
    ];
    const result = await createSubmissionWithPeople(leaderInfo, allPeople, customDate, 'manual', submissionStatus);
    return result as ApiResponse;
  } catch (error: any) {
    console.error('submitRegistration Supabase error:', error);
    return { status: 'error', message: error.message || 'Gagal menyimpan pendaftaran.' };
  }
};

export const bulkSubmitRegistration = async (
  _url: string,
  payload: {
    schoolName: string;
    schoolCode: string;
    badgeType: string;
    year: number;
    role: 'PESERTA' | 'PEMIMPIN' | 'PENOLONG PEMIMPIN' | 'PENGUJI' | 'PENERIMA RAMBU';
    records: Array<{ student: string; icNumber: string; membershipId: string; gender: string; race: string; phoneNumber?: string; role?: 'PESERTA' | 'PEMIMPIN' | 'PENOLONG PEMIMPIN' | 'PENGUJI' | 'PENERIMA RAMBU'; category?: string; unit?: string; makanan?: string; masalahKesihatan?: string; masalahKesihatanLain?: string; remarks?: string; }>;
  },
  _csrfToken?: string
): Promise<ApiResponse> => {
  try {
    const leaderInfo: LeaderInfo = {
      schoolName: payload.schoolName,
      schoolCode: payload.schoolCode,
      principalName: '',
      principalPhone: '',
      leaderName: '',
      race: '',
      phone: '',
      badgeType: payload.badgeType,
    };
    const people = payload.records.map((r, idx) => {
      const role = r.role || payload.role;
      const isPeserta = role === 'PESERTA';
      return {
        id: idx + 1,
        name: r.student,
        icNumber: r.icNumber,
        membershipId: r.membershipId,
        gender: r.gender,
        race: r.race,
        phoneNumber: r.phoneNumber || '',
        kategori: isPeserta ? (r.category || 'Pengakap Kanak-kanak') : '',
        unit: isPeserta ? (r.unit || 'Perdana') : '',
        makanan: isPeserta ? (r.makanan || 'Biasa') : '',
        masalahKesihatan: isPeserta ? (r.masalahKesihatan || 'Tiada') : '',
        masalahKesihatanLain: isPeserta ? (r.masalahKesihatanLain || '') : '',
        remarks: r.remarks || '',
        role,
      };
    });
    return await createSubmissionWithPeople(leaderInfo, people, `${payload.year}-01-01`, 'bulk_import') as ApiResponse;
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal import bulk.' };
  }
};

export const deleteSubmission = async (_url: string, submission: SubmissionData, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    // 1) Utamakan padam ikut ID rekod tepat (submission_people.id) — hanya 1 rekod, 1 program + tahun.
    const exactId = submission.participantId || submission.personId;
    if (exactId) {
      const { error } = await supabase.from('submission_people').update({ is_deleted: true }).eq('id', exactId);
      if (error) throw error;
      return { status: 'success', message: 'Rekod berjaya dipadam.' };
    }

    // 2) Fallback: hadkan skop kpd sekolah + program (badge) + tahun yg sama (bukan semua tahun/program).
    const year = submission.date ? new Date(submission.date).getFullYear() : currentYear();
    const subIds = await getScopedSubmissionIds(submission.schoolCode, submission.school, submission.badge, year);
    if (!subIds || subIds.length === 0) {
      return { status: 'error', message: 'Tidak dapat menentukan program/tahun rekod. Padaman dibatalkan untuk elak padam rekod lain.' };
    }
    let query = supabase.from('submission_people').update({ is_deleted: true }).in('submission_id', subIds);
    if (submission.icNumber) query = query.eq('ic_number', submission.icNumber);
    else if (submission.id) query = query.eq('membership_id', submission.id);
    else query = query.eq('name', submission.student);
    const { error } = await query;
    if (error) throw error;
    return { status: 'success', message: 'Rekod berjaya dipadam.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal padam rekod.' };
  }
};

export const updateParticipantId = async (_url: string, _rowIndex: number, newId: string, schoolCode: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const school = await getSchoolByCodeOrName(schoolCode);
    if (!school) return { status: 'error', message: 'Sekolah tidak dijumpai.' };
    const { data: submissions } = await supabase.from('submissions').select('id').eq('school_id', school.id);
    const ids = (submissions || []).map((s: any) => s.id);
    const { error } = await supabase.from('submission_people').update({ membership_id: normalize(newId) }).in('submission_id', ids).limit(1);
    if (error) throw error;
    return { status: 'success' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal kemaskini ID.' };
  }
};

export const addSchool = async (_url: string, schoolData: { name?: string; schoolName?: string; schoolCode: string; negeriCode?: string; daerahCode?: string; groupNumber?: string; }, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const schoolName = schoolData.name || schoolData.schoolName || schoolData.schoolCode;
    const negeriId = schoolData.negeriCode ? await getNegeriId(schoolData.negeriCode) : null;
    const daerahId = schoolData.daerahCode ? await getDaerahId(schoolData.daerahCode) : null;
    const { error } = await supabase.from('schools').insert({
      name: normalize(schoolName),
      school_code: normalize(schoolData.schoolCode),
      negeri_id: negeriId,
      daerah_id: daerahId,
      group_number: schoolData.groupNumber || null,
      is_active: true,
    });
    if (error) throw error;
    return { status: 'success', message: 'Sekolah berjaya ditambah.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal tambah sekolah.' };
  }
};

export const addSchoolBatch = async (_url: string, schools: string[] | { name: string; schoolCode: string }[], negeriCode?: string, daerahCode?: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const negeriId = negeriCode ? await getNegeriId(negeriCode) : null;
    const daerahId = daerahCode ? await getDaerahId(daerahCode) : null;
    const rows = schools.map(item => {
      if (typeof item === 'string') {
        return { name: normalize(item), school_code: normalize(item), negeri_id: negeriId, daerah_id: daerahId, is_active: true };
      }
      return { name: normalize(item.name), school_code: normalize(item.schoolCode), negeri_id: negeriId, daerah_id: daerahId, is_active: true };
    });
    const { error } = await supabase.from('schools').insert(rows);
    if (error) throw error;
    return { status: 'success', message: `${schools.length} sekolah berjaya ditambah.` };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal tambah sekolah batch.' };
  }
};

export const deleteSchool = async (_url: string, schoolCodeOrName: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const { error } = await supabase.from('schools').update({ is_active: false }).or(`school_code.eq.${normalize(schoolCodeOrName)},name.eq.${normalize(schoolCodeOrName)}`);
    if (error) throw error;
    return { status: 'success', message: 'Sekolah berjaya dipadam.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal padam sekolah.' };
  }
};

export const updateSchoolCode = async (schoolName: string, newSchoolCode: string): Promise<ApiResponse> => {
  try {
    const { error } = await supabase
      .from('schools')
      .update({ school_code: normalize(newSchoolCode) })
      .eq('name', normalize(schoolName));
    if (error) throw error;
    return { status: 'success', message: 'Kod sekolah berjaya dikemaskini.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal kemaskini kod sekolah.' };
  }
};

export const updateSchoolPermission = async (_url: string, schoolName: string, permissionType: 'students' | 'assistants' | 'examiners' | 'all', value: boolean, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    let updateData: Record<string, boolean> = {};
    if (permissionType === 'students') updateData = { allow_students: value };
    else if (permissionType === 'assistants') updateData = { allow_assistants: value };
    else if (permissionType === 'examiners') updateData = { allow_examiners: value };
    else updateData = { allow_students: value, allow_assistants: value, allow_examiners: value };
    
    const { error } = await supabase.from('schools').update(updateData).eq('name', normalize(schoolName));
    if (error) throw error;
    return { status: 'success' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal kemaskini permission.' };
  }
};

export const toggleSchoolEditBatch = async (_url: string, allow: boolean, permissionType: 'students' | 'assistants' | 'examiners' | 'all', _csrfToken?: string): Promise<ApiResponse> => {
  try {
    let updateData: Record<string, boolean> = {};
    if (permissionType === 'students') updateData = { allow_students: allow };
    else if (permissionType === 'assistants') updateData = { allow_assistants: allow };
    else if (permissionType === 'examiners') updateData = { allow_examiners: allow };
    else updateData = { allow_students: allow, allow_assistants: allow, allow_examiners: allow };
    
    const { error } = await supabase.from('schools').update(updateData).eq('is_active', true);
    if (error) throw error;
    return { status: 'success' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal toggle batch.' };
  }
};

export const lockSchoolBadge = async (_url: string, schoolCodeOrName: string, badgeNameWithYear: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    // badgeNameWithYear may be "Keris Gangsa_2025" format from getLockKey
    const parts = badgeNameWithYear.split('_');
    const year = parts.length > 1 ? parseInt(parts[parts.length - 1]) : currentYear();
    const badgeName = parts.length > 1 ? parts.slice(0, -1).join('_') : badgeNameWithYear;
    
    // Try lookup by code first, then by name
    let school = await getSchoolByCodeOrName(schoolCodeOrName);
    if (!school) school = await getSchoolByCodeOrName(undefined, schoolCodeOrName);
    if (!school) return { status: 'error', message: 'Sekolah tidak dijumpai.' };
    
    const badge = await getBadgeByName(badgeName);
    if (!badge) return { status: 'error', message: 'Badge tidak dijumpai.' };

    // Tukar semua submission draft → submitted untuk sekolah + badge + tahun ini
    await supabase
      .from('submissions')
      .update({ status: 'submitted' })
      .eq('school_id', school.id)
      .eq('badge_id', badge.id)
      .eq('submission_year', year || currentYear())
      .eq('status', 'draft');
    
    const { error } = await supabase.from('school_badge_status').upsert({ school_id: school.id, badge_id: badge.id, year: year || currentYear(), status: 'submitted', submitted_at: new Date().toISOString() }, { onConflict: 'school_id,badge_id,year' });
    if (error) throw error;
    return { status: 'success' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal lock badge.' };
  }
};

export const unlockSchoolBadge = async (_url: string, schoolName: string, badgeNameWithYear: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const parts = badgeNameWithYear.split('_');
    const year = parts.length > 1 ? parseInt(parts[parts.length - 1]) : currentYear();
    const badgeName = parts.length > 1 ? parts.slice(0, -1).join('_') : badgeNameWithYear;

    console.log('[unlockSchoolBadge] Input:', { schoolName, badgeNameWithYear, parsedBadge: badgeName, parsedYear: year });

    const school = await getSchoolByCodeOrName(undefined, schoolName);
    if (!school) return { status: 'error', message: `Sekolah '${schoolName}' tidak dijumpai dalam database.` };

    const badge = await getBadgeByName(badgeName);
    if (!badge) return { status: 'error', message: `Badge '${badgeName}' tidak dijumpai dalam database.` };

    console.log('[unlockSchoolBadge] Found:', { schoolId: school.id, badgeId: badge.id, year });

    // Cuba UPDATE dulu (row sudah wujud kerana nampak dalam UI)
    const { data: updateData, error: updateError } = await supabase
      .from('school_badge_status')
      .update({ status: 'reopened' })
      .eq('school_id', school.id)
      .eq('badge_id', badge.id)
      .eq('year', year || currentYear())
      .select();

    console.log('[unlockSchoolBadge] UPDATE result:', { updateData, updateError });

    if (updateError) throw updateError;

    // Jika UPDATE tak affect mana-mana row, cuba UPSERT sebagai fallback
    if (!updateData || updateData.length === 0) {
      console.log('[unlockSchoolBadge] UPDATE 0 rows, trying UPSERT fallback...');
      const { data: upsertData, error: upsertError } = await supabase
        .from('school_badge_status')
        .upsert(
          { school_id: school.id, badge_id: badge.id, year: year || currentYear(), status: 'reopened' },
          { onConflict: 'school_id,badge_id,year' }
        )
        .select();
      console.log('[unlockSchoolBadge] UPSERT result:', { upsertData, upsertError });
      if (upsertError) throw upsertError;
    }

    return { status: 'success' };
  } catch (error: any) {
    console.error('[unlockSchoolBadge] ERROR:', error);
    return { status: 'error', message: error.message || 'Gagal unlock badge.' };
  }
};

export const approveSchoolBadge = async (_url: string, schoolName: string, badgeNameWithYear: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const parts = badgeNameWithYear.split('_');
    const year = parts.length > 1 ? parseInt(parts[parts.length - 1]) : currentYear();
    const badgeName = parts.length > 1 ? parts.slice(0, -1).join('_') : badgeNameWithYear;

    const school = await getSchoolByCodeOrName(undefined, schoolName);
    const badge = await getBadgeByName(badgeName);
    if (!school || !badge) return { status: 'error', message: 'Sekolah atau badge tidak dijumpai.' };
    await supabase.from('school_badge_status').upsert({ school_id: school.id, badge_id: badge.id, year: year || currentYear(), status: 'approved' }, { onConflict: 'school_id,badge_id,year' });
    return { status: 'success' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal approve badge.' };
  }
};

export const updateUserProfile = async (_url: string, schoolCode: string, profileData: Partial<UserProfile>, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const school = await getSchoolByCodeOrName(schoolCode);
    if (!school) return { status: 'error', message: 'Sekolah tidak dijumpai.' };
    const { data: { user } } = await supabase.auth.getUser();
    if (profileData.groupNumber !== undefined) {
      const { error: schoolUpdateError } = await supabase
        .from('schools')
        .update({ group_number: profileData.groupNumber || null })
        .eq('id', school.id);
      if (schoolUpdateError) throw schoolUpdateError;
    }
    const { error: profileUpdateError } = await supabase.from('school_profiles').upsert({
      school_id: school.id,
      phone: profileData.phone || null,
      principal_name: profileData.principalName || null,
      principal_phone: profileData.principalPhone || null,
      leader_name: profileData.leaderName || null,
      leader_phone: profileData.leaderPhone || null,
      leader_ic: profileData.leaderIC || null,
      leader_gender: profileData.leaderGender || null,
      leader_membership_id: profileData.leaderMembershipId || null,
      leader_race: profileData.leaderRace || null,
      remarks: profileData.remarks || null,
      updated_by: user?.id || null,
    }, { onConflict: 'school_id' });
    if (profileUpdateError) throw profileUpdateError;
    return { status: 'success', message: 'Profil berjaya dikemaskini.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal kemaskini profil.' };
  }
};

export const addNegeri = async (_url: string, negeriCode: string, negeriName: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const { error } = await supabase.from('negeri').insert({ code: normalize(negeriCode), name: negeriName.trim() });
    if (error) throw error;
    return { status: 'success', message: 'Negeri berjaya ditambah.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal tambah negeri.' };
  }
};

export const deleteNegeri = async (_url: string, negeriCode: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const { error } = await supabase.from('negeri').delete().eq('code', normalize(negeriCode));
    if (error) throw error;
    return { status: 'success', message: 'Negeri berjaya dipadam.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal padam negeri.' };
  }
};

export const addDaerah = async (_url: string, daerahCode: string, daerahName: string, negeriCode: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const negeriId = await getNegeriId(negeriCode);
    if (!negeriId) return { status: 'error', message: 'Negeri tidak dijumpai.' };
    const { error } = await supabase.from('daerah').insert({ code: normalize(daerahCode), name: daerahName.trim(), negeri_id: negeriId });
    if (error) throw error;
    return { status: 'success', message: 'Daerah berjaya ditambah.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal tambah daerah.' };
  }
};

export const deleteDaerah = async (_url: string, daerahCode: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const { error } = await supabase.from('daerah').delete().eq('code', normalize(daerahCode));
    if (error) throw error;
    return { status: 'success', message: 'Daerah berjaya dipadam.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal padam daerah.' };
  }
};

export const updateDaerah = async (oldCode: string, newCode: string, newName: string): Promise<ApiResponse> => {
  try {
    const updates: any = {};
    const oldNorm = normalize(oldCode);
    const newCodeNorm = normalize(newCode);
    if (newCodeNorm && newCodeNorm !== oldNorm) updates.code = newCodeNorm;
    if (newName && newName.trim()) updates.name = newName.trim();
    if (Object.keys(updates).length === 0) {
      return { status: 'success', message: 'Tiada perubahan.' };
    }
    const { error } = await supabase.from('daerah').update(updates).eq('code', oldNorm);
    if (error) throw error;
    return { status: 'success', message: 'Daerah berjaya dikemaskini.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal kemaskini daerah.' };
  }
};

export const addBadgeType = async (
  _url: string,
  badgeName: string,
  _csrfToken?: string,
  options?: { scope?: 'negeri' | 'daerah'; negeriCode?: string; daerahCode?: string }
): Promise<ApiResponse> => {
  try {
    const insert: any = { name: badgeName.trim(), is_open: true };
    if (options?.scope) insert.scope = options.scope;
    if (options?.negeriCode) {
      const negeriId = await getNegeriId(options.negeriCode);
      if (negeriId) insert.negeri_id = negeriId;
    }
    if (options?.daerahCode) {
      const daerahId = await getDaerahId(options.daerahCode);
      if (daerahId) insert.daerah_id = daerahId;
    }
    const { error } = await supabase.from('badges').insert(insert);
    if (error) throw error;
    return { status: 'success', message: 'Badge berjaya ditambah.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal tambah badge.' };
  }
};

export const deleteBadgeType = async (_url: string, badgeName: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const { error } = await supabase.from('badges').delete().eq('name', badgeName.trim());
    if (error) throw error;
    return { status: 'success', message: 'Badge berjaya dipadam.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal padam badge.' };
  }
};

export const updateBadgeName = async (_url: string, oldName: string, newName: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const { error } = await supabase.from('badges').update({ name: newName.trim() }).eq('name', oldName.trim());
    if (error) throw error;
    return { status: 'success', message: 'Nama program berjaya dikemaskini.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal kemaskini nama program.' };
  }
};

export const toggleRegistration = async (_url: string, statusOrBadge: boolean | string, badgeNameOrNothing?: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    let isOpen: boolean;
    let badgeName: string | undefined;
    
    if (typeof statusOrBadge === 'boolean') {
      isOpen = statusOrBadge;
      badgeName = badgeNameOrNothing;
    } else {
      badgeName = statusOrBadge;
      isOpen = badgeNameOrNothing === undefined ? true : Boolean(badgeNameOrNothing);
    }

    if (badgeName) {
      const { error } = await supabase.from('badges').update({ is_open: isOpen }).eq('name', badgeName.trim());
      if (error) throw error;
    } else {
      const { error } = await supabase.from('badges').update({ is_open: isOpen }).neq('name', '');
      if (error) throw error;
    }
    return { status: 'success', message: `Pendaftaran ${isOpen ? 'dibuka' : 'ditutup'}.` };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal toggle registration.' };
  }
};

export const updateBadgeDeadline = async (_url: string, badgeName: string, deadline: string | null, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const { error } = await supabase.from('badges').update({ deadline: deadline ? toDateOnly(deadline) : null }).eq('name', badgeName.trim());
    if (error) throw error;
    return { status: 'success', message: 'Tarikh akhir berjaya dikemaskini.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal kemaskini deadline.' };
  }
};

export const updateBadgeRequiresDaerahApproval = async (badgeName: string, requires: boolean): Promise<ApiResponse> => {
  try {
    const { error } = await supabase.from('badges').update({ requires_daerah_approval: requires }).eq('name', badgeName.trim());
    if (error) throw error;
    return { status: 'success', message: 'Tetapan pengesahan daerah dikemaskini.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal kemaskini.' };
  }
};

export const approveDaerahLevel = async (schoolName: string, badgeName: string, year?: number): Promise<ApiResponse> => {
  try {
    const targetYear = year || currentYear();
    const school = await getSchoolByCodeOrName(schoolName);
    if (!school) return { status: 'error', message: 'Sekolah tidak dijumpai.' };
    const badge = await getBadgeByName(badgeName);
    if (!badge) return { status: 'error', message: 'Program tidak dijumpai.' };
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from('school_badge_status').upsert({
      school_id: school.id,
      badge_id: badge.id,
      year: targetYear,
      status: 'submitted',
      daerah_approved: true,
      daerah_approved_at: new Date().toISOString(),
      daerah_approved_by: session?.user?.id || null,
    }, { onConflict: 'school_id,badge_id,year' });
    if (error) throw error;
    return { status: 'success', message: 'Pengesahan daerah berjaya.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal pengesahan daerah.' };
  }
};

export const changePassword = async (_url: string, dataOrSchoolCode: { schoolCode: string; oldPassword: string; newPassword: string } | string, _oldPassword?: string, maybeNewPassword?: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const newPassword = typeof dataOrSchoolCode === 'object' ? dataOrSchoolCode.newPassword : maybeNewPassword;
    if (!newPassword) return { status: 'error', message: 'Kata laluan baru tidak dijumpai.' };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return { status: 'success', message: 'Kata laluan berjaya ditukar.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal tukar kata laluan.' };
  }
};

export const changeAdminPassword = async (_url: string, _username: string, newPassword: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return { status: 'success', message: 'Kata laluan admin berjaya ditukar.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal tukar kata laluan admin.' };
  }
};

export const changeAdminRegionalPassword = async (_url: string, _username: string, newPassword: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return { status: 'success', message: 'Kata laluan admin regional berjaya ditukar.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal tukar kata laluan admin regional.' };
  }
};

export const setupDatabase = async (_url: string, _csrfToken?: string): Promise<ApiResponse> => {
  return { status: 'success', message: 'Supabase database sudah setup melalui migrations.' };
};

export const clearDatabaseSheet = async (_url: string, _sheetName: string, _csrfToken?: string): Promise<ApiResponse> => {
  return { status: 'error', message: 'Fungsi ini tidak diperlukan dalam Supabase. Guna SQL migrations.' };
};

export const migrateYear = async (_url: string, _sourceYear: number, _targetYear: number, _csrfToken?: string): Promise<ApiResponse> => {
  return { status: 'error', message: 'Fungsi migrasi tahun perlu dilakukan melalui SQL atau script khusus.' };
};

export const addAdmin = async (_url: string, _adminData: any, _csrfToken?: string): Promise<ApiResponse> => {
  return { status: 'error', message: 'Guna registerAdmin dari supabaseAuth.ts untuk tambah admin.' };
};

export const deleteAdmin = async (_url: string, _username: string, _csrfToken?: string): Promise<ApiResponse> => {
  return { status: 'error', message: 'Padam admin perlu dilakukan melalui Supabase Dashboard atau SQL.' };
};

export const loginAdmin = async (_url: string, _username: string, _password: string): Promise<ApiResponse> => {
  return { status: 'error', message: 'Guna loginAdminSupabase dari supabaseAuth.ts.' };
};

export const loginAdminRegional = async (_url: string, _username: string, _password: string, _role: string): Promise<ApiResponse> => {
  return { status: 'error', message: 'Guna loginAdminSupabase dari supabaseAuth.ts.' };
};

export const loginDeveloper = async (_url: string, _username: string, _password: string): Promise<ApiResponse> => {
  return { status: 'error', message: 'Guna loginAdminSupabase dari supabaseAuth.ts dengan role developer.' };
};

export const recordAttendanceVerification = async (record: { schoolCode: string; badge: string; year: number; participantCount: number }): Promise<ApiResponse> => {
  try {
    const school = await getSchoolByCodeOrName(record.schoolCode);
    if (!school) return { status: 'error', message: 'Sekolah tidak dijumpai.' };
    const badge = await getBadgeByName(record.badge);
    const { data: { user } } = await supabase.auth.getUser();
    
    // Check for duplicate (school + badge + year)
    const { count } = await supabase
      .from('attendance_verifications')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', school.id)
      .eq('badge_id', badge.id)
      .eq('year', record.year);
      
    if (count && count > 0) {
      return { status: 'error', message: `Sekolah ini telah disahkan untuk program ini pada tahun ${record.year}.` };
    }

    const { error } = await supabase.from('attendance_verifications').insert({
      school_id: school.id,
      badge_id: badge.id,
      year: record.year,
      verified_by: user?.id || null,
      participant_count: record.participantCount,
      source: 'qr_school_scan',
    });
    if (error) throw error;
    return { status: 'success', message: 'Kehadiran berjaya direkodkan.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal rekod kehadiran.' };
  }
};

export const withdrawParticipant = async (
  participantId: string,
  reason: string,
  notes?: string
): Promise<ApiResponse> => {
  try {
    if (!participantId) return { status: 'error', message: 'ID peserta diperlukan.' };
    if (!reason || !reason.trim()) return { status: 'error', message: 'Sebab penarikan diperlukan.' };
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase
      .from('submission_people')
      .update({
        is_withdrawn: true,
        withdrawn_at: new Date().toISOString(),
        withdrawal_reason: reason.trim(),
        withdrawal_notes: notes?.trim() || null,
        withdrawn_by: session?.user?.id || null,
      })
      .eq('id', participantId);
    if (error) throw error;
    return { status: 'success', message: 'Peserta berjaya ditarik balik.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal tarik balik peserta.' };
  }
};

export const unwithdrawParticipant = async (participantId: string): Promise<ApiResponse> => {
  try {
    if (!participantId) return { status: 'error', message: 'ID peserta diperlukan.' };
    const { error } = await supabase
      .from('submission_people')
      .update({
        is_withdrawn: false,
        withdrawn_at: null,
        withdrawal_reason: null,
        withdrawal_notes: null,
        withdrawn_by: null,
      })
      .eq('id', participantId);
    if (error) throw error;
    return { status: 'success', message: 'Penarikan diri berjaya dibatalkan.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal batal penarikan.' };
  }
};

export const getAttendanceVerifications = async (year?: number, daerahCode?: string, negeriCode?: string, badgeId?: string): Promise<any[]> => {
  try {
    let query = supabase.from('attendance_verifications').select('*, school:school_id(name, school_code, negeri:negeri_id(code), daerah:daerah_id(code)), badge:badge_id(name)').order('verified_at', { ascending: false });
    if (year) query = query.eq('year', year);
    if (badgeId) query = query.eq('badge_id', badgeId);
    const { data, error } = await query;
    if (error) throw error;
    let results = data || [];
    if (daerahCode) {
      results = results.filter((r: any) => r.school?.daerah?.code === daerahCode);
    }
    if (negeriCode) {
      results = results.filter((r: any) => r.school?.negeri?.code === negeriCode);
    }
    return results;
  } catch (error: any) {
    console.error('getAttendanceVerifications error:', error);
    return [];
  }
};

export const deleteAttendanceVerification = async (id: string): Promise<ApiResponse> => {
  try {
    if (!id) return { status: 'error', message: 'ID rekod kehadiran tidak sah.' };
    const { error } = await supabase.from('attendance_verifications').delete().eq('id', id);
    if (error) throw error;
    return { status: 'success', message: 'Rekod kehadiran berjaya dipadam.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal padam rekod kehadiran.' };
  }
};

export const bulkDeleteSubmissions = async (
  items: Array<{ participantId?: string; icNumber?: string; id?: string; student: string; badge?: string; schoolCode?: string; school?: string; date?: string }>
): Promise<ApiResponse> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { status: 'error', message: 'Sesi anda telah tamat. Sila log masuk semula.' };

    let deleted = 0;
    for (const item of items) {
      // 1) Utamakan padam ikut ID rekod tepat (submission_people.id).
      if (item.participantId) {
        const { error } = await supabase.from('submission_people').update({ is_deleted: true }).eq('id', item.participantId);
        if (!error) deleted++;
        continue;
      }
      // 2) Fallback berskop: sekolah + program (badge) + tahun yg sama sahaja.
      const year = item.date ? new Date(item.date).getFullYear() : currentYear();
      const subIds = await getScopedSubmissionIds(item.schoolCode, item.school, item.badge, year);
      if (!subIds || subIds.length === 0) continue; // skip jika skop tak pasti — elak padam merentas program/tahun
      let query = supabase.from('submission_people').update({ is_deleted: true }).in('submission_id', subIds);
      if (item.icNumber) query = query.eq('ic_number', item.icNumber);
      else if (item.id) query = query.eq('membership_id', normalize(item.id));
      else query = query.eq('name', normalize(item.student));
      const { error } = await query;
      if (!error) deleted++;
    }
    return { status: 'success', message: `${deleted} rekod berjaya dipadam.` };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal padam rekod.' };
  }
};

export const reopenSchoolBadge = async (_url: string, schoolCodeOrName: string, badgeNameWithYear: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const parts = badgeNameWithYear.split('_');
    const year = parts.length > 1 ? parseInt(parts[parts.length - 1]) : currentYear();
    const badgeName = parts.length > 1 ? parts.slice(0, -1).join('_') : badgeNameWithYear;

    let school = await getSchoolByCodeOrName(schoolCodeOrName);
    if (!school) school = await getSchoolByCodeOrName(undefined, schoolCodeOrName);
    if (!school) return { status: 'error', message: 'Sekolah tidak dijumpai.' };

    const badge = await getBadgeByName(badgeName);
    if (!badge) return { status: 'error', message: 'Badge tidak dijumpai.' };

    const { error } = await supabase.from('school_badge_status').upsert(
      { school_id: school.id, badge_id: badge.id, year: year || currentYear(), status: 'reopened' },
      { onConflict: 'school_id,badge_id,year' }
    );
    if (error) throw error;
    return { status: 'success' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal reopen badge.' };
  }
};

export const getSubmittedSchools = async (daerahCode?: string, year?: number, negeriCode?: string): Promise<any[]> => {
  try {
    const targetYear = year || currentYear();
    const { data, error } = await supabase
      .from('school_badge_status')
      .select('*, school:school_id(id, name, school_code, negeri:negeri_id(code), daerah:daerah_id(code)), badge:badge_id(name, scope, requires_daerah_approval, negeri:negeri_id(code), daerah:daerah_id(code))')
      .eq('status', 'submitted')
      .eq('year', targetYear)
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    let results = data || [];
    // Admin daerah: paparkan program daerah + program negeri yang requires_daerah_approval=true (belum disahkan daerah)
    if (daerahCode && !negeriCode) {
      results = results.filter((r: any) => {
        const badgeScope = r.badge?.scope || 'daerah';
        if (r.school?.daerah?.code !== daerahCode) return false;
        if (badgeScope === 'daerah') {
          if (r.badge?.daerah?.code && r.badge.daerah.code !== daerahCode) return false;
          return true;
        }
        // scope === 'negeri'
        if (!r.badge?.requires_daerah_approval) return false;
        if (r.daerah_approved) return false; // dah disahkan daerah, takde dalam senarai pending
        return true;
      });
    }
    // Admin negeri: program scope=negeri sahaja
    if (negeriCode && !daerahCode) {
      results = results.filter((r: any) => {
        const badgeScope = r.badge?.scope || 'daerah';
        if (badgeScope !== 'negeri') return false;
        if (r.school?.negeri?.code !== negeriCode) return false;
        if (r.badge?.negeri?.code && r.badge.negeri.code !== negeriCode) return false;
        // Kalau perlu pengesahan daerah, hanya papar yang dah disahkan daerah
        if (r.badge?.requires_daerah_approval && !r.daerah_approved) return false;
        return true;
      });
    }
    return results;
  } catch (error: any) {
    console.error('getSubmittedSchools error:', error);
    return [];
  }
};

export const toggleBadgeEditPermissionBatch = async (_url: string, badgeName: string, permissionType: 'students' | 'assistants' | 'examiners' | 'all', allow: boolean, year: number = currentYear(), _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const badge = await getBadgeByName(badgeName);
    if (!badge) return { status: 'error', message: 'Program tidak dijumpai.' };

    const { data: activeSchools, error: schoolsErr } = await supabase.from('schools').select('id').eq('is_active', true);
    if (schoolsErr) throw schoolsErr;

    const schoolIds = (activeSchools || []).map((s: any) => s.id);
    const { data: existingRows, error: existingErr } = await supabase
      .from('school_badge_status')
      .select('*')
      .eq('badge_id', badge.id)
      .eq('year', year)
      .in('school_id', schoolIds);
    if (existingErr) throw existingErr;

    const existingMap = new Map((existingRows || []).map((r: any) => [r.school_id, r]));
    const applyPermission = (current: any = {}) => permissionType === 'all'
      ? { ...current, students: allow, assistants: allow, examiners: allow }
      : { ...current, [permissionType]: allow };

    const rows = (activeSchools || []).map((s: any) => {
      const existing = existingMap.get(s.id) as any;
      let notes: any = {};
      try {
        notes = typeof existing?.notes === 'string' && existing.notes.trim().startsWith('{') ? JSON.parse(existing.notes) : {};
      } catch (_) {
        notes = {};
      }
      return {
        school_id: s.id,
        badge_id: badge.id,
        year,
        status: existing?.status || 'open',
        submitted_at: existing?.submitted_at || null,
        approved_at: existing?.approved_at || null,
        approved_by: existing?.approved_by || null,
        locked_at: existing?.locked_at || null,
        notes: JSON.stringify({ ...notes, editPermissions: applyPermission(notes.editPermissions || {}) }),
      };
    });

    const { error } = await supabase.from('school_badge_status').upsert(rows, { onConflict: 'school_id,badge_id,year' });
    if (error) throw error;
    return { status: 'success', message: `Kawalan edit ${badgeName} berjaya dikemaskini.` };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal kemaskini kawalan edit program.' };
  }
};

export const batchLockBadgeAllSchools = async (_url: string, badgeName: string, lock: boolean, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const badge = await getBadgeByName(badgeName);
    if (!badge) return { status: 'error', message: 'Badge tidak dijumpai.' };

    const { data: activeSchools, error: schoolsErr } = await supabase.from('schools').select('id').eq('is_active', true);
    if (schoolsErr) throw schoolsErr;

    if (lock) {
      const rows = (activeSchools || []).map((s: any) => ({
        school_id: s.id,
        badge_id: badge.id,
        year: currentYear(),
        status: 'locked',
      }));
      const { error } = await supabase.from('school_badge_status').upsert(rows, { onConflict: 'school_id,badge_id,year' });
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('school_badge_status')
        .delete()
        .eq('badge_id', badge.id)
        .eq('year', currentYear())
        .eq('status', 'locked');
      if (error) throw error;
    }
    return { status: 'success', message: `Badge '${badgeName}' berjaya ${lock ? 'dikunci' : 'dibuka'} untuk semua sekolah.` };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal batch lock/unlock badge.' };
  }
};

export const updateParticipantFields = async (identifier: { icNumber?: string; membershipId?: string; name?: string }, updates: { name?: string; gender?: string; race?: string; membershipId?: string; icNumber?: string; phoneNumber?: string; role?: string; category?: string; shirtSize?: string; unit?: string; makanan?: string; masalahKesihatan?: string; masalahKesihatanLain?: string; remarks?: string }): Promise<ApiResponse> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { status: 'error', message: 'Sesi anda telah tamat. Sila log masuk semula.' };

    const updateData: Record<string, any> = {};
    if (updates.name !== undefined) updateData.name = normalize(updates.name);
    if (updates.gender !== undefined) updateData.gender = updates.gender || null;
    if (updates.race !== undefined) updateData.race = updates.race || null;
    if (updates.membershipId !== undefined) updateData.membership_id = normalize(updates.membershipId);
    if (updates.icNumber !== undefined) updateData.ic_number = updates.icNumber || null;
    if (updates.phoneNumber !== undefined) updateData.phone_number = updates.phoneNumber || null;
    if (updates.role !== undefined) updateData.role = updates.role || 'PESERTA';
    if (updates.category !== undefined) updateData.category = updates.category || null;
    if (updates.shirtSize !== undefined) updateData.shirt_size = updates.shirtSize || null;
    if (updates.unit !== undefined) updateData.unit = updates.unit || null;
    if (updates.makanan !== undefined) updateData.makanan = updates.makanan || null;
    if (updates.masalahKesihatan !== undefined) updateData.masalah_kesihatan = updates.masalahKesihatan || null;
    if (updates.masalahKesihatanLain !== undefined) updateData.masalah_kesihatan_lain = updates.masalahKesihatanLain || null;
    if (updates.remarks !== undefined) updateData.remarks = updates.remarks || null;

    let query = supabase.from('submission_people').update(updateData);
    if (identifier.icNumber) query = query.eq('ic_number', identifier.icNumber);
    else if (identifier.membershipId) query = query.eq('membership_id', normalize(identifier.membershipId));
    else if (identifier.name) query = query.eq('name', normalize(identifier.name));
    else return { status: 'error', message: 'Tiada identifier untuk kemaskini.' };

    const { error } = await query;
    if (error) throw error;
    return { status: 'success', message: 'Rekod berjaya dikemaskini.' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal kemaskini rekod.' };
  }
};

// ============================================================
// FLOAT / TRANSFER STUDENT SYSTEM
// ============================================================

export interface FloatStudentInput {
  personId: string;
  reason: 'pindah_sekolah' | 'pindah_daerah' | 'pindah_negeri' | 'lain';
  notes?: string;
  floatedBy: string;
}

export const floatStudent = async (input: FloatStudentInput): Promise<ApiResponse> => {
  try {
    const { data: person } = await supabase
      .from('submission_people')
      .select('*, submission:submissions(school:schools(school_code, name, negeri_id, daerah_id))')
      .eq('id', input.personId)
      .maybeSingle();

    if (!person) return { status: 'error', message: 'Murid tidak dijumpai.' };
    if (person.float_status === 'floated') return { status: 'error', message: 'Murid sudah diapungkan.' };

    const schoolCode = person.submission?.school?.school_code || '';
    const schoolName = person.submission?.school?.name || '';

    const { error } = await supabase
      .from('submission_people')
      .update({
        float_status: 'floated',
        floated_at: new Date().toISOString(),
        floated_by: input.floatedBy,
        float_reason: input.reason,
        float_notes: input.notes || null,
        original_school_code: schoolCode,
      })
      .eq('id', input.personId);

    if (error) return { status: 'error', message: error.message };

    // Telegram notification (fire-and-forget)
    try {
      const { sendFloatNotification } = await import('./telegramService');
      sendFloatNotification({
        studentName: person.name,
        icNumber: person.ic_number,
        originalSchool: schoolName,
        action: 'float',
        reason: input.reason,
        notes: input.notes,
        performedBy: input.floatedBy,
      });
    } catch {}

    return { status: 'success', message: 'Murid berjaya diapungkan.' };
  } catch (err: any) {
    return { status: 'error', message: err.message || 'Gagal apungkan murid.' };
  }
};

export const unfloatStudent = async (personId: string): Promise<ApiResponse> => {
  try {
    const { data: person } = await supabase
      .from('submission_people')
      .select('*, submission:submissions(school:schools(school_code, name))')
      .eq('id', personId)
      .maybeSingle();

    if (!person) return { status: 'error', message: 'Murid tidak dijumpai.' };

    const originalSchoolCode = person.original_school_code || '';
    const schoolName = person.submission?.school?.name || originalSchoolCode;

    const { error } = await supabase
      .from('submission_people')
      .update({
        float_status: 'active',
        floated_at: null,
        floated_by: null,
        float_reason: null,
        float_notes: null,
        original_school_code: null,
      })
      .eq('id', personId);

    if (error) return { status: 'error', message: error.message };

    // Telegram notification (fire-and-forget)
    try {
      const { sendFloatNotification } = await import('./telegramService');
      sendFloatNotification({
        studentName: person.name,
        icNumber: person.ic_number,
        originalSchool: schoolName,
        action: 'unfloat',
        performedBy: 'admin',
      });
    } catch {}

    return { status: 'success', message: 'Murid berjaya dikembalikan.' };
  } catch (err: any) {
    return { status: 'error', message: err.message || 'Gagal kembalikan murid.' };
  }
};

export interface PullStudentInput {
  personId: string;
  targetSchoolCode: string;
  newRole?: string;
  newCategory?: string;
  pulledBy: string;
}

export interface FloatAndAssignStudentInput extends FloatStudentInput {
  targetSchoolCode: string;
  newRole?: string;
  newCategory?: string;
}

export const floatAndAssignStudent = async (input: FloatAndAssignStudentInput): Promise<ApiResponse> => {
  try {
    // 1. Float the student first
    const floatRes = await floatStudent(input);
    if (floatRes.status !== 'success') {
      return floatRes; // Abort if floating fails
    }

    // 2. Pull/Assign the student to the target school
    const pullRes = await pullStudent({
      personId: input.personId,
      targetSchoolCode: input.targetSchoolCode,
      newRole: input.newRole,
      newCategory: input.newCategory,
      pulledBy: input.floatedBy,
    });

    if (pullRes.status === 'success') {
      return { status: 'success', message: pullRes.message || 'Murid berjaya dipindahkan ke sekolah baru.' };
    } else {
      return { status: 'error', message: `Gagal assign murid ke sekolah baru. Murid kekal terapung. (${pullRes.message})` };
    }
  } catch (err: any) {
    return { status: 'error', message: err.message || 'Ralat sistem semasa assign murid.' };
  }
};

export const pullStudent = async (input: PullStudentInput): Promise<ApiResponse> => {
  try {
    // Ambil rekod murid + badge & tahun submission ASAL (submission_people tiada kolum badge).
    const { data: person } = await supabase
      .from('submission_people')
      .select('*, submission:submissions(submission_year, badges(name))')
      .eq('id', input.personId)
      .maybeSingle();

    if (!person) return { status: 'error', message: 'Murid tidak dijumpai.' };
    if (person.float_status !== 'floated') return { status: 'error', message: 'Murid bukan dalam status terapung.' };

    const school = await getSchoolByCodeOrName(input.targetSchoolCode);
    if (!school) return { status: 'error', message: `Sekolah '${input.targetSchoolCode}' tidak dijumpai.` };

    // Kekalkan badge & tahun ASAL murid (bukan default Keris Gangsa / tahun semasa).
    const badgeName = (person as any).submission?.badges?.name || 'Keris Gangsa';
    const year = (person as any).submission?.submission_year || new Date().getFullYear();
    const badge = await getBadgeByName(badgeName);

    // Guna semula submission sedia ada di sekolah sasaran (badge + tahun sama), atau cipta baru.
    let targetSubId: string;
    const { data: existingSub } = await supabase
      .from('submissions')
      .select('id')
      .eq('school_id', school.id).eq('badge_id', badge.id).eq('submission_year', year)
      .limit(1).maybeSingle();
    if (existingSub) {
      targetSubId = existingSub.id;
    } else {
      const { data: newSub, error: subErr } = await supabase
        .from('submissions')
        .insert({
          school_id: school.id,
          badge_id: badge.id,
          submission_year: year,
          status: 'draft',
          source: 'manual',
        })
        .select('id')
        .single();
      if (subErr || !newSub) return { status: 'error', message: `Gagal cipta submission di sekolah sasaran: ${subErr?.message || 'tidak diketahui'}` };
      targetSubId = newSub.id;
    }

    // Normalkan kategori: constraint DB hanya benarkan nilai sah atau NULL.
    // String kosong '' (yang biasa disimpan) akan melanggar constraint, jadi
    // tukar kepada NULL bila kategori tiada/tidak sah.
    const VALID_CATEGORIES = ['Pengakap Kanak-kanak', 'Pengakap Muda', 'Pengakap Remaja', 'Kelana'];
    const resolvedCategory = String(input.newCategory || person.category || '').trim();
    const safeCategory = VALID_CATEGORIES.includes(resolvedCategory) ? resolvedCategory : null;

    const { error: insertErr } = await supabase
      .from('submission_people')
      .insert({
        submission_id: targetSubId,
        name: person.name,
        gender: person.gender,
        race: person.race,
        membership_id: person.membership_id,
        ic_number: person.ic_number,
        phone_number: person.phone_number,
        role: input.newRole || person.role,
        category: safeCategory,
        unit: person.unit,
        makanan: person.makanan,
        masalah_kesihatan: person.masalah_kesihatan,
        masalah_kesihatan_lain: person.masalah_kesihatan_lain,
        remarks: person.remarks,
        float_status: 'active',
      });

    if (insertErr) return { status: 'error', message: insertErr.message };

    const { error: updateErr } = await supabase
      .from('submission_people')
      .update({
        float_status: 'transferred',
        transferred_to_school_code: input.targetSchoolCode,
        transferred_at: new Date().toISOString(),
      })
      .eq('id', input.personId);

    if (updateErr) return { status: 'error', message: updateErr.message };

    // Telegram notification (fire-and-forget)
    try {
      const { sendFloatNotification } = await import('./telegramService');
      sendFloatNotification({
        studentName: person.name,
        icNumber: person.ic_number,
        originalSchool: person.original_school_code || '',
        targetSchool: school.name,
        action: 'pull',
        performedBy: input.pulledBy,
      });
    } catch {}

    return { status: 'success', message: `Murid ${person.name} berjaya ditarik ke ${school.name}.` };
  } catch (err: any) {
    return { status: 'error', message: err.message || 'Gagal tarik murid.' };
  }
};

export const assignStudentDirect = async (input: PullStudentInput): Promise<ApiResponse> => {
  return pullStudent(input);
};

export interface AssignSchoolOption {
  school_code: string;
  name: string;
  negeri_code: string | null;
  negeri_name: string | null;
  daerah_code: string | null;
  daerah_name: string | null;
}

// Senarai sekolah aktif (dengan negeri & daerah) untuk pemilih sasaran pindah murid.
export const getActiveSchoolsForAssign = async (): Promise<AssignSchoolOption[]> => {
  try {
    const { data, error } = await supabase
      .from('schools')
      .select('school_code, name, negeri:negeri_id(code,name), daerah:daerah_id(code,name)')
      .eq('is_active', true)
      .order('name');
    if (error || !data) return [];
    return data.map((s: any) => {
      const negeri = Array.isArray(s.negeri) ? s.negeri[0] : s.negeri;
      const daerah = Array.isArray(s.daerah) ? s.daerah[0] : s.daerah;
      return {
        school_code: s.school_code,
        name: s.name,
        negeri_code: negeri?.code || null,
        negeri_name: negeri?.name || null,
        daerah_code: daerah?.code || null,
        daerah_name: daerah?.name || null,
      };
    });
  } catch {
    return [];
  }
};

// ============================================================
// PROGRAM SETTINGS (Yuran & Saiz Baju per program/skop/tahun)
// ============================================================

export interface ProgramSetting {
  badgeName: string;
  scope: 'negeri' | 'daerah';
  negeriCode?: string | null;
  daerahCode?: string | null;
  year: number;
  paymentEnabled: boolean;
  feePeserta: number | null;
  feePemimpin: number | null;
  feePenolong: number | null;
  shirtEnabled: boolean;
}

// Ambil tetapan program (boleh ditapis ikut tahun). Disertakan nama badge +
// skop + kod negeri/daerah untuk padanan di frontend.
export const getProgramSettings = async (year?: number): Promise<ProgramSetting[]> => {
  try {
    let query = supabase
      .from('program_settings')
      .select(`
        year, payment_enabled, fee_peserta, fee_pemimpin, fee_penolong, shirt_enabled,
        badge:badge_id(name, scope),
        negeri:negeri_id(code),
        daerah:daerah_id(code)
      `);
    if (year !== undefined) query = query.eq('year', year);
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map((r: any) => {
      const badge = Array.isArray(r.badge) ? r.badge[0] : r.badge;
      const negeri = Array.isArray(r.negeri) ? r.negeri[0] : r.negeri;
      const daerah = Array.isArray(r.daerah) ? r.daerah[0] : r.daerah;
      return {
        badgeName: badge?.name || '',
        scope: (badge?.scope || 'daerah') as 'negeri' | 'daerah',
        negeriCode: negeri?.code || null,
        daerahCode: daerah?.code || null,
        year: r.year,
        paymentEnabled: !!r.payment_enabled,
        feePeserta: r.fee_peserta !== null && r.fee_peserta !== undefined ? Number(r.fee_peserta) : null,
        feePemimpin: r.fee_pemimpin !== null && r.fee_pemimpin !== undefined ? Number(r.fee_pemimpin) : null,
        feePenolong: r.fee_penolong !== null && r.fee_penolong !== undefined ? Number(r.fee_penolong) : null,
        shirtEnabled: !!r.shirt_enabled,
      };
    });
  } catch {
    return [];
  }
};

export interface UpsertProgramSettingInput {
  badgeName: string;
  year: number;
  scope: 'negeri' | 'daerah';
  negeriCode?: string;
  daerahCode?: string;
  paymentEnabled: boolean;
  feePeserta: number | null;
  feePemimpin: number | null;
  feePenolong: number | null;
  shirtEnabled: boolean;
}

// Simpan (insert/update) tetapan program bagi skop & tahun tertentu.
export const upsertProgramSetting = async (input: UpsertProgramSettingInput): Promise<ApiResponse> => {
  try {
    const badge = await getBadgeByName(input.badgeName);
    const negeriId = input.scope === 'negeri' && input.negeriCode ? await getNegeriId(input.negeriCode) : null;
    const daerahId = input.scope === 'daerah' && input.daerahCode ? await getDaerahId(input.daerahCode) : null;

    if (input.scope === 'negeri' && !negeriId) return { status: 'error', message: 'Negeri tidak dijumpai.' };
    if (input.scope === 'daerah' && !daerahId) return { status: 'error', message: 'Daerah tidak dijumpai.' };

    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      badge_id: badge.id,
      negeri_id: negeriId,
      daerah_id: daerahId,
      year: input.year,
      payment_enabled: input.paymentEnabled,
      fee_peserta: input.paymentEnabled ? input.feePeserta : null,
      fee_pemimpin: input.paymentEnabled ? input.feePemimpin : null,
      fee_penolong: input.paymentEnabled ? input.feePenolong : null,
      shirt_enabled: input.shirtEnabled,
      created_by: user?.id || null,
      updated_at: new Date().toISOString(),
    };

    // Cari rekod sedia ada (ikut badge + tahun + skop)
    let existingQuery = supabase.from('program_settings').select('id').eq('badge_id', badge.id).eq('year', input.year);
    existingQuery = negeriId ? existingQuery.eq('negeri_id', negeriId) : existingQuery.is('negeri_id', null);
    existingQuery = daerahId ? existingQuery.eq('daerah_id', daerahId) : existingQuery.is('daerah_id', null);
    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      const { error } = await supabase.from('program_settings').update(payload).eq('id', existing.id);
      if (error) return { status: 'error', message: error.message };
    } else {
      const { error } = await supabase.from('program_settings').insert(payload);
      if (error) return { status: 'error', message: error.message };
    }
    return { status: 'success', message: 'Tetapan program disimpan.' };
  } catch (err: any) {
    return { status: 'error', message: err.message || 'Gagal simpan tetapan program.' };
  }
};

export interface FloatedStudent {
  id: string;
  student_name: string;
  ic_number: string;
  gender: string;
  race: string;
  role: string;
  category: string;
  membership_id: string;
  phone_number: string;
  float_status: string;
  floated_at: string;
  floated_by: string;
  float_reason: string;
  float_notes: string;
  original_school_code: string;
  current_school_code: string;
  school_name: string;
  daerah_code: string;
  daerah_name: string;
  negeri_code: string;
  negeri_name: string;
}

export const getFloatedStudents = async (
  negeriCode?: string,
  daerahCode?: string,
): Promise<FloatedStudent[]> => {
  try {
    let query = supabase
      .from('submission_people')
      .select(`
        *,
        submission:submissions(
          school:schools(
            school_code, name,
            negeri:negeri_id(code, name),
            daerah:daerah_id(code, name)
          )
        )
      `)
      .eq('float_status', 'floated')
      .order('floated_at', { ascending: false });

    if (negeriCode) {
      const negeriId = await getNegeriId(negeriCode);
      if (negeriId) {
        query = query.eq('submission.school.negeri_id', negeriId);
      }
    }
    if (daerahCode) {
      const daerahId = await getDaerahId(daerahCode);
      if (daerahId) {
        query = query.eq('submission.school.daerah_id', daerahId);
      }
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((row: any) => ({
      id: row.id,
      student_name: row.name,
      ic_number: row.ic_number || '',
      gender: row.gender || '',
      race: row.race || '',
      role: row.role || 'PESERTA',
      category: row.category || '',
      membership_id: row.membership_id || '',
      phone_number: row.phone_number || '',
      float_status: row.float_status,
      floated_at: row.floated_at,
      floated_by: row.floated_by,
      float_reason: row.float_reason,
      float_notes: row.float_notes,
      original_school_code: row.original_school_code || '',
      current_school_code: row.submission?.school?.school_code || '',
      school_name: row.submission?.school?.name || '',
      daerah_code: row.submission?.school?.daerah?.code || '',
      daerah_name: row.submission?.school?.daerah?.name || '',
      negeri_code: row.submission?.school?.negeri?.code || '',
      negeri_name: row.submission?.school?.negeri?.name || '',
    }));
  } catch {
    return [];
  }
};
