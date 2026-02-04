

export interface Participant {
  id: number;
  name: string;
  gender: string;
  race: string;
  membershipId: string;
  icNumber: string;
  phoneNumber: string; 
  remarks: string;
}

export interface LeaderInfo {
  schoolName: string;
  schoolCode: string;
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
  icNumber?: string;
  studentPhone?: string; 
  role?: string;
  remarks: string;
}

export interface Badge {
  name: string;
  isOpen: boolean;
  deadline?: string; 
}

export interface School {
  name: string;
  schoolCode?: string;
  negeriCode?: string;
  daerahCode?: string;
  // Granular Permissions
  allowStudents: boolean;
  allowAssistants: boolean;
  allowExaminers: boolean;
  allowEdit?: boolean; // Deprecated, kept for legacy compatibility check
  
  lockedBadges?: string[]; 
  approvedBadges?: string[]; 
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
}

export interface UserSession {
  schoolName: string;
  schoolCode: string;
  isLoggedIn: boolean;
  groupNumber?: string;
}

export enum BadgeType {
  KERIS_GANGSA = 'Keris Gangsa',
  KERIS_PERAK = 'Keris Perak',
  KERIS_EMAS = 'Keris Emas'
}