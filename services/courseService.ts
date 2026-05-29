import { supabase } from './supabaseClient';
import type {
  Course,
  CourseRegistration,
  CourseDocument,
  CourseAttendance,
  CourseScope,
  CourseStatus,
  RegistrationStatus,
  PaymentStatus,
} from '../types';

// ============================================================
// HELPER: Map row -> Course type
// ============================================================
function mapCourseRow(row: any): Course {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    scope: row.scope,
    negeriId: row.negeri_id,
    negeriName: row.negeri?.name,
    daerahId: row.daerah_id,
    daerahName: row.daerah?.name,
    startDate: row.start_date,
    endDate: row.end_date,
    venue: row.venue,
    venueAddress: row.venue_address,
    quota: row.quota,
    feeAmount: parseFloat(row.fee_amount) || 0,
    registrationDeadline: row.registration_deadline,
    status: row.status,
    hasDigitalCertificate: row.has_digital_certificate || false,
    certificateTemplateId: row.certificate_template_id,
    certificateTemplateUrl: row.certificate_template_url,
    certificateRequiresApproval: row.certificate_requires_approval ?? true,
    createdByRole: row.created_by_role,
    createdBy: row.created_by,
    createdAt: row.created_at,
    registeredCount: row.registered_count,
  };
}

function mapRegistrationRow(row: any): CourseRegistration {
  return {
    id: row.id,
    courseId: row.course_id,
    leaderId: row.leader_id,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentProofUrl: row.payment_proof_url,
    resultGrade: row.result_grade,
    resultNotes: row.result_notes,
    certificateUrl: row.certificate_url,
    certificateGeneratedAt: row.certificate_generated_at,
    certificateStatus: row.certificate_status,
    certificateApprovedBy: row.certificate_approved_by,
    certificateApprovedAt: row.certificate_approved_at,
    certificateRejectReason: row.certificate_reject_reason,
    adminNotes: row.admin_notes,
    registeredAt: row.registered_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
  };
}

// ============================================================
// COURSE: CRUD
// ============================================================

export interface CreateCourseInput {
  code?: string;
  name: string;
  description?: string;
  scope: CourseScope;
  negeriId?: string | null;
  daerahId?: string | null;
  startDate: string;
  endDate: string;
  venue: string;
  venueAddress?: string;
  quota: number;
  feeAmount: number;
  registrationDeadline?: string | null;
  status?: CourseStatus;
  hasDigitalCertificate?: boolean;
  certificateRequiresApproval?: boolean;
  certificateTemplateId?: string | null;
  certificateTemplateUrl?: string | null;
  createdByRole?: string;
  createdBy?: string;
}

export async function createCourse(input: CreateCourseInput): Promise<{ success: boolean; course?: Course; message?: string }> {
  try {
    if (!input.name?.trim()) return { success: false, message: 'Nama kursus diperlukan.' };
    if (!input.startDate || !input.endDate) return { success: false, message: 'Tarikh mula & tamat diperlukan.' };
    if (new Date(input.endDate) < new Date(input.startDate)) {
      return { success: false, message: 'Tarikh tamat tidak boleh sebelum tarikh mula.' };
    }
    if (!input.venue?.trim()) return { success: false, message: 'Tempat kursus diperlukan.' };
    if (input.quota < 1) return { success: false, message: 'Kuota mesti sekurang-kurangnya 1.' };
    if (input.scope === 'negeri' && !input.negeriId) {
      return { success: false, message: 'Sila pilih negeri untuk kursus peringkat negeri.' };
    }
    if (input.scope === 'daerah' && (!input.daerahId || !input.negeriId)) {
      return { success: false, message: 'Sila pilih negeri & daerah untuk kursus peringkat daerah.' };
    }

    // Auto-generate code if not provided
    const code = input.code?.trim() || `KSPN-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

    const { data, error } = await supabase
      .from('courses')
      .insert({
        code,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        scope: input.scope,
        negeri_id: input.negeriId || null,
        daerah_id: input.daerahId || null,
        start_date: input.startDate,
        end_date: input.endDate,
        venue: input.venue.trim(),
        venue_address: input.venueAddress?.trim() || null,
        quota: input.quota,
        fee_amount: input.feeAmount,
        registration_deadline: input.registrationDeadline || null,
        status: input.status || 'open',
        created_by_role: input.createdByRole,
        created_by: input.createdBy,
      })
      .select('*, negeri:negeri_id(name, code), daerah:daerah_id(name, code)')
      .single();

    if (error || !data) {
      return { success: false, message: error?.message || 'Gagal mencipta kursus.' };
    }
    return { success: true, course: mapCourseRow(data) };
  } catch (err: any) {
    return { success: false, message: err.message || 'Ralat sistem.' };
  }
}

export async function updateCourse(id: string, patch: Partial<CreateCourseInput>): Promise<{ success: boolean; message?: string }> {
  try {
    const update: any = {};
    if (patch.name !== undefined) update.name = patch.name.trim();
    if (patch.description !== undefined) update.description = patch.description?.trim() || null;
    if (patch.startDate !== undefined) update.start_date = patch.startDate;
    if (patch.endDate !== undefined) update.end_date = patch.endDate;
    if (patch.venue !== undefined) update.venue = patch.venue.trim();
    if (patch.venueAddress !== undefined) update.venue_address = patch.venueAddress?.trim() || null;
    if (patch.quota !== undefined) update.quota = patch.quota;
    if (patch.feeAmount !== undefined) update.fee_amount = patch.feeAmount;
    if (patch.registrationDeadline !== undefined) update.registration_deadline = patch.registrationDeadline;
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.hasDigitalCertificate !== undefined) update.has_digital_certificate = patch.hasDigitalCertificate;
    if (patch.certificateRequiresApproval !== undefined) update.certificate_requires_approval = patch.certificateRequiresApproval;
    if (patch.certificateTemplateId !== undefined) update.certificate_template_id = patch.certificateTemplateId;
    if (patch.certificateTemplateUrl !== undefined) update.certificate_template_url = patch.certificateTemplateUrl;
    update.updated_at = new Date().toISOString();

    const { error } = await supabase.from('courses').update(update).eq('id', id);
    if (error) return { success: false, message: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message || 'Ralat sistem.' };
  }
}

export async function deleteCourse(id: string): Promise<{ success: boolean; message?: string }> {
  try {
    // Delete dependent records first
    await supabase.from('course_attendance').delete().eq('course_id', id);

    const { data: regs } = await supabase
      .from('course_registrations')
      .select('id')
      .eq('course_id', id);

    if (regs && regs.length > 0) {
      const regIds = regs.map((r: any) => r.id);
      await supabase.from('course_documents').delete().in('registration_id', regIds);
    }

    await supabase.from('course_registrations').delete().eq('course_id', id);

    // Delete the course
    const { error } = await supabase
      .from('courses')
      .delete()
      .eq('id', id);

    if (error) return { success: false, message: error.message };

    // Verify deletion
    const { data: remaining } = await supabase
      .from('courses')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (remaining) {
      return { success: false, message: 'Kursus masih wujud selepas cubaan padam. Semak RLS policy DELETE di Supabase Dashboard.' };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message || 'Ralat sistem.' };
  }
}

// ============================================================
// COURSE: LIST / FETCH
// ============================================================

export interface ListCoursesFilter {
  scope?: CourseScope;
  status?: CourseStatus;
  negeriId?: string;
  daerahId?: string;
  // Untuk dashboard pemimpin: ambil kursus relevan dengan lokasi pemimpin
  leaderNegeriId?: string;
  leaderDaerahId?: string;
}

export async function listCourses(filter: ListCoursesFilter = {}): Promise<Course[]> {
  try {
    let query = supabase
      .from('courses')
      .select('*, negeri:negeri_id(name, code), daerah:daerah_id(name, code)')
      .order('start_date', { ascending: true });

    if (filter.scope) query = query.eq('scope', filter.scope);
    if (filter.status) query = query.eq('status', filter.status);
    if (filter.negeriId) query = query.eq('negeri_id', filter.negeriId);
    if (filter.daerahId) query = query.eq('daerah_id', filter.daerahId);

    const { data, error } = await query;
    if (error || !data) {
      console.error('listCourses error:', error);
      return [];
    }

    let courses = data.map(mapCourseRow);

    // Geo-filter untuk dashboard pemimpin
    if (filter.leaderNegeriId || filter.leaderDaerahId) {
      courses = courses.filter((c) => {
        if (c.scope === 'negeri') {
          // Program negeri: tunjuk jika sepadan negeri pemimpin (atau pemimpin tiada negeri)
          return !filter.leaderNegeriId || c.negeriId === filter.leaderNegeriId;
        }
        if (c.scope === 'daerah') {
          // Program daerah: tunjuk hanya jika sepadan daerah pemimpin
          return !filter.leaderDaerahId || c.daerahId === filter.leaderDaerahId;
        }
        return false;
      });
    }

    // Tambah registered count via Promise.all
    const counts = await Promise.all(
      courses.map(async (c) => {
        const { count } = await supabase
          .from('course_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('course_id', c.id)
          .neq('status', 'cancelled');
        return { id: c.id, count: count || 0 };
      }),
    );
    const countMap = new Map(counts.map((c) => [c.id, c.count]));
    courses.forEach((c) => { c.registeredCount = countMap.get(c.id) || 0; });

    return courses;
  } catch (err) {
    console.error('listCourses error:', err);
    return [];
  }
}

export async function getCourseById(id: string): Promise<Course | null> {
  try {
    const { data, error } = await supabase
      .from('courses')
      .select('*, negeri:negeri_id(name, code), daerah:daerah_id(name, code)')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;

    const course = mapCourseRow(data);
    const { count } = await supabase
      .from('course_registrations')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', id)
      .neq('status', 'cancelled');
    course.registeredCount = count || 0;
    return course;
  } catch (err) {
    console.error('getCourseById error:', err);
    return null;
  }
}
// ============================================================
// REGISTRATION: daftar kursus
// ============================================================

export interface RegisterCourseInput {
  courseId: string;
  leaderId: string;
  documents?: Array<{
    documentType: 'ic' | 'sijil' | 'lain';
    fileUrl: string;
    fileName: string;
    fileSize?: number;
  }>;
}

export async function registerForCourse(input: RegisterCourseInput): Promise<{ success: boolean; registration?: CourseRegistration; message?: string }> {
  try {
    // Cek course wujud & buka pendaftaran
    const course = await getCourseById(input.courseId);
    if (!course) return { success: false, message: 'Kursus tidak dijumpai.' };
    if (course.status !== 'open') return { success: false, message: 'Pendaftaran kursus ini telah ditutup.' };
    if (course.registrationDeadline && new Date(course.registrationDeadline) < new Date()) {
      return { success: false, message: 'Tarikh tutup pendaftaran telah berlalu.' };
    }
    if ((course.registeredCount || 0) >= course.quota) {
      return { success: false, message: 'Kuota kursus telah penuh.' };
    }

    // Cek duplicate
    const { data: existing } = await supabase
      .from('course_registrations')
      .select('id, status')
      .eq('course_id', input.courseId)
      .eq('leader_id', input.leaderId)
      .maybeSingle();

    if (existing && existing.status !== 'cancelled') {
      return { success: false, message: 'Anda sudah berdaftar untuk kursus ini.' };
    }

    // Insert / update
    let registrationId: string;
    if (existing) {
      const { data, error } = await supabase
        .from('course_registrations')
        .update({
          status: 'registered',
          payment_status: course.feeAmount > 0 ? 'unpaid' : 'waived',
          registered_at: new Date().toISOString(),
          cancelled_at: null,
          cancel_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error || !data) return { success: false, message: error?.message || 'Gagal mendaftar.' };
      registrationId = data.id;
    } else {
      const { data, error } = await supabase
        .from('course_registrations')
        .insert({
          course_id: input.courseId,
          leader_id: input.leaderId,
          status: 'registered',
          payment_status: course.feeAmount > 0 ? 'unpaid' : 'waived',
        })
        .select()
        .single();
      if (error || !data) return { success: false, message: error?.message || 'Gagal mendaftar.' };
      registrationId = data.id;
    }

    // Insert documents
    if (input.documents && input.documents.length > 0) {
      const docInserts = input.documents.map((d) => ({
        registration_id: registrationId,
        document_type: d.documentType,
        file_url: d.fileUrl,
        file_name: d.fileName,
        file_size: d.fileSize || null,
      }));
      await supabase.from('course_documents').insert(docInserts);
    }

    const { data: regData } = await supabase
      .from('course_registrations')
      .select('*')
      .eq('id', registrationId)
      .single();

    return { success: true, registration: regData ? mapRegistrationRow(regData) : undefined };
  } catch (err: any) {
    console.error('registerForCourse error:', err);
    return { success: false, message: err.message || 'Ralat sistem.' };
  }
}

export async function cancelRegistration(
  registrationId: string,
  cancelledBy: string,
  reason?: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    const { error } = await supabase
      .from('course_registrations')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: cancelledBy,
        cancel_reason: reason || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', registrationId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message || 'Ralat sistem.' };
  }
}
// ============================================================
// REGISTRATIONS: list / fetch
// ============================================================

export async function listRegistrationsByLeader(leaderId: string): Promise<CourseRegistration[]> {
  try {
    const { data, error } = await supabase
      .from('course_registrations')
      .select('*, course:course_id(*, negeri:negeri_id(name), daerah:daerah_id(name))')
      .eq('leader_id', leaderId)
      .order('registered_at', { ascending: false });
    if (error || !data) return [];
    return data.map((row: any) => ({
      ...mapRegistrationRow(row),
      course: row.course ? mapCourseRow(row.course) : undefined,
    }));
  } catch (err) {
    console.error('listRegistrationsByLeader error:', err);
    return [];
  }
}

export async function listRegistrationsByCourse(courseId: string): Promise<CourseRegistration[]> {
  try {
    const { data, error } = await supabase
      .from('course_registrations')
      .select('*, leader:leader_id(id, full_name, email, ic_number, phone_number, leader_type, school:school_id(name), negeri:negeri_id(name), daerah:daerah_id(name))')
      .eq('course_id', courseId)
      .order('registered_at', { ascending: true });
    if (error || !data) return [];
    return data.map((row: any) => {
      const reg = mapRegistrationRow(row);
      if (row.leader) {
        reg.leader = {
          id: row.leader.id,
          email: row.leader.email,
          icNumber: row.leader.ic_number,
          fullName: row.leader.full_name,
          phoneNumber: row.leader.phone_number,
          leaderType: row.leader.leader_type,
          schoolName: row.leader.school?.name,
          negeriName: row.leader.negeri?.name,
          daerahName: row.leader.daerah?.name,
          emailVerified: false,
          isActive: true,
          createdAt: '',
        };
      }
      return reg;
    });
  } catch (err) {
    console.error('listRegistrationsByCourse error:', err);
    return [];
  }
}
// ============================================================
// STORAGE: Upload documents / payment proof
// ============================================================
// Lebih utama guna Cloudflare R2 (uploadToR2 dari r2Service).
// Fungsi ini kekal sebagai fallback untuk Supabase Storage
// (digunakan untuk file legacy yang sudah ada).

export async function uploadCourseFile(
  bucket: 'course-documents' | 'course-certificates',
  file: File,
  pathPrefix: string,
): Promise<{ success: boolean; url?: string; message?: string }> {
  try {
    // Cuba R2 dulu (lebih mahal kalau berkali2 fallback Supabase)
    const r2Module = await import('./r2Service');
    const r2Result = await r2Module.uploadToR2(file, {
      folder: pathPrefix,
      bucket: bucket === 'course-certificates' ? 'certificates' : 'documents',
    });
    if (r2Result.success) {
      return { success: true, url: r2Result.url };
    }
    // Fallback Supabase Storage
    const ext = file.name.split('.').pop() || 'bin';
    const fileName = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, file, { upsert: false, contentType: file.type });
    if (error) return { success: false, message: error.message };
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return { success: true, url: pub.publicUrl };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal muat naik fail.' };
  }
}

export async function listDocumentsByRegistration(registrationId: string): Promise<CourseDocument[]> {
  const { data } = await supabase
    .from('course_documents')
    .select('*')
    .eq('registration_id', registrationId)
    .order('uploaded_at', { ascending: false });
  if (!data) return [];
  return data.map((d: any) => ({
    id: d.id,
    registrationId: d.registration_id,
    documentType: d.document_type,
    fileUrl: d.file_url,
    fileName: d.file_name,
    fileSize: d.file_size,
    uploadedAt: d.uploaded_at,
  }));
}

// ============================================================
// PAYMENT
// ============================================================

export async function uploadPaymentProof(
  registrationId: string,
  proofUrl: string,
): Promise<{ success: boolean; message?: string }> {
  const { error } = await supabase
    .from('course_registrations')
    .update({ payment_proof_url: proofUrl, updated_at: new Date().toISOString() })
    .eq('id', registrationId);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function verifyPayment(
  registrationId: string,
  status: PaymentStatus,
  verifiedBy: string,
): Promise<{ success: boolean; message?: string }> {
  const { error } = await supabase
    .from('course_registrations')
    .update({
      payment_status: status,
      payment_verified_at: status === 'paid' ? new Date().toISOString() : null,
      payment_verified_by: status === 'paid' ? verifiedBy : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', registrationId);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

// ============================================================
// ATTENDANCE
// ============================================================

export async function markAttendance(
  courseId: string,
  leaderId: string,
  registrationId: string,
  method: 'qr' | 'manual',
  verifiedBy: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    // Cek dah ada attendance
    const { data: existing } = await supabase
      .from('course_attendance')
      .select('id')
      .eq('course_id', courseId)
      .eq('leader_id', leaderId)
      .maybeSingle();

    if (existing) {
      return { success: false, message: 'Kehadiran sudah direkodkan.' };
    }

    const { error } = await supabase.from('course_attendance').insert({
      course_id: courseId,
      leader_id: leaderId,
      registration_id: registrationId,
      method,
      verified_by: verifiedBy,
    });
    if (error) return { success: false, message: error.message };

    // Auto-update registration status -> attended
    await supabase
      .from('course_registrations')
      .update({ status: 'attended', updated_at: new Date().toISOString() })
      .eq('id', registrationId);

    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message || 'Ralat sistem.' };
  }
}

export async function listAttendanceByCourse(courseId: string): Promise<CourseAttendance[]> {
  const { data } = await supabase
    .from('course_attendance')
    .select('*')
    .eq('course_id', courseId)
    .order('check_in_at', { ascending: true });
  if (!data) return [];
  return data.map((r: any) => ({
    id: r.id,
    courseId: r.course_id,
    leaderId: r.leader_id,
    registrationId: r.registration_id,
    checkInAt: r.check_in_at,
    checkOutAt: r.check_out_at,
    method: r.method,
    verifiedBy: r.verified_by,
    notes: r.notes,
  }));
}

// ============================================================
// RESULTS
// ============================================================

export async function setResult(
  registrationId: string,
  status: 'passed' | 'failed' | 'absent',
  grade: string | null,
  notes: string | null,
): Promise<{ success: boolean; message?: string }> {
  const { error } = await supabase
    .from('course_registrations')
    .update({
      status,
      result_grade: grade,
      result_notes: notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', registrationId);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function setCertificateUrl(
  registrationId: string,
  url: string,
): Promise<{ success: boolean; message?: string }> {
  const { error } = await supabase
    .from('course_registrations')
    .update({
      certificate_url: url,
      certificate_generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', registrationId);
  if (error) return { success: false, message: error.message };
  return { success: true };
}
// ============================================================
// CERTIFICATE APPROVAL FLOW
// ============================================================

export type CertificateStatus = 'pending' | 'approved' | 'rejected' | 'released';

export async function setCertificateStatus(
  registrationId: string,
  status: CertificateStatus,
  adminUser: string,
  rejectReason?: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    const update: any = {
      certificate_status: status,
      updated_at: new Date().toISOString(),
    };
    if (status === 'approved' || status === 'released') {
      update.certificate_approved_by = adminUser;
      update.certificate_approved_at = new Date().toISOString();
      update.certificate_reject_reason = null;
    }
    if (status === 'rejected') {
      update.certificate_reject_reason = rejectReason || null;
      update.certificate_approved_by = null;
      update.certificate_approved_at = null;
    }

    const { error } = await supabase
      .from('course_registrations')
      .update(update)
      .eq('id', registrationId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message || 'Ralat sistem.' };
  }
}