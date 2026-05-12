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
  let query = supabase.from('schools').select('*, negeri:negeri_id(code,name), daerah:daerah_id(code,name)');
  if (schoolCode) query = query.eq('school_code', normalize(schoolCode));
  else query = query.eq('name', normalize(schoolName));
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
};

const getNegeriId = async (code: string) => {
  const { data, error } = await supabase.from('negeri').select('id').eq('code', normalize(code)).maybeSingle();
  if (error) throw error;
  return data?.id || null;
};

const getDaerahId = async (code: string) => {
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
    let submissionsQuery = supabase.from('submission_people').select(`
      *,
      submission:submissions(
        id, submission_year, submitted_at, status, remarks,
        school:schools(id, name, school_code, negeri:negeri_id(code,name), daerah:daerah_id(code,name)),
        badge:badges(id, name)
      )
    `).eq('is_deleted', false).order('created_at', { ascending: false });

    if (role === 'negeri' && negeriCode) {
      const negeriId = await getNegeriId(negeriCode);
      if (negeriId) schoolsQuery = schoolsQuery.eq('negeri_id', negeriId);
    }
    if (role === 'daerah' && daerahCode) {
      const daerahId = await getDaerahId(daerahCode);
      if (daerahId) schoolsQuery = schoolsQuery.eq('daerah_id', daerahId);
    }

    const [schoolsRes, badgesRes, negeriRes, daerahRes, profilesRes, peopleRes, statusRes] = await Promise.all([
      schoolsQuery,
      supabase.from('badges').select('*').order('name'),
      supabase.from('negeri').select('*').order('name'),
      supabase.from('daerah').select('*, negeri:negeri_id(code,name)').order('name'),
      supabase.from('school_profiles').select('*, school:school_id(school_code,name)').order('updated_at', { ascending: false }),
      submissionsQuery,
      supabase.from('school_badge_status').select('*, school:school_id(school_code,name), badge:badge_id(name)').order('updated_at', { ascending: false }),
    ]);

    for (const res of [schoolsRes, badgesRes, negeriRes, daerahRes, profilesRes, peopleRes, statusRes]) {
      if (res.error) throw res.error;
    }

    const allowedSchoolCodes = new Set((schoolsRes.data || []).map((s: any) => s.school_code));

    const schools: School[] = (schoolsRes.data || []).map((s: any) => {
      const statusRows = (statusRes.data || []).filter((r: any) => r.school?.school_code === s.school_code);
      return {
        name: s.name,
        schoolCode: s.school_code,
        negeriCode: s.negeri?.code,
        daerahCode: s.daerah?.code,
        allowStudents: s.allow_students,
        allowAssistants: s.allow_assistants,
        allowExaminers: s.allow_examiners,
        lockedBadges: statusRows.filter((r: any) => r.status === 'locked').map((r: any) => r.badge?.name).filter(Boolean),
        approvedBadges: statusRows.filter((r: any) => r.status === 'approved').map((r: any) => r.badge?.name).filter(Boolean),
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
        icNumber: p.ic_number || '',
        studentPhone: p.phone_number || '',
        role: p.role || 'PESERTA',
        category: p.category || '',
        remarks: p.remarks || p.submission?.remarks || '',
      }));

    const userProfiles: UserProfile[] = (profilesRes.data || []).map((p: any) => ({
      schoolCode: p.school?.school_code || '',
      schoolName: p.school?.name || '',
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
    const badges: Badge[] = (badgesRes.data || []).map((b: any) => ({ name: b.name, isOpen: b.is_open, deadline: b.deadline }));

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
  source: 'manual' | 'bulk_import' | 'migration' = 'manual'
) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { status: 'error', message: 'Sesi anda telah tamat. Sila log masuk semula.' };
  }

  const school = await getSchoolByCodeOrName(leaderInfo.schoolCode, leaderInfo.schoolName);
  if (!school) return { status: 'error', message: 'Sekolah tidak dijumpai dalam Supabase.' };

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
      status: 'submitted',
      source,
      remarks: leaderInfo.groupNumber ? `No Kumpulan: ${leaderInfo.groupNumber}` : null,
    })
    .select('*')
    .single();
  if (subError) throw subError;

  const rows = people.filter(p => p.name?.trim()).map(p => ({
    submission_id: submission.id,
    name: normalize(p.name),
    gender: p.gender || null,
    race: p.race || null,
    membership_id: normalize(p.membershipId),
    ic_number: p.icNumber || null,
    phone_number: p.phoneNumber || null,
    role: (p as any).role || 'PESERTA',
    category: p.category || null,
    remarks: p.remarks || null,
  }));

  if (rows.length > 0) {
    const { error: peopleError } = await supabase.from('submission_people').insert(rows);
    if (peopleError) throw peopleError;
  }

  await supabase.from('school_profiles').upsert({
    school_id: school.id,
    principal_name: normalize(leaderInfo.principalName),
    principal_phone: leaderInfo.principalPhone || null,
    leader_name: normalize(leaderInfo.leaderName),
    leader_phone: leaderInfo.phone || null,
    leader_race: leaderInfo.race || null,
    updated_by: user?.id || null,
  }, { onConflict: 'school_id' });

  await supabase.from('school_badge_status').upsert({
    school_id: school.id,
    badge_id: badge.id,
    year,
    status: 'submitted',
    submitted_at: submittedAt,
  }, { onConflict: 'school_id,badge_id,year', ignoreDuplicates: true });

  return { status: 'success', message: 'Pendaftaran berjaya disimpan ke Supabase.' };
};

export const submitRegistration = async (
  _url: string,
  leaderInfo: LeaderInfo,
  participants: Participant[],
  assistants: Participant[] = [],
  examiners: Participant[] = [],
  customDate?: string,
  _csrfToken?: string
): Promise<ApiResponse> => {
  try {
    const allPeople = [
      ...participants.map(p => ({ ...p, role: 'PESERTA' })),
      ...assistants.map(p => ({ ...p, role: 'PENOLONG PEMIMPIN' })),
      ...examiners.map(p => ({ ...p, role: 'PENGUJI' })),
    ];
    const result = await createSubmissionWithPeople(leaderInfo, allPeople, customDate, 'manual');
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
    records: Array<{ student: string; icNumber: string; membershipId: string; gender: string; race: string; phoneNumber?: string; role?: 'PESERTA' | 'PEMIMPIN' | 'PENOLONG PEMIMPIN' | 'PENGUJI' | 'PENERIMA RAMBU'; category?: string; remarks?: string; }>;
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
    const people = payload.records.map((r, idx) => ({
      id: idx + 1,
      name: r.student,
      icNumber: r.icNumber,
      membershipId: r.membershipId,
      gender: r.gender,
      race: r.race,
      phoneNumber: r.phoneNumber || '',
      category: r.category || 'Perdana',
      remarks: r.remarks || '',
      role: r.role || payload.role,
    }));
    return await createSubmissionWithPeople(leaderInfo, people, `${payload.year}-01-01`, 'bulk_import') as ApiResponse;
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal import bulk.' };
  }
};

export const deleteSubmission = async (_url: string, submission: SubmissionData, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    let query = supabase.from('submission_people').update({ is_deleted: true });
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

export const addSchoolBatch = async (_url: string, schools: string[], negeriCode?: string, daerahCode?: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const negeriId = negeriCode ? await getNegeriId(negeriCode) : null;
    const daerahId = daerahCode ? await getDaerahId(daerahCode) : null;
    const rows = schools.map(name => ({ name: normalize(name), school_code: normalize(name), negeri_id: negeriId, daerah_id: daerahId, is_active: true }));
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
    
    const { error } = await supabase.from('school_badge_status').upsert({ school_id: school.id, badge_id: badge.id, year: year || currentYear(), status: 'locked' }, { onConflict: 'school_id,badge_id,year' });
    if (error) throw error;
    return { status: 'success' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal lock badge.' };
  }
};

export const unlockSchoolBadge = async (_url: string, schoolName: string, badgeName: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const school = await getSchoolByCodeOrName(undefined, schoolName);
    const badge = await getBadgeByName(badgeName);
    if (!school || !badge) return { status: 'error', message: 'Sekolah atau badge tidak dijumpai.' };
    await supabase.from('school_badge_status').delete().eq('school_id', school.id).eq('badge_id', badge.id).eq('year', currentYear()).eq('status', 'locked');
    return { status: 'success' };
  } catch (error: any) {
    return { status: 'error', message: error.message || 'Gagal unlock badge.' };
  }
};

export const approveSchoolBadge = async (_url: string, schoolName: string, badgeName: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const school = await getSchoolByCodeOrName(undefined, schoolName);
    const badge = await getBadgeByName(badgeName);
    if (!school || !badge) return { status: 'error', message: 'Sekolah atau badge tidak dijumpai.' };
    await supabase.from('school_badge_status').upsert({ school_id: school.id, badge_id: badge.id, year: currentYear(), status: 'approved' }, { onConflict: 'school_id,badge_id,year' });
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
    await supabase.from('school_profiles').upsert({
      school_id: school.id,
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

export const addBadgeType = async (_url: string, badgeName: string, _csrfToken?: string): Promise<ApiResponse> => {
  try {
    const { error } = await supabase.from('badges').insert({ name: badgeName.trim(), is_open: true });
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

export const getAttendanceVerifications = async (year?: number, daerahCode?: string): Promise<any[]> => {
  try {
    let query = supabase.from('attendance_verifications').select('*, school:school_id(name, school_code, daerah:daerah_id(code)), badge:badge_id(name)').order('verified_at', { ascending: false });
    if (year) query = query.eq('year', year);
    const { data, error } = await query;
    if (error) throw error;
    let results = data || [];
    if (daerahCode) {
      results = results.filter((r: any) => r.school?.daerah?.code === daerahCode);
    }
    return results;
  } catch (error: any) {
    console.error('getAttendanceVerifications error:', error);
    return [];
  }
};

export const bulkDeleteSubmissions = async (items: Array<{ icNumber?: string; id?: string; student: string }>): Promise<ApiResponse> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { status: 'error', message: 'Sesi anda telah tamat. Sila log masuk semula.' };

    let deleted = 0;
    for (const item of items) {
      let query = supabase.from('submission_people').update({ is_deleted: true });
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

export const updateParticipantFields = async (identifier: { icNumber?: string; membershipId?: string; name?: string }, updates: { name?: string; gender?: string; race?: string; membershipId?: string; icNumber?: string; phoneNumber?: string; role?: string; category?: string; remarks?: string }): Promise<ApiResponse> => {
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
