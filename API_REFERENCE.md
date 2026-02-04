# 📡 API & INTEGRATION GUIDE

**Complete API Reference untuk Pengakap Pengurusan Data**  
**Version:** v12.5  
**Last Updated:** 6 December 2025

---

## 🎯 QUICK REFERENCE

| Endpoint | Method | Auth Required | Purpose |
|----------|--------|---------------|---------|
| `?action=login_user` | POST | No | User school login |
| `?action=login_admin` | POST | No | Admin login |
| `?action=register_user` | POST | No | New school registration |
| `?action=get_csrf` | GET | No | Get CSRF token |
| `?action=submit_form` | POST | Yes | Register participants |
| `?action=update_data` | POST | Yes | Update membership ID |
| `?action=delete_data` | POST | Yes | Delete record |
| `GET /exec` | GET | No | Fetch all data |

---

## 🔌 ENDPOINT DETAILS

### 1. Authentication Endpoints

#### User Login
```
POST /exec
Content-Type: application/json

Request:
{
  "action": "login_user",
  "schoolCode": "SK001",
  "password": "MyPassword@123",
  "csrfToken": "abc123_xyz789"
}

Response (Success):
{
  "status": "success",
  "user": {
    "schoolName": "SK Jalan Sultan",
    "schoolCode": "SK001",
    "isLoggedIn": true,
    "groupNumber": "001"
  }
}

Response (Failure):
{
  "status": "error",
  "message": "Salah info."
}

Rate Limit:
  - Max 5 attempts per 15 minutes
  - Lockout: 15 minutes after 5 failed attempts
  - Response on lockout:
    {
      "status": "error",
      "message": "Too many attempts",
      "waitSeconds": 540
    }

Status Codes:
  200 - Success or expected error
  429 - Rate limited (handled in body)
  500 - Server error
```

#### Admin Login
```
POST /exec
Content-Type: application/json

Request:
{
  "action": "login_admin",
  "username": "ADMIN",              // ADMIN or DAERAH
  "password": "AdminPassword@123",
  "csrfToken": "abc123_xyz789"
}

Response (Success):
{
  "status": "success",
  "role": "admin"                   // admin or district
}

Response (Failure):
{
  "status": "error",
  "message": "Log masuk gagal. Semak Nama Pengguna & Kata Laluan."
}
```

#### Register New School
```
POST /exec
Content-Type: application/json

Request:
{
  "action": "register_user",
  "schoolCode": "SK002",            // Generated if not provided
  "email": "admin@school.my",
  "password": "NewPassword@123"
}

Response (Success):
{
  "status": "success",
  "message": "Sekolah berjaya didaftar",
  "schoolCode": "SK002"
}

Response (Failure):
{
  "status": "error",
  "message": "Sekolah sudah didaftar."
}
```

#### Reset Password
```
POST /exec
Content-Type: application/json

Request:
{
  "action": "reset_password",
  "schoolCode": "SK001",
  "secretKey": "answer_to_secret_question",
  "newPassword": "NewPassword@123",
  "csrfToken": "abc123_xyz789"
}

Response (Success):
{
  "status": "success",
  "message": "Kata laluan berjaya ditukar"
}

Response (Failure):
{
  "status": "error",
  "message": "Kunci rahsia salah"
}
```

#### Get CSRF Token
```
GET /exec?action=get_csrf&t=1733571600000

Response (Success):
{
  "status": "success",
  "csrfToken": "3f8c9e2a1b5d7c4a_f3a8e2c9d1b6e4a7"
}

Token Properties:
  - TTL: 3600 seconds (1 hour)
  - One-time use: Yes (deleted after validation)
  - Format: {uuid_part}_{random_part}
  - Storage: Script Properties
```

---

### 2. Data Management Endpoints

#### Submit Registration
```
POST /exec
Content-Type: application/json

Request:
{
  "action": "submit_form",
  "schoolName": "SK JALAN SULTAN",
  "schoolCode": "SK001",
  "groupNumber": "001",
  "badgeType": "Keris Gangsa",
  "principalName": "YM TUAN AHMAD BIN HAJI HASSAN",
  "principalPhone": "0123456789",
  "leaderName": "CIKGU BUDI",
  "leaderRace": "Melayu",
  "phone": "0198765432",
  "participants": [
    {
      "name": "ALI BIN HASAN",
      "gender": "Lelaki",
      "race": "Melayu",
      "membershipId": "P001234",
      "icNumber": "990101-02-1234",
      "phoneNumber": "0165432109",
      "remarks": "Bulan ke-3"
    }
  ],
  "assistants": [],
  "examiners": [],
  "customDate": "2025-12-06",
  "csrfToken": "abc123_xyz789"
}

Response (Success):
{
  "status": "success",
  "message": "Data berjaya disimpan",
  "rowIndices": [25, 26]
}

Response (Failure):
{
  "status": "error",
  "message": "PESERTA sudah didaftar dalam tahun 2025"
}

Validation:
  - schoolCode must match SCHOOLS sheet
  - badgeType must be in BADGES sheet and isOpen=true
  - At least 1 participant required
  - All required fields cannot be empty
  - IC number must not exist for same school in same year

Duplicate Detection:
  - Check: icNumber + schoolCode + year + badgeType
  - If match found: Return error
  - If different badgeType: Allow (upgrade scenario)
```

#### Update Participant ID
```
POST /exec
Content-Type: application/json

Request:
{
  "action": "update_data",
  "rowIndex": 25,
  "newId": "P001235",
  "schoolCode": "SK001",
  "csrfToken": "abc123_xyz789"
}

Response (Success):
{
  "status": "success",
  "message": "Data berjaya dikemas kini"
}

Response (Failure):
{
  "status": "error",
  "message": "Rekod tidak ditemui"
}

Security:
  - schoolCode must match current user's school
  - Cannot update other school's records
  - Row must exist in DATA sheet
```

#### Delete Record
```
POST /exec
Content-Type: application/json

Request:
{
  "action": "delete_data",
  "rowIndex": 25,
  "schoolCode": "SK001",
  "csrfToken": "abc123_xyz789"
}

Response (Success):
{
  "status": "success",
  "message": "Rekod berjaya dipadamkan"
}

Response (Failure):
{
  "status": "error",
  "message": "Tidak dapat memadam rekod"
}

Note:
  - Soft delete (mark as deleted, not physically removed)
  - Can be recovered by admin if needed
```

#### Fetch All Data
```
GET /exec?t=1733571600000

Response (Success):
{
  "status": "success",
  "schools": [
    {
      "name": "SK JALAN SULTAN",
      "allowStudents": true,
      "allowAssistants": false,
      "allowExaminers": false,
      "lockedBadges": [],
      "approvedBadges": ["Keris Gangsa"]
    }
  ],
  "badges": [
    {
      "name": "Keris Gangsa",
      "isOpen": true,
      "deadline": "2025-12-31"
    }
  ],
  "submissions": [
    {
      "rowIndex": 25,
      "date": "2025-12-06",
      "school": "SK JALAN SULTAN",
      "badge": "Keris Gangsa",
      "student": "ALI BIN HASAN",
      "id": "P001234",
      "role": "PESERTA"
    }
  ],
  "isRegistrationOpen": true
}

Note:
  - Cache-busted with timestamp (t parameter)
  - No authentication required (public data)
  - Contains: Schools, Badges, all Submissions
  - Sorted by date descending
```

---

### 3. School Management (Admin Only)

#### Add School
```
POST /exec
Content-Type: application/json

Request:
{
  "action": "add_school",
  "schoolName": "SK BARU JAYA",
  "csrfToken": "abc123_xyz789"
}

Response (Success):
{
  "status": "success",
  "message": "Sekolah berjaya ditambah"
}

Response (Failure):
{
  "status": "error",
  "message": "Sekolah sudah wujud"
}
```

#### Delete School
```
POST /exec
Content-Type: application/json

Request:
{
  "action": "delete_school",
  "schoolName": "SK BARU JAYA",
  "csrfToken": "abc123_xyz789"
}

Response (Success):
{
  "status": "success",
  "message": "Sekolah berjaya dipadamkan"
}

Warning:
  - Deletes all associated records
  - Cannot be undone easily
  - Admin should export backup first
```

#### Update School Permission
```
POST /exec
Content-Type: application/json

Request:
{
  "action": "update_school_permission",
  "schoolName": "SK JALAN SULTAN",
  "permissionType": "students",    // students | assistants | examiners | all
  "status": true,
  "csrfToken": "abc123_xyz789"
}

Response (Success):
{
  "status": "success",
  "message": "Kebenaran berjaya dikemas kini"
}

Permission Types:
  - "students" → allowStudents = status
  - "assistants" → allowAssistants = status
  - "examiners" → allowExaminers = status
  - "all" → All three = status
```

---

### 4. Badge Management (Admin Only)

#### Add Badge Type
```
POST /exec
Content-Type: application/json

Request:
{
  "action": "add_badge_type",
  "badgeName": "Lencana Baru",
  "csrfToken": "abc123_xyz789"
}

Response (Success):
{
  "status": "success",
  "message": "Lencana berjaya ditambah"
}
```

#### Delete Badge Type
```
POST /exec
Content-Type: application/json

Request:
{
  "action": "delete_badge_type",
  "badgeName": "Lencana Lama",
  "csrfToken": "abc123_xyz789"
}

Response (Success):
{
  "status": "success",
  "message": "Lencana berjaya dipadamkan"
}
```

#### Update Badge Deadline
```
POST /exec
Content-Type: application/json

Request:
{
  "action": "update_badge_deadline",
  "badgeName": "Keris Gangsa",
  "deadline": "2025-12-31",
  "csrfToken": "abc123_xyz789"
}

Response (Success):
{
  "status": "success",
  "message": "Tarikh akhir berjaya dikemas kini"
}

Deadline Notification:
  - Frontend checks: If within 3 days → Show alert
  - Alert message: "Tutup dalam X hari!"
  - Auto-close on deadline date
```

#### Toggle Registration Status
```
POST /exec
Content-Type: application/json

Request:
{
  "action": "toggle_registration",
  "status": false,                  // true = open, false = closed
  "csrfToken": "abc123_xyz789"
}

Response (Success):
{
  "status": "success",
  "message": "Status pendaftaran berjaya ditukar"
}

Effect:
  - status=false → All registration forms disabled
  - isRegistrationOpen=false in data fetch
  - UserForm shows "Pendaftaran Ditutup" message
  - Only admins can still access
```

---

### 5. Database Maintenance (Admin Only)

#### Setup Database
```
POST /exec
Content-Type: application/json

Request:
{
  "action": "setup_database"
}

Response (Success):
{
  "status": "success",
  "message": "Struktur database berjaya dijana"
}

Creates:
  - DATA sheet (submissions)
  - SCHOOLS sheet
  - BADGES sheet
  - USERS sheet (system use)

Headers:
  - DATA: Date | School | Badge | Principal | Leader | Student | ...
  - SCHOOLS: SchoolName | Code | AllowStudents | ...
  - BADGES: BadgeName | IsOpen | Deadline
  - USERS: SchoolCode | Password | Salt | ...
```

#### Clear Sheet Data
```
POST /exec
Content-Type: application/json

Request:
{
  "action": "clear_sheet_data",
  "target": "DATA",                 // DATA | SCHOOLS | BADGES
  "csrfToken": "abc123_xyz789"
}

Response (Success):
{
  "status": "success",
  "message": "Data berjaya dikosongkan"
}

Warning:
  - IRREVERSIBLE operation
  - Should export backup first
  - Only headers remain
  - Frontend will require confirmation + "PADAM" code
```

---

## 🔐 SECURITY & AUTHENTICATION

### CSRF Token Handling

**Obtaining Token:**
```
GET /exec?action=get_csrf&t=1733571600000

Must be done:
  - Before each sensitive operation
  - Fresh token for each request
  - Cannot reuse tokens across sessions
```

**Using Token:**
```
Include in POST body:
{
  "action": "submit_form",
  "csrfToken": "token_here",
  ...
}

Backend validates:
  1. Token exists in Script Properties
  2. Token not expired (3600 sec)
  3. Token matches exactly (case-sensitive)
  4. Token deleted after validation (one-time use)
```

### Rate Limiting

**Per-User Rate Limit:**
```
Trigger: 5 failed login attempts
Lockout Duration: 15 minutes
Window: From first attempt

Example:
  15:00 - Attempt 1 (fail)
  15:02 - Attempt 2 (fail)
  15:04 - Attempt 3 (fail)
  15:06 - Attempt 4 (fail)
  15:08 - Attempt 5 (fail) → LOCKED
  15:09 - Response: "Wait 11 minutes"
  15:23 - Lockout expires, can retry

Key: 'rl_admin_SK001'
Value: {count: 5, firstAttempt: 1733571600000, lockedUntil: 1733572500000}
```

### Password Requirements

```
Validation Rules:
  ✓ Minimum 6 characters
  ✓ At least 1 UPPERCASE letter (A-Z)
  ✓ At least 1 lowercase letter (a-z)
  ✓ At least 1 digit (0-9)
  ✓ At least 1 special character (!@#$%^&* etc)

Examples:
  ✅ Valid: MyPass@123, SecureP@ss1, School@2025
  ❌ Invalid: password (no upper, no digit, no special)
  ❌ Invalid: Pass@1 (too short)
  ❌ Invalid: PASS@123 (no lowercase)
```

### Data Validation

```typescript
// Frontend validation (before submit)
const validate = (data) => {
  if (!data.name) throw "Name required";
  if (!data.icNumber) throw "IC required";
  if (!/^\d{6}-\d{2}-\d{4}$/.test(data.icNumber)) {
    throw "IC format invalid (YYMMDD-GG-BBBB)";
  }
  if (!/^01\d{8,9}$/.test(data.phone)) {
    throw "Phone format invalid";
  }
};

// Backend validation (security)
function validateInput(params) {
  if (!params.schoolCode || !/^[A-Z0-9]{2,20}$/.test(params.schoolCode)) {
    return {ok: false, message: "Invalid school code"};
  }
  // ... more validation
}
```

---

## 📊 DATA STRUCTURES

### User Session
```typescript
interface UserSession {
  schoolName: string;               // "SK JALAN SULTAN"
  schoolCode: string;               // "SK001"
  isLoggedIn: boolean;              // true
  groupNumber?: string;             // "001"
}

// Stored in: localStorage['USER_SESSION_DATA']
// Expires: 30 minutes of inactivity
// Persisted across: Page refreshes (during session)
```

### Participant Record
```typescript
interface Participant {
  id: number;                       // Client-side: Date.now()
  name: string;                     // "ALI BIN HASAN"
  gender: string;                   // "Lelaki" | "Perempuan"
  race: string;                     // "Melayu" | "Cina" | "India" | "Lain"
  membershipId: string;             // "P001234" (keahlian)
  icNumber: string;                 // "990101-02-1234"
  phoneNumber: string;              // "0165432109"
  remarks: string;                  // "Bulan ke-3" | "Import 2024"
}
```

### Submission Data (Database)
```typescript
interface SubmissionData {
  rowIndex: number;                 // Row in DATA sheet (1-indexed)
  date: string;                     // "2025-12-06" (ISO 8601)
  school: string;                   // "SK JALAN SULTAN"
  schoolCode?: string;              // "SK001"
  groupNumber?: string;             // "001"
  badge: string;                    // "Keris Gangsa"
  principalName?: string;           // "YM TUAN AHMAD"
  principalPhone?: string;          // "0123456789"
  leader: string;                   // "CIKGU BUDI"
  leaderPhone?: string;             // "0198765432"
  leaderRace?: string;              // "Melayu"
  student: string;                  // "ALI BIN HASAN"
  gender: string;                   // "Lelaki"
  race?: string;                    // "Melayu"
  id: string;                       // "P001234" (membership ID)
  icNumber?: string;                // "990101-02-1234"
  studentPhone?: string;            // "0165432109"
  role?: string;                    // "PESERTA" | "PENOLONG" | "PENGUJI"
  remarks: string;                  // "Bulan ke-3"
}
```

### Badge Configuration
```typescript
interface Badge {
  name: string;                     // "Keris Gangsa"
  isOpen: boolean;                  // true | false
  deadline?: string;                // "2025-12-31" (ISO 8601)
}
```

### School Configuration
```typescript
interface School {
  name: string;                     // "SK JALAN SULTAN"
  allowStudents: boolean;           // Can register participants
  allowAssistants: boolean;         // Can register assistants
  allowExaminers: boolean;          // Can register examiners
  allowEdit?: boolean;              // Deprecated (kept for legacy)
  lockedBadges?: string[];          // ["Keris Emas"] - Locked
  approvedBadges?: string[];        // ["Keris Gangsa", "Keris Perak"]
}
```

---

## 🔧 ERROR HANDLING

### HTTP Status Codes
```
200 OK
  - Request successful, check response.status field

400 Bad Request
  - Invalid parameters
  - Missing required fields
  
401 Unauthorized
  - Invalid CSRF token
  - Session expired

403 Forbidden
  - Permission denied
  - Not authorized to access resource

429 Too Many Requests
  - Rate limit exceeded
  - Wait before retrying

500 Internal Server Error
  - Server error
  - Check logs for details
```

### Error Response Format
```json
{
  "status": "error",
  "message": "Human-readable error message",
  "code": "ERROR_CODE" (optional),
  "details": {} (optional)
}
```

### Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "Invalid or expired CSRF token" | Token expired or invalid | Get new CSRF token |
| "Too many attempts" | Rate limited | Wait 15 minutes or use forgot password |
| "Salah info." | Wrong credentials | Check school code & password |
| "PESERTA sudah didaftar" | Duplicate registration | Delete previous record or use import |
| "Sekolah sudah wujud" | School already exists | Use different school name |
| "Pendaftaran ditutup" | Registration closed by admin | Contact admin to reopen |

---

## 📝 USAGE EXAMPLES

### Example 1: Complete Login Flow
```javascript
// Step 1: Get CSRF token
const csrfResponse = await fetch(
  'https://script.google.com/.../exec?action=get_csrf&t=' + Date.now()
);
const {csrfToken} = await csrfResponse.json();

// Step 2: Login with credentials
const loginResponse = await fetch(
  'https://script.google.com/.../exec',
  {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      action: 'login_user',
      schoolCode: 'SK001',
      password: 'MyPass@123',
      csrfToken: csrfToken
    })
  }
);

const result = await loginResponse.json();
if (result.status === 'success') {
  localStorage.setItem('USER_SESSION', JSON.stringify(result.user));
  // Redirect to dashboard
} else {
  alert(result.message);
}
```

### Example 2: Submit Registration
```javascript
// Get fresh CSRF token
const csrf = await fetchCSRF();

// Prepare data
const registration = {
  action: 'submit_form',
  schoolName: 'SK JALAN SULTAN',
  schoolCode: 'SK001',
  badgeType: 'Keris Gangsa',
  principalName: 'AHMAD HASSAN',
  principalPhone: '0123456789',
  leaderName: 'BUDI SANTOSO',
  phone: '0198765432',
  participants: [
    {
      name: 'ALI HASAN',
      gender: 'Lelaki',
      race: 'Melayu',
      membershipId: 'P001234',
      icNumber: '990101-02-1234',
      phoneNumber: '0165432109',
      remarks: 'Bulan 3'
    }
  ],
  csrfToken: csrf
};

// Submit
const response = await fetch(backendUrl, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify(registration)
});

const result = await response.json();
if (result.status === 'success') {
  alert('Berjaya! Peserta baru ditambah.');
  refreshDashboard();
} else {
  alert('Error: ' + result.message);
}
```

### Example 3: Data Import from Previous Year
```javascript
// Get candidates dari last year yang lulusan Keris Gangsa
const lastYearData = allData.filter(d => 
  d.year === 2024 && 
  d.badge === 'Keris Gangsa' && 
  d.schoolCode === 'SK001'
);

// Prepare upgrade records
const newRecords = lastYearData.map(d => ({
  name: d.student,
  gender: d.gender,
  race: d.race,
  icNumber: d.icNumber,
  remarks: `[UPGRADE DARI ${d.badge}]`
}));

// Submit as Keris Perak batch
for (const record of newRecords) {
  await submitRegistration({
    badge: 'Keris Perak',
    participants: [record],
    ...
  });
}
```

---

## 🚦 RATE LIMITING DETAILS

### Rate Limit Configuration
```javascript
// Backend (Google Apps Script)
RATE_LIMIT_WINDOW_SECONDS = 900         // 15 minutes
RATE_LIMIT_MAX_ATTEMPTS = 5             // 5 failed attempts
LOCKOUT_DURATION = 900 seconds          // 15 minutes
```

### Rate Limit Tracking
```
Key Format: 'rl_' + identifier
  identifier = 'admin_' + username (for admin login)
  identifier = schoolCode (for user login)

Value Format:
{
  count: 5,                             // Failed attempts
  firstAttempt: 1733571600000,         // Timestamp
  lockedUntil: 1733572500000           // Unlock time
}
```

### Rate Limit Logic
```
1. User attempt login
2. Check rate limit key
3. If locked: Wait until lockedUntil
4. If window expired: Reset count
5. If count >= MAX: Lock until lockedUntil
6. If attempt fails: count++
7. If attempt succeeds: Delete key (reset)
```

---

## 🔄 WEBHOOKS & CALLBACKS

### Future Webhook Support
```
(Not yet implemented, but planned for v13.0)

Webhook Events:
  - registration.created
  - registration.updated
  - registration.deleted
  - badge.deadline_approaching
  - user.login
  - password.reset

Example Configuration:
{
  "webhooks": {
    "registration.created": "https://myapp.com/webhooks/reg-created",
    "badge.deadline_approaching": "https://myapp.com/webhooks/deadline"
  }
}
```

---

## 📚 RELATED DOCUMENTATION

- **[DOKUMENTASI_LENGKAP.md](./DOKUMENTASI_LENGKAP.md)** - User guide & system overview
- **[DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)** - Technical deep dive
- **[README.md](./README.md)** - Setup & deployment
- **[SECURITY_IMPLEMENTATION.md](./SECURITY_IMPLEMENTATION.md)** - Security details

---

## 🆘 SUPPORT

**API Issues?**
1. Check response.status field first
2. Verify CSRF token validity
3. Check rate limit status
4. Review error message carefully
5. Contact admin for debugging

**Integration Help?**
- Email: dev@pengakap.my
- Discord: [Community Server]
- GitHub Issues: [Issues Page]

---

**API Version:** v12.5  
**Last Updated:** 6 December 2025  
**Status:** ✅ Production Ready

