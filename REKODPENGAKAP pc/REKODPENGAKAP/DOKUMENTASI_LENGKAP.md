# 📋 DOKUMENTASI LENGKAP - SISTEM PENGURUSAN DATA PENGAKAP

**Versi**: v12.5 (Import Fix)  
**Tanggal**: Disusun 6 Disember 2025  
**Status**: ✅ PRODUCTION-READY & STABLE

---

## 📑 DAFTAR ISI
1. [Gambaran Umum Sistem](#gambaran-umum-sistem)
2. [Arkitektur Sistem](#arkitektur-sistem)
3. [Aliran Data](#aliran-data)
4. [Komponen Frontend](#komponen-frontend)
5. [Layanan Backend (Google Apps Script)](#layanan-backend-google-apps-script)
6. [Keamanan & Authentication](#keamanan--authentication)
7. [Database & Data Structure](#database--data-structure)
8. [Fitur Utama](#fitur-utama)
9. [User Roles & Permissions](#user-roles--permissions)
10. [Error Handling & Recovery](#error-handling--recovery)
11. [Deployment & Configuration](#deployment--configuration)

---

## 🎯 GAMBARAN UMUM SISTEM

### Tujuan
Sistem **Pengurusan Data Pengakap** adalah aplikasi web yang dirancang untuk mengelola pendaftaran, data peserta, dan administrasi program lencana (badge) dalam organisasi Pengakap.

### Platform
- **Frontend**: React 19.2.0 + TypeScript 5.8 + Vite 6.2
- **Backend**: Google Apps Script (Google Sheets)
- **Styling**: Tailwind CSS 3
- **Icons**: Lucide React 0.555.0
- **AI Integration**: Google Gemini 2.5 Flash

### Key Features
✅ Multi-role authentication (User, District Admin, Super Admin)  
✅ Pendaftaran peserta dengan validasi data  
✅ Manajemen lencana (badge) dengan deadline  
✅ Import/Export data dari berbagai tahun  
✅ Dashboard statistik real-time  
✅ Rate limiting & brute force protection  
✅ CSRF token validation  
✅ Session timeout dengan activity monitoring  
✅ AI-powered badge information generator  

---

## 🏗️ ARKITEKTUR SISTEM

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (React App)                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              App.tsx (State Management)              │   │
│  └──────────────────────────────────────────────────────┘   │
│           ↓           ↓           ↓           ↓              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐    │
│  │  AuthScreen  │ │ UserDashboard│ │   AdminPanel     │    │
│  └──────────────┘ └──────────────┘ └──────────────────┘    │
│           ↑           ↑           ↑           ↑              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Services Layer (API + Security)             │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │   │
│  │  │   api.ts    │  │ security.ts  │  │geminiSvc.ts│ │   │
│  │  └─────────────┘  └──────────────┘  └────────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                          ↕ (HTTPS/CORS)
┌──────────────────────────────────────────────────────────────┐
│              BACKEND (Google Apps Script)                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │   handleRequest() - Main Request Router             │   │
│  └──────────────────────────────────────────────────────┘   │
│           ↓           ↓           ↓           ↓              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Auth Ops │ │Data Ops  │ │Admin Ops │ │Util Ops  │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│           ↓           ↓           ↓           ↓              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │   Google Sheets (Data Storage)                      │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐      │   │
│  │  │  DATA  │ │SCHOOLS │ │ BADGES │ │ USERS  │      │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘      │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
App
├── AuthScreen
│   ├── Login Mode
│   ├── Register Mode
│   ├── Forgot Password Mode
│   └── Admin Login Mode
├── UserDashboard
│   ├── Stats Panel
│   ├── Data Table
│   ├── Sidebar Navigation
│   ├── Import Modal
│   ├── Rambu Award Modal
│   └── Password Change Modal
├── UserForm
│   ├── Leader Info Form
│   ├── Participants Tab
│   ├── Assistants Tab
│   ├── Examiners Tab
│   └── Badge Info Modal (AI)
├── AdminPanel
│   ├── AdminBadges
│   ├── AdminSchools
│   ├── AdminHistory
│   ├── AdminMigration
│   ├── AdminDashboard
│   └── Settings
└── LoadingSpinner (Utility)
```

---

## 🔄 ALIRAN DATA

### 1. User Login Flow

```
User Input
    ↓
AuthScreen (client-side validation)
    ↓
fetchServerCsrf() → GET CSRF token from backend
    ↓
loginUser() → POST {schoolCode, password, csrfToken}
    ↓
Backend: validateCsrfToken() + checkRateLimit()
    ↓
Backend: Authenticate against USERS sheet
    ↓
Success: Return UserSession object
    ↓
localStorage.setItem(SESSION) → Persist session
    ↓
setView('user_dashboard') → Render dashboard
```

### 2. Data Registration Flow

```
UserForm (collect data)
    ↓
Client validation (duplicate check, etc)
    ↓
fetchServerCsrf() → Get CSRF token
    ↓
submitRegistration() → POST {leaderInfo, participants, csrfToken}
    ↓
Backend: validateCsrfToken() + CSRF validation
    ↓
Backend: Insert rows into DATA sheet
    ↓
Backend: Return success with row indices
    ↓
Frontend: Show success message
    ↓
handleRefreshData() → Re-fetch all data
    ↓
Update UserDashboard with new records
```

### 3. Admin Action Flow

```
Admin Login
    ↓
AdminPanel rendered
    ↓
Action: Add Badge, Delete School, etc
    ↓
Call appropriate API (e.g., addBadgeType())
    ↓
Backend: Execute action on Sheets
    ↓
Return status
    ↓
Frontend: Show feedback
    ↓
refreshData() → Re-sync all data
```

---

## 🎨 KOMPONEN FRONTEND

### App.tsx - Main Container
**Tanggung Jawab:**
- State management untuk seluruh aplikasi
- Session initialization & persistence
- Session timeout monitoring (30 min inactivity)
- View routing (auth, user_dashboard, user_form, admin)
- Error handling & connection state

**State Management:**
```typescript
// Data State
[scriptUrl, setScriptUrl]              // Backend URL config
[schoolsList, setSchoolsList]          // List sekolah
[badges, setBadges]                    // List lencana
[dashboardData, setDashboardData]      // Data pendaftaran
[isRegistrationOpen, setIsRegistrationOpen]
[connectionError, setConnectionError]

// Auth State
[userSession, setUserSession]          // Current user info
[adminRole, setAdminRole]              // 'admin' | 'district'
[isInitializing, setIsInitializing]

// View State
[view, setView]                        // Current screen
```

**Key Functions:**
- `handleFetchData(url)` - Fetch all data from backend
- `handleAdminLogin(username, password)` - Admin authentication
- `handleUserLoginSuccess(user)` - User login callback
- `handleLogout()` - Clear session
- `handleRefreshData()` - Re-fetch data
- `renderContent()` - View renderer

---

### AuthScreen.tsx - Authentication UI
**Modes:**
1. **Login Mode** - User school login
2. **Register Mode** - School self-registration
3. **Forgot Password Mode** - Password reset
4. **Admin Login Mode** - Admin/District login

**Features:**
- Form validation dengan error messages
- Rate limiting client-side (5 attempts → 15 min wait)
- CSRF token handling
- Password strength indicators
- School code autocomplete
- Responsive design (mobile + desktop)

**Functions:**
```typescript
handleSubmit()              // Handle semua mode
validateForm()              // Form validation
checkLoginAttempts()        // Rate limit check
recordLoginAttempt()        // Track attempts
fetchServerCsrf()           // Get CSRF token
loginUser/registerUser/resetPassword() // API calls
```

---

### UserDashboard.tsx - Main User Interface
**Fitur:**
- Stats panel (Total peserta, pemimpin, penguji)
- Data table dengan filter & search
- Year selector (current + historical years)
- Badge filter dropdown
- Import wizard (dari tahun sebelumnya)
- Rambu award submission
- Password change modal
- Membership ID editor
- Data deletion dengan confirm
- Print functionality
- Mobile sidebar navigation

**Subcomponents:**
```typescript
// Stats Display
MyStats: students | leaders | examiners | total

// Data Table
filteredData
  ├── Search by: name, badge, ID, IC, phone
  ├── Filter by: badge, year
  ├── Actions: Edit ID, Delete, Print
  └── Inline editing untuk membership ID

// Import Feature
importSourceBadge    // e.g., "Keris Gangsa"
importSourceYear     // Previous year
importCategory       // PESERTA | PENOLONG | PENGUJI
selectedImportCandidates
executeImport()      // Submit import

// Modals
RambuModal          // Anugerah Rambu submission
ImportModal         // Data import from previous year
PasswordModal       // Change school password
```

**Data Flow:**
```
myData = allData.filter(
  schoolCode === user.schoolCode && 
  year === selectedYear
)

filteredData = myData.filter(
  (badge === selectedBadgeFilter || !selectedBadgeFilter) &&
  (searchQuery matches || !searchQuery)
)
```

---

### UserForm.tsx - Registration Form
**Sections:**
1. **Leader Information**
   - School Name, Code
   - Group Number
   - Principal Name & Phone
   - Leader Name, Race, Phone

2. **Participants Tab**
   - Dynamic participant list (min 1)
   - Fields: Name, Gender, Race, IC, Phone, Remarks
   - Add/Remove buttons

3. **Assistants Tab** (Optional)
   - Same structure as participants

4. **Examiners Tab** (Optional)
   - Same structure as participants

**Features:**
- Form auto-save to localStorage
- Duplicate detection (IC number check)
- Permission-based tab access
- Badge selection dengan AI info button
- Submit validation
- Success confirmation screen

**Permissions:**
```typescript
allowStudents   // Can add participants?
allowAssistants // Can add assistants?
allowExaminers  // Can add examiners?
```

---

### AdminPanel.tsx - Admin Dashboard
**Sub-panels:**
1. **AdminDashboard** - Stats overview
2. **AdminBadges** - Manage badge types & deadlines
3. **AdminSchools** - Manage schools & permissions
4. **AdminHistory** - View submission history
5. **AdminMigration** - Data migration & import
6. **Settings** - URL config, registration toggle

**Key Actions:**
- Setup database (create DATA, SCHOOLS, BADGES sheets)
- Add/Delete badge types
- Set badge deadlines
- Toggle registration status
- Add/Delete schools
- Set granular permissions (students/assistants/examiners)
- Reset/clear data sheets
- Export data (XLSX/JSON)
- Data migration between years

---

## 🔐 LAYANAN BACKEND (Google Apps Script)

### apps_script_secure.gs - Main Backend File

#### Request Handler
```typescript
function handleRequest(e)
  if (action === 'login_admin') → loginAdmin()
  if (action === 'login_user') → loginUser()
  if (action === 'register_user') → registerUser()
  if (action === 'submit_form') → submitForm()
  if (action === 'update_data') → updateParticipantId()
  if (action === 'delete_data') → deleteData()
  if (action === 'get_csrf') → issueCsrfToken()
  if (action === 'get_school_code') → getSchoolCodeByName()
  ... dan 20+ actions lainnya
```

#### Security Features

**1. CSRF Protection**
```
- Token issued per request (issueCsrfToken)
- TTL: 3600 seconds (1 jam)
- Stored in Script Properties
- One-time use (deleted after validation)
- Validated pada setiap sensitive action
```

**2. Rate Limiting**
```
- Per-user rate limit tracking
- Max 5 attempts per 15 minutes
- Lockout duration: 15 minutes
- Stored dalam Script Properties dengan timestamp
```

**3. Password Security**
```
- Algorithm: SHA-256 + Salt
- Salt: 16-char random UUID
- Plaintext migration: Auto-hash on first login
- Password strength requirements:
  * Min 6 chars
  * 1 uppercase, 1 lowercase
  * 1 digit, 1 special character
```

#### Data Operations

**Login User**
```
Input: schoolCode, password
Process:
  1. Check rate limit
  2. Lookup school in USERS sheet
  3. Hash password dengan salt
  4. Compare hashes
  5. Return UserSession or error
```

**Submit Form**
```
Input: leaderInfo, participants, assistants, examiners
Process:
  1. Validate CSRF token
  2. Insert leader info row to DATA sheet
  3. Insert participant rows
  4. Insert assistant rows
  5. Insert examiner rows
  6. Return success with row indices
```

**Update Data**
```
Input: rowIndex, newId, schoolCode
Process:
  1. Find row by rowIndex
  2. Validate schoolCode matches
  3. Update membership ID
  4. Return success
```

#### Sheet Structure

**DATA Sheet**
```
Columns: Date | School | Badge | Principal | Leader | Student | Gender | 
         Race | ID | IC | Phone | Role | Remarks | GroupNumber
```

**SCHOOLS Sheet**
```
Columns: SchoolName | Code | AllowStudents | AllowAssistants | 
         AllowExaminers | LockedBadges | ApprovedBadges
```

**BADGES Sheet**
```
Columns: BadgeName | IsOpen | Deadline
```

**USERS Sheet**
```
Columns: SchoolCode | Password | Salt | Email
```

---

## 🔑 KEAMANAN & AUTHENTICATION

### Authentication Layers

#### Layer 1: Client-Side (Frontend)
```
✓ Form validation
✓ Rate limiting (localStorage)
✓ Session persistence
✓ Activity monitoring
✓ Auto-logout on timeout
```

#### Layer 2: Network (HTTPS/CORS)
```
✓ Secure transport (HTTPS)
✓ CORS headers configured
✓ No credentials sent in cookies
✓ Content-Type: text/plain (CSRF protection)
```

#### Layer 3: Server-Side (Google Apps Script)
```
✓ CSRF token validation (one-time use)
✓ Rate limiting per user
✓ Password hashing (SHA-256+salt)
✓ Input sanitization
✓ Script Lock untuk race condition prevention
```

### Session Management

**Session Timeout Logic:**
```
if (inactivity > 30 minutes) → Auto-logout
Activity tracked: mousedown, keydown, scroll, touchstart
Check interval: Every 1 minute
Notification: Alert user sebelum logout
```

**Session Data:**
```typescript
interface UserSession {
  schoolName: string
  schoolCode: string
  isLoggedIn: boolean
  groupNumber?: string
}

Stored in: localStorage['USER_SESSION_DATA']
Encrypted: No (non-sensitive data only)
```

### Password Policy

| Requirement | Details |
|-------------|---------|
| **Length** | Minimum 6 characters |
| **Uppercase** | At least 1 letter (A-Z) |
| **Lowercase** | At least 1 letter (a-z) |
| **Digits** | At least 1 number (0-9) |
| **Special** | At least 1 special char (!@#$%^&* etc) |
| **Reset** | User-initiated forgot password flow |
| **Admin Change** | Admin panel setting |

---

## 📊 DATABASE & DATA STRUCTURE

### Entity Relationships

```
School (1) -------- (Many) Registration
  |
  +-- SchoolCode
  +-- Permissions (allowStudents, allowAssistants, allowExaminers)
  +-- LockedBadges
  +-- ApprovedBadges

Badge (1) -------- (Many) Registration
  |
  +-- BadgeName
  +-- IsOpen
  +-- Deadline

Registration (1) -------- (Many) Participants
  |
  +-- LeaderInfo
  +-- Date
  +-- SchoolCode
  +-- BadgeType
  +-- Participants[]
  +-- Assistants[]
  +-- Examiners[]
```

### Data Models

**SubmissionData** (Database Record)
```typescript
{
  rowIndex: number              // Unique row identifier
  date: string                  // YYYY-MM-DD
  school: string                // School name
  schoolCode: string            // School code
  groupNumber: string           // Group/Battalion number
  badge: string                 // Badge name
  principalName: string         // Principal name
  principalPhone: string        // Contact number
  leader: string                // Leader/scoutmaster name
  leaderPhone: string           // Leader contact
  leaderRace: string            // Ethnicity
  student: string               // Participant name
  gender: string                // M/F
  race: string                  // Ethnicity
  id: string                    // Membership ID
  icNumber: string              // IC/ID number
  studentPhone: string          // Participant contact
  role: string                  // PESERTA|PENOLONG|PENGUJI
  remarks: string               // Additional notes
}
```

**Participant** (Form Data)
```typescript
{
  id: number                    // Client-side ID (timestamp-based)
  name: string
  gender: string                // Lelaki | Perempuan
  race: string                  // Melayu | Cina | India | Lain
  membershipId: string          // Keahlian number
  icNumber: string              // MyKad/Passport
  phoneNumber: string
  remarks: string
}
```

---

## ⭐ FITUR UTAMA

### 1. User Registration & Login

**User Alur Pendaftaran:**
1. Klik Register di AuthScreen
2. Isi: Kod Sekolah, Email, Password
3. Sistem auto-generate school code kalau baru
4. Email verification (optional)
5. Redirect ke login

**User Alur Login:**
1. Masukkan Kod Sekolah & Password
2. Rate limit check (5 attempts)
3. Backend authenticate
4. Session persist ke localStorage
5. Redirect ke UserDashboard

---

### 2. Data Registration (Pendaftaran Peserta)

**Form Structure:**
- **Leader Information** (mandatory)
  - School details (auto-filled)
  - Principal & leader contact
  
- **Participants** (min 1)
  - Add/remove participants dynamically
  - Duplicate IC detection
  
- **Assistants** (optional, if permitted)
  - Same structure
  
- **Examiners** (optional, if permitted)
  - Same structure

**Submission Process:**
1. Fill form with validation
2. Check duplicate registrations
3. Get CSRF token
4. Submit to backend
5. Backend insert to DATA sheet
6. Return success
7. Show confirmation
8. Redirect to dashboard

---

### 3. Data Management & Editing

**Edit Membership ID:**
- Click edit icon pada table
- Type new ID
- Click save
- Backend update immediately
- Show success message

**Delete Record:**
- Confirm dialog
- Soft delete (mark as deleted)
- Backend process deletion
- Refresh data

**Search & Filter:**
- Search by: Name, Badge, ID, IC Number, Phone
- Filter by: Badge type, Year
- Sort by: Date, School, Badge, Name

---

### 4. Import Data Feature

**Purpose:**
Memudahkan proses naik taraf peserta dari badge sebelumnya.

**Process:**
1. Select badge source (e.g., "Keris Gangsa")
2. Select year source
3. Select category (PESERTA/PENOLONG/PENGUJI)
4. Select candidates dari table
5. System auto-upgrade badge (Gangsa → Perak → Emas)
6. Submit dengan konfirmasi
7. Backend create new records
8. Dashboard refresh

**Duplicate Check:**
- Prevent same IC from registering twice dalam tahun sama
- Alert user jika conflict

---

### 5. Anugerah Rambu (Special Award)

**Eligibility:**
- Participants who completed requirements

**Process:**
1. Select candidates dari dashboard
2. Click "Hantar Anugerah Rambu"
3. System verify eligibility
4. Submit dengan kategori "Anugerah Rambu"
5. Backend create records
6. Dashboard update

---

### 6. Admin Panel Features

**Admin Capabilities:**
- Lihat semua sekolah & submissions
- Manage badge types (create, delete, set deadline)
- Manage schools (add, delete, set permissions)
- Toggle registration status global
- Export data (XLSX/JSON)
- View submission history
- Reset/clear data sheets
- Data migration between years
- Change admin password

**Permission Levels:**
- **Super Admin**: Full access (default "ADMIN")
- **District Admin**: Limited access (default "DAERAH")

---

### 7. Password Management

**User Password Change:**
- AuthScreen → "Forgot Password" mode
- Enter Secret Key (set during registration)
- Set new password (must meet requirements)
- Backend update password hash & salt

**Admin Password Change:**
- AdminPanel → Settings
- Enter role (ADMIN/DAERAH)
- Enter new password
- Confirm new password
- Backend update

---

### 8. AI-Powered Badge Information

**Integration:**
- Google Gemini 2.5 Flash API
- Generate badge requirement info in real-time

**Usage:**
1. User click "?" icon next to badge name
2. System call generateBadgeInfo()
3. Gemini generate syarat dalam Bahasa Melayu
4. Display dalam modal dengan HTML formatting
5. User dapat print atau save

**API Call:**
```typescript
generateBadgeInfo(badgeType: string)
  → Gemini model: 'gemini-2.5-flash'
  → System instruction: Jurulatih pengakap bertauliah
  → Language: Bahasa Melayu
  → Format: HTML <ul><li> list
```

---

### 9. Data Export

**Formats:**
1. **XLSX** (Excel) - Untuk spreadsheet apps
2. **JSON** - Untuk backup & integration

**Export Options:**
- Export DATA sheet
- Export SCHOOLS list
- Export BADGES config
- Export filtered results

---

### 10. Dashboard Analytics

**Stats Displayed:**
- Total submissions
- By badge type
- By year
- By school
- By role (students, assistants, examiners)
- Submission timeline

**Visual Elements:**
- Stat cards dengan angka
- Tables dengan sortable columns
- Filter & search capability
- Responsive layout

---

## 👥 USER ROLES & PERMISSIONS

### Role 1: Regular User (School)

**Akses:**
- ✅ View own registrations
- ✅ Add new participant registrations
- ✅ Edit membership IDs
- ✅ Delete own registrations (with confirm)
- ✅ View historical data (by year)
- ✅ Import from previous years
- ✅ Change own password
- ✅ View badge info & requirements
- ❌ Cannot access admin functions
- ❌ Cannot see other schools' data
- ❌ Cannot manage badges or schools

**Permission Granularity:**
```
allowStudents: boolean      // Can register participants?
allowAssistants: boolean    // Can register assistants?
allowExaminers: boolean     // Can register examiners?
lockedBadges: string[]      // Which badges locked?
approvedBadges: string[]    // Which badges approved?
```

---

### Role 2: District Admin (DAERAH)

**Akses:**
- ✅ View all schools' registrations
- ✅ Manage schools (add/delete)
- ✅ Set school permissions (granular)
- ✅ Manage badge types & deadlines
- ✅ Toggle registration status
- ✅ View analytics & reports
- ✅ Export data
- ✅ Change DAERAH password
- ❌ Cannot change ADMIN password
- ❌ Cannot access super admin features

---

### Role 3: Super Admin (ADMIN)

**Akses:**
- ✅ Full system access
- ✅ All district admin functions
- ✅ Delete any data
- ✅ Reset database (dangerous operation)
- ✅ View all audit logs
- ✅ Change both ADMIN & DAERAH passwords
- ✅ Setup new database
- ✅ Manage user accounts

---

## ⚠️ ERROR HANDLING & RECOVERY

### Error Handling Strategy

#### 1. Try-Catch Blocks
```typescript
Implemented at:
- API calls (api.ts)
- Security operations (security.ts)
- Component lifecycle (useEffect)
- Form submissions
- Session restoration
```

#### 2. User Feedback
```
Form Validation Errors:
  → Red border + error message

Network Errors:
  → Toast alert with retry option

Rate Limit Errors:
  → "Terlalu banyak percubaan. Tunggu X minit."

Server Errors:
  → "Gagal menghubungi server. Sila cuba lagi."
```

#### 3. Fallback Logic
```
Primary URL fails
  → Try default URL
  
Fetch timeout
  → Show connection error banner
  → Allow manual retry
  
JSON parse error
  → Log error, show generic message
  
Session restore fails
  → Clear localStorage, restart auth
```

#### 4. Retry Mechanisms
```
// Data fetch retry
handleFetchData() 
  → if fails with local URL
  → retry with default URL
  
// CSRF token retry
fetchServerCsrf()
  → if returns null
  → generate client token fallback
  
// API call retry
- Automatic on network timeout
- Manual retry button untuk user
```

---

### Recovery Procedures

**Session Loss:**
```
1. Detect session expired or corrupted
2. Clear localStorage
3. Redirect to AuthScreen
4. Alert: "Sesi anda telah tamat. Sila log masuk semula."
5. User re-login
```

**Connection Loss:**
```
1. Detect fetch failure
2. Show error banner (red, top of page)
3. Show "Gagal menyambung ke database"
4. User dapat:
   - Wait for auto-reconnect
   - Manually refresh page
   - Check internet connection
```

**Rate Limiting:**
```
1. Detect 5 failed attempts
2. Lock account for 15 minutes
3. Show countdown timer
4. User must wait or use forgot password
```

**Data Corruption:**
```
1. Admin dapat reset database dari AdminPanel
2. Requires confirmation + secret code "PADAM"
3. Backup recommendation: Export data first
4. Fresh database created automatically
```

---

## 🚀 DEPLOYMENT & CONFIGURATION

### Deployment Checklist

#### 1. Frontend Setup
```bash
# Install dependencies
npm install

# Development
npm run dev

# Build untuk production
npm run build

# Preview built app
npm run preview
```

#### 2. Google Apps Script Deployment

**Step 1: Create Google Sheet**
- Open Google Drive
- Create new Google Sheet
- Name: "Pengakap Data Management"

**Step 2: Deploy Apps Script**
- Apps Script → New Project
- Copy `apps_script_secure.gs` code
- Deploy as web app:
  - Execute as: "Your email"
  - Who has access: "Anyone"
- Get deployment URL

**Step 3: Configure Frontend**
- Update `constants.ts`:
  ```typescript
  export const DEFAULT_SERVER_URL = "https://script.google.com/..."
  ```

**Step 4: Setup Database Structure**
- Backend create sheets automatically
- OR Manual: AdminPanel → "Setup Database"

---

### Environment Configuration

**Frontend (.env.local)**
```
VITE_GEMINI_API_KEY=your_api_key_here
VITE_APP_VERSION=v12.5
VITE_LOGO_URL=https://...
```

**Backend (Script Properties)**
```
CSRF_TTL_SECONDS=3600
RATE_LIMIT_WINDOW_SECONDS=900
RATE_LIMIT_MAX_ATTEMPTS=5
ADMIN_PASS_HASH=xxx (auto-set)
ADMIN_PASS_SALT=xxx (auto-set)
DAERAH_PASS_HASH=xxx (auto-set)
DAERAH_PASS_SALT=xxx (auto-set)
```

---

### Default Credentials

**Initial Admin Login:**
```
Username: ADMIN
Password: Default (set during first deployment)
```

**Initial District Login:**
```
Username: DAERAH
Password: Default (set during first deployment)
```

⚠️ **IMPORTANT**: Change default passwords immediately after deployment!

---

### Performance Optimization

#### Frontend
```typescript
// Memoization
useMemo() for:
  - Data filtering (UserDashboard)
  - Stats calculation
  - Available years computation
  - Expiring badges calculation

// Lazy Loading
  - Components loaded on-demand
  - No unnecessary re-renders

// Caching
  - localStorage for leader info cache
  - Session persistence
  - CSRF token caching
```

#### Backend
```
// Script Lock
  - Prevents race conditions
  - 10-second timeout

// Efficient Sheet Access
  - Batch operations
  - Minimal API calls
  - Indexed lookups

// Property Service Caching
  - Script Properties untuk rate limit
  - Expiry-based cleanup
```

---

### Monitoring & Debugging

#### Frontend Monitoring
```typescript
// Console logs di production
console.error()     // API errors
console.warn()      // Session warnings
console.log()       // Debug info (minimal)

// Error tracking (optional)
- Could integrate Sentry, LogRocket, etc.
```

#### Backend Monitoring
```
// Script execution logs
Logger.log()        // Info logs
throw error         // Error handling

// Quotas to monitor
- Sheet read/write operations
- Apps Script executions
- Concurrent triggers
```

---

## 📝 CONTOH USE CASES

### Use Case 1: School Registration
```
1. School administrator opens app
2. Click "Daftar Sekolah Baru"
3. Fill registration form
4. Verify email
5. Get school code
6. Receive initial password
7. First login → setup leader info
8. Ready to register participants
```

---

### Use Case 2: Participant Registration

```
1. Login dengan school code
2. Click "Daftar Peserta Baru"
3. Select badge type (e.g., "Keris Gangsa")
4. Fill leader information (auto-cached)
5. Add participants:
   - Name, Gender, Race
   - IC Number, Phone
6. Optional: Add assistants/examiners
7. Review form
8. Submit → Success message
9. Membership ID auto-assigned
10. Edit ID kalau perlu
11. Print participant list
```

---

### Use Case 3: Data Import (Upgrade Badge)

```
1. School admin access Dashboard
2. Previous year: 5 peserta lulus "Keris Gangsa"
3. Tahun ini: Ingin naik ke "Keris Perak"
4. Click "Import dari Tahun Lepas"
5. Select:
   - Source badge: "Keris Gangsa"
   - Source year: 2024
   - Category: "PESERTA"
6. Check candidates dari table
7. System auto-detect:
   - IC number match
   - School match
   - Previous completion
8. Click "Import Dipilih"
9. Confirm dialog
10. System create new records dengan badge "Keris Perak"
11. Dashboard update dengan new entries
```

---

### Use Case 4: Admin Badge Management

```
1. Admin login (ADMIN role)
2. Go to AdminPanel
3. Click "AdminBadges" tab
4. View all badges:
   - Keris Gangsa (Open)
   - Keris Perak (Open)
   - Keris Emas (Closed)
5. Action: Add deadline to Keris Perak
   - Click edit
   - Set deadline: 31 Dec 2025
   - Save
6. All schools see notification:
   - "Keris Perak: Tutup dalam 3 hari!"
7. Automatic closure on deadline
```

---

### Use Case 5: Export & Backup

```
1. Admin need backup
2. Go to AdminPanel → AdminDashboard
3. Click "Export Data (XLSX)"
4. System generate Excel file
   - All DATA sheet rows
   - Formatted nicely
   - Ready untuk analysis
5. Download file
6. Store safely
7. Repeat monthly untuk backup
```

---

## 🔍 TROUBLESHOOTING

### Issue: Connection Error Banner Appears

**Cause:**
- Backend URL invalid
- Internet connection lost
- Google Apps Script deployment expired

**Solution:**
1. AdminPanel → Settings
2. Check "Database URL"
3. Verify URL format correct
4. Test deployment URL in browser
5. Redeploy if needed

---

### Issue: Rate Limit Lockout

**Cause:**
- Too many failed login attempts (5+)

**Solution:**
1. Wait 15 minutes
2. OR use "Forgot Password" to reset
3. New password must meet requirements

---

### Issue: Session Timeout

**Cause:**
- 30 minutes inactivity

**Solution:**
1. Click "Login" dalam alert
2. Re-enter credentials
3. Session restored

---

### Issue: Duplicate Record Error

**Cause:**
- Same IC number registered twice dalam tahun sama

**Solution:**
1. Delete previous record (if mistake)
2. Re-submit
3. OR use different year for re-registration

---

## 📞 SUPPORT & CONTACT

**For Technical Issues:**
- Check error message carefully
- Verify network connection
- Clear browser cache & localStorage
- Try different browser
- Contact system administrator

**For Feature Requests:**
- Submit via admin panel feedback
- Document use case
- Expected behavior vs actual

**For Security Issues:**
- Do NOT share credentials
- Report vulnerabilities to admin
- Do not access other schools' data
- Logout sebelum tinggalkan computer

---

## 📜 VERSION HISTORY

| Version | Date | Changes |
|---------|------|---------|
| v12.5 | Dec 2025 | Import Fix - Enhanced duplicate detection |
| v12.4 | Oct 2025 | Granular permissions system |
| v12.0 | Sept 2025 | CSRF protection + Rate limiting |
| v11.0 | Aug 2025 | AI Badge Info integration |
| v10.0 | July 2025 | Initial production release |

---

## 📄 LICENSE & TERMS

**Penggunaan:**
- Hanya untuk organisasi Pengakap
- Tidak boleh dikopi tanpa izin
- Data confidential - jangan share

**Liability:**
- System provider tidak bertanggung jawab atas data loss
- Regular backup recommended
- Admin responsible untuk data integrity

---

**Document Generated:** 6 December 2025  
**System Status:** ✅ PRODUCTION-READY  
**Last Updated:** 6 December 2025

---

