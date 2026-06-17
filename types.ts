

export interface Participant {
  id: number;
  name: string;
  gender: string;
  race: string;
  membershipId: string;
  icNumber: string;
  phoneNumber: string; 
  kategori?: 'Pengakap Kanak-kanak' | 'Pengakap Muda' | 'Pengakap Remaja' | 'Kelana';
  unit?: 'Perdana' | 'Udara' | 'Laut' | 'PPKI' | 'PPKI Udara';
  makanan?: 'Biasa' | 'Vegetarian';
  masalahKesihatan?: 'Alahan' | 'Asma' | 'Gastrik' | 'Penyakit Jantung' | 'Migrain' | 'Penyakit Kronik' | 'Lain-lain' | 'Tiada';
  masalahKesihatanLain?: string;
  shirtSize?: string;
  remarks: string;
}

export interface LeaderInfo {
  schoolName: string;
  schoolCode: string;
  groupNumber?: string;
  principalName: string; 
  principalPhone: string; 
  leaderName: string;
  race: string; 
  phone: string;
  badgeType: string;
}

export interface SubmissionData {
  rowIndex?: number; 
  date: string;
  school: string;
  schoolCode?: string;
  negeriCode?: string;
  daerahCode?: string;
  badge: string;
  student: string;
  gender: string;
  race?: string;
  id: string; 
  personId?: string;
  icNumber?: string;
  studentPhone?: string; 
  role?: string;
  groupNumber?: string;
  principalName?: string;
  principalPhone?: string;
  leader?: string;
  category?: string;
  shirtSize?: string;
  unit?: string;
  makanan?: string;
  masalahKesihatan?: string;
  masalahKesihatanLain?: string;
  remarks: string;
  // Penarikan diri (withdrawal)
  isWithdrawn?: boolean;
  withdrawnAt?: string;
  withdrawalReason?: string;
  withdrawalNotes?: string;
  participantId?: string; // submission_people.id (untuk QR & withdrawal scanner)
}

export interface Badge {
  name: string;
  isOpen: boolean;
  deadline?: string;
  scope?: 'negeri' | 'daerah';
  negeriCode?: string;
  daerahCode?: string;
  requiresDaerahApproval?: boolean;
}

export interface School {
  name: string;
  schoolCode?: string;
  negeriCode?: string;
  daerahCode?: string;
  isClaimed?: boolean;
  claimedEmail?: string;
  claimedAt?: string;
  // Granular Permissions
  allowStudents: boolean;
  allowAssistants: boolean;
  allowExaminers: boolean;
  allowEdit?: boolean; // Deprecated, kept for legacy compatibility check
  
  lockedBadges?: string[]; 
  approvedBadges?: string[]; 
  badgeEditPermissions?: Record<string, {
    students?: boolean;
    assistants?: boolean;
    examiners?: boolean;
  }>;
}

export interface Negeri {
  code: string;
  name: string;
  createdDate?: string;
}

export interface Daerah {
  code: string;
  name: string;
  negeriCode: string;
  createdDate?: string;
}

export interface AdminRegional {
  username: string;
  role: 'negeri' | 'daerah';
  fullName?: string;
  phone?: string;
  email?: string;
  negeriCode?: string;
  daerahCode?: string;
  authToken?: string;
  expiresAt?: number;
  scope?: {
    canManageNegeri: boolean;
    canManageDaerah: boolean;
    canManageSchools: boolean;
    canManageBadges: boolean;
    canViewAllNegeri: boolean;
    canViewAllDaerah: boolean;
    negeriAccess: string[];
    daerahAccess: string[] | 'ALL_IN_NEGERI';
  };
}

export interface UserProfile {
  schoolCode: string;
  schoolName: string;
  negeriCode?: string;
  daerahCode?: string;
  phone?: string;
  groupNumber?: string;
  principalName?: string;
  principalPhone?: string;
  leaderName?: string;
  leaderPhone?: string;
  leaderIC?: string;
  leaderGender?: string;
  leaderMembershipId?: string;
  leaderRace?: string;
  remarks?: string;
  lastUpdated?: string;
}

export interface ApiResponse {
  status: 'success' | 'error';
  schools?: School[]; 
  badges?: Badge[];
  badgeTypes?: string[];
  isRegistrationOpen?: boolean;
  submissions?: SubmissionData[];
  userProfiles?: UserProfile[];
  negeriList?: Negeri[];
  daerahList?: Daerah[];
  message?: string;
  user?: UserSession;
  role?: string;
  username?: string;
  fullName?: string;
  negeriCode?: string;
  daerahCode?: string;
  authToken?: string;
  expiresAt?: number;
}

export interface UserSession {
  userId?: string;
  schoolName: string;
  schoolCode: string;
  schoolId?: string;
  isLoggedIn: boolean;
  groupNumber?: string;
  authToken?: string;
  expiresAt?: number;
}

export enum BadgeType {
  KERIS_GANGSA = 'Keris Gangsa',
  KERIS_PERAK = 'Keris Perak',
  KERIS_EMAS = 'Keris Emas'
}

// ============================================================
// MODUL KURSUS PEMIMPIN
// ============================================================

export type LeaderType = 'guru' | 'luar';

export interface LeaderAccount {
  id: string;
  email: string;
  icNumber: string;
  fullName: string;
  phoneNumber: string;
  leaderType: LeaderType;
  schoolId?: string | null;
  schoolName?: string | null;
  negeriId?: string | null;
  negeriName?: string | null;
  daerahId?: string | null;
  daerahName?: string | null;
  emailVerified: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface LeaderSession {
  leaderId: string;
  email: string;
  fullName: string;
  icNumber: string;
  phoneNumber: string;
  leaderType: LeaderType;
  schoolId?: string | null;
  schoolName?: string | null;
  schoolCode?: string | null;
  schoolLinkStatus?: 'pending' | 'approved' | 'rejected' | null;
  passwordHash?: string | null;
  negeriId?: string | null;
  negeriName?: string | null;
  daerahId?: string | null;
  daerahName?: string | null;
  expiresAt: number;
  isLoggedIn: boolean;
}

export type CourseScope = 'negeri' | 'daerah';
export type CourseStatus = 'draft' | 'open' | 'closed' | 'completed' | 'cancelled';

export interface Course {
  id: string;
  code: string;
  name: string;
  description?: string;
  scope: CourseScope;
  negeriId?: string | null;
  negeriName?: string | null;
  daerahId?: string | null;
  daerahName?: string | null;
  startDate: string;
  endDate: string;
  venue: string;
  venueAddress?: string;
  quota: number;
  feeAmount: number;
  registrationDeadline?: string | null;
  status: CourseStatus;
  hasDigitalCertificate?: boolean;
  certificateTemplateId?: string | null;
  certificateTemplateUrl?: string | null;
  certificateRequiresApproval?: boolean;
  createdByRole?: string;
  createdBy?: string;
  createdAt: string;
  registeredCount?: number;
}

export type RegistrationStatus = 'registered' | 'cancelled' | 'attended' | 'absent' | 'passed' | 'failed';
export type PaymentStatus = 'unpaid' | 'paid' | 'waived';

export interface CourseRegistration {
  id: string;
  courseId: string;
  leaderId: string;
  status: RegistrationStatus;
  paymentStatus: PaymentStatus;
  paymentProofUrl?: string | null;
  resultGrade?: string | null;
  resultNotes?: string | null;
  certificateUrl?: string | null;
  certificateGeneratedAt?: string | null;
  certificateStatus?: 'pending' | 'approved' | 'rejected' | 'released';
  certificateApprovedBy?: string | null;
  certificateApprovedAt?: string | null;
  certificateRejectReason?: string | null;
  adminNotes?: string | null;
  registeredAt: string;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  // Joined fields
  course?: Course;
  leader?: LeaderAccount;
}

export interface CourseDocument {
  id: string;
  registrationId: string;
  documentType: 'ic' | 'sijil' | 'lain';
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  uploadedAt: string;
}

export interface CourseAttendance {
  id: string;
  courseId: string;
  leaderId: string;
  registrationId?: string | null;
  checkInAt: string;
  checkOutAt?: string | null;
  method: 'qr' | 'manual';
  verifiedBy?: string;
  notes?: string;
}
