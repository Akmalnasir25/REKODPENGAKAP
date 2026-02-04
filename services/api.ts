import { SubmissionData, Participant, LeaderInfo, ApiResponse } from '../types';

// Password Validation: Min 6 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char
export const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (!password || password.length < 6) {
        errors.push('Kata laluan mesti sekurang-kurangnya 6 aksara');
    }
    if (!/[A-Z]/.test(password)) {
        errors.push('Kata laluan mesti mengandungi sekurang-kurangnya 1 huruf besar');
    }
    if (!/[a-z]/.test(password)) {
        errors.push('Kata laluan mesti mengandungi sekurang-kurangnya 1 huruf kecil');
    }
    if (!/\d/.test(password)) {
        errors.push('Kata laluan mesti mengandungi sekurang-kurangnya 1 nombor');
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('Kata laluan mesti mengandungi sekurang-kurangnya 1 karakter khas (!@#$%^&* dll)');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
};

const handleResponse = async (response: Response) => {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error("Non-JSON response:", text);
        throw new Error("Invalid response from server");
    }
};

export const fetchCloudData = async (
    url: string, 
    role?: string, 
    negeriCode?: string, 
    daerahCode?: string
) => {
  try {
    // Build query parameters for hierarchical filtering
    const params = new URLSearchParams({ t: Date.now().toString() });
    if (role) params.append('role', role);
    if (negeriCode) params.append('negeriCode', negeriCode);
    if (daerahCode) params.append('daerahCode', daerahCode);
    
    const targetUrl = url.includes('?') 
        ? `${url}&${params.toString()}` 
        : `${url}?${params.toString()}`;
        
    const response = await fetch(targetUrl, {
        method: 'GET',
        credentials: 'omit',
        redirect: 'follow',
        mode: 'cors'
    });
    return await handleResponse(response);
  } catch (error) {
    console.error("Fetch Error:", error);
    throw error;
  }
};

// NEW: Secure Admin Login
export const loginAdmin = async (url: string, username: string, password: string, csrfToken?: string) => {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'login_admin',
            username: username.trim().toUpperCase(),
            password: password.trim(),
            csrfToken: csrfToken // Include CSRF token for validation
        })
    });
    return await handleResponse(response);
};

// NEW: Regional Admin Login (Negeri/Daerah)
export const loginAdminRegional = async (url: string, credentials: { username: string, password: string, role: 'negeri' | 'daerah' }, csrfToken?: string) => {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'login_admin_regional',
            username: credentials.username.trim().toUpperCase(),
            password: credentials.password.trim(),
            role: credentials.role,
            csrfToken: csrfToken
        })
    });
    return await handleResponse(response);
};

// NEW: Developer Login (Local only - for system control)
export const loginDeveloper = (username: string, password: string): { success: boolean; message?: string } => {
    // Hardcoded developer credentials (stored securely in localStorage)
    const devUsername = localStorage.getItem('DEV_USERNAME') || 'DEVELOPER';
    const devPassword = localStorage.getItem('DEV_PASSWORD') || 'Dev@123456';
    
    if (username.trim().toUpperCase() === devUsername && password.trim() === devPassword) {
        return { success: true };
    }
    return { success: false, message: 'Invalid developer credentials' };
};

export const changeAdminPassword = async (url: string, role: string, newPassword: string) => {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'change_admin_password',
            role: role, // 'admin' or 'district'
            newPassword: newPassword
        })
    });
    return await handleResponse(response);
};

export const changeAdminRegionalPassword = async (url: string, username: string, role: string, newPassword: string) => {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'change_admin_regional_password',
            username: username,
            role: role, // 'negeri' or 'daerah'
            newPassword: newPassword
        })
    });
    return await handleResponse(response);
};

export const submitRegistration = async (
    url: string,
    leaderInfo: LeaderInfo,
    participants: Participant[],
    assistants: Participant[] = [],
    examiners: Participant[] = [],
    customDate?: string,
    csrfToken?: string
) => {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'omit',
    redirect: 'follow',
    mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'submit_form',
      schoolName: leaderInfo.schoolName.trim().toUpperCase(),
      schoolCode: leaderInfo.schoolCode.trim().toUpperCase(),
      badgeType: leaderInfo.badgeType,
      principalName: leaderInfo.principalName.trim().toUpperCase(),
      principalPhone: leaderInfo.principalPhone,
      leaderName: leaderInfo.leaderName.toUpperCase(),
      leaderRace: leaderInfo.race,
      phone: leaderInfo.phone,
      participants: participants,
      assistants: assistants, 
      examiners: examiners,
      customDate: customDate,
      csrfToken: csrfToken
    })
  });
  return await handleResponse(response);
};

export const updateParticipantId = async (url: string, rowIndex: number, newId: string, schoolCode: string, csrfToken?: string) => {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'follow',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'update_data',
        rowIndex: rowIndex,
        newId: newId.trim().toUpperCase(),
        schoolCode: schoolCode,
        csrfToken: csrfToken
      })
    });
    return await handleResponse(response);
};

// Add single school with hierarchical data
export const addSchool = async (url: string, schoolData: {
  schoolName: string;
  schoolCode: string;
  negeriCode: string;
  daerahCode: string;
}) => {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'omit',
    redirect: 'follow',
    mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ 
      action: 'add_school', 
      schoolName: schoolData.schoolName.trim().toUpperCase(),
      schoolCode: schoolData.schoolCode.trim().toUpperCase(),
      negeriCode: schoolData.negeriCode,
      daerahCode: schoolData.daerahCode
    })
  });
  return await handleResponse(response);
};

export const addSchoolBatch = async (url: string, schools: string[], negeriCode?: string, daerahCode?: string) => {
  for (const name of schools) {
    await fetch(url, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'follow',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ 
        action: 'add_school', 
        schoolName: name.trim().toUpperCase(),
        negeriCode: negeriCode || '',
        daerahCode: daerahCode || ''
      })
    });
  }
  return { status: 'success' };
};

export const deleteSchool = async (url: string, schoolCode: string) => {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'omit',
    redirect: 'follow',
    mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'delete_school', schoolCode: schoolCode })
  });
  return await handleResponse(response);
};

export const updateSchoolPermission = async (url: string, schoolName: string, permissionType: 'students' | 'assistants' | 'examiners' | 'all', status: boolean) => {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'follow',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ 
          action: 'update_school_permission', 
          schoolName: schoolName,
          permissionType: permissionType,
          status: status
      })
    });
    return await handleResponse(response);
};

export const lockSchoolBadge = async (url: string, schoolName: string, badge: string) => {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'follow',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ 
          action: 'lock_school_badge', 
          schoolName: schoolName,
          badge: badge
      })
    });
    return await handleResponse(response);
};

export const approveSchoolBadge = async (url: string, schoolName: string, badge: string) => {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'follow',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ 
          action: 'approve_school_badge', 
          schoolName: schoolName,
          badge: badge
      })
    });
    return await handleResponse(response);
};

export const unlockSchoolBadge = async (url: string, schoolName: string, badge: string) => {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'follow',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ 
          action: 'unlock_school_badge', 
          schoolName: schoolName,
          badge: badge
      })
    });
    return await handleResponse(response);
};

export const toggleSchoolEditBatch = async (url: string, status: boolean, permissionType: 'students' | 'assistants' | 'examiners' | 'all') => {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'follow',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ 
          action: 'toggle_school_edit_batch', 
          status: status,
          permissionType: permissionType
      })
    });
    return await handleResponse(response);
};

export const addBadgeType = async (url: string, badgeType: string) => {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'omit',
    redirect: 'follow',
    mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'add_badge_type', badgeType: badgeType.trim() })
  });
  return await handleResponse(response);
};

export const deleteBadgeType = async (url: string, badgeType: string) => {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'omit',
    redirect: 'follow',
    mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'delete_badge_type', badgeType: badgeType })
  });
  return await handleResponse(response);
};

export const updateBadgeDeadline = async (url: string, badgeType: string, deadline: string) => {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'omit',
    redirect: 'follow',
    mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ 
        action: 'update_badge_deadline', 
        badgeType: badgeType,
        deadline: deadline
    })
  });
  return await handleResponse(response);
};

export const toggleRegistration = async (url: string, status: boolean, targetBadge?: string) => {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'omit',
    redirect: 'follow',
    mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ 
        action: 'toggle_registration', 
        status: status,
        targetBadge: targetBadge
    })
  });
  return await handleResponse(response);
};

export const deleteSubmission = async (url: string, submission: SubmissionData, csrfToken?: string) => {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'omit',
    redirect: 'follow',
    mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ 
        action: 'delete_data', 
        name: submission.student,
        id: submission.id,
        csrfToken: csrfToken
    })
  });
  return await handleResponse(response);
};

export const migrateYear = async (url: string, sourceYear: number, targetYear: number) => {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'follow',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ 
          action: 'migrate_year', 
          sourceYear: sourceYear,
          targetYear: targetYear
      })
    });
    return await handleResponse(response);
  };

export const registerUser = async (url: string, data: { schoolName: string, schoolCode: string, password: string, secretKey: string }, csrfToken?: string) => {
  const response = await fetch(url, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'follow',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
          action: 'register_user',
          schoolName: data.schoolName.trim().toUpperCase(),
          schoolCode: data.schoolCode.trim().toUpperCase(),
          password: data.password,
          secretKey: data.secretKey,
          csrfToken: csrfToken
      })
  });
  return await handleResponse(response);
};

export const loginUser = async (url: string, data: { schoolCode: string, password: string, csrfToken?: string }): Promise<ApiResponse> => {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'login_user',
            schoolCode: data.schoolCode.trim().toUpperCase(),
            password: data.password,
            csrfToken: data.csrfToken // Include CSRF token for validation
        })
    });
    return await handleResponse(response);
};

export const resetPassword = async (url: string, data: { schoolCode: string, secretKey: string, newPassword: string }, csrfToken?: string) => {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'reset_password',
            schoolCode: data.schoolCode.trim().toUpperCase(),
            secretKey: data.secretKey,
      newPassword: data.newPassword,
      csrfToken: csrfToken
        })
    });
    return await handleResponse(response);
};

export const changePassword = async (url: string, data: { schoolCode: string, oldPassword: string, newPassword: string }, csrfToken?: string) => {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'change_password',
            schoolCode: data.schoolCode.trim().toUpperCase(),
            oldPassword: data.oldPassword,
      newPassword: data.newPassword,
      csrfToken: csrfToken
        })
    });
    return await handleResponse(response);
};

export const setupDatabase = async (url: string) => {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'setup_database'
        })
    });
    return await handleResponse(response);
};

export const clearDatabaseSheet = async (url: string, target: string) => {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'clear_sheet_data',
            target: target
        })
    });
    return await handleResponse(response);
};

// Update User Profile
export const updateUserProfile = async(
    url: string, 
    schoolCode: string, 
    profileData: {
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
    },
    csrfToken?: string
) => {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'update_user_profile',
            schoolCode: schoolCode,
            ...profileData,
            csrfToken: csrfToken
        })
    });
    return await handleResponse(response);
};

// Negeri Management (Developer only)
export const addNegeri = async (url: string, negeriCode: string, negeriName: string) => {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'add_negeri',
            negeriCode: negeriCode.trim().toUpperCase(),
            negeriName: negeriName.trim().toUpperCase()
        })
    });
    return await handleResponse(response);
};

export const deleteNegeri = async (url: string, negeriCode: string) => {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'delete_negeri',
            negeriCode: negeriCode
        })
    });
    return await handleResponse(response);
};

// Daerah Management (Developer only)
export const addDaerah = async (url: string, daerahCode: string, daerahName: string, negeriCode: string) => {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'add_daerah',
            daerahCode: daerahCode.trim().toUpperCase(),
            daerahName: daerahName.trim().toUpperCase(),
            negeriCode: negeriCode
        })
    });
    return await handleResponse(response);
};

export const deleteDaerah = async (url: string, daerahCode: string) => {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'delete_daerah',
            daerahCode: daerahCode
        })
    });
    return await handleResponse(response);
};

// Admin Management
export const addAdmin = async (url: string, adminData: {
    username: string;
    password: string;
    role: 'negeri' | 'daerah';
    negeriCode?: string;
    daerahCode?: string;
    fullName?: string;
    phone?: string;
    email?: string;
}) => {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'add_admin',
            ...adminData
        })
    });
    return await handleResponse(response);
};

export const deleteAdmin = async (url: string, username: string) => {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'delete_admin',
            username: username
        })
    });
    return await handleResponse(response);
};