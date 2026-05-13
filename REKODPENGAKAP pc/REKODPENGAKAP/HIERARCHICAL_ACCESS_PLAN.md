# Rancangan Sistem Akses Hierarki

## Masalah Semasa
- Tiada perbezaan antara Admin Negeri dan Admin Daerah
- Semua admin guna ID yang sama (ADMIN / DAERAH)
- Tiada filter data berdasarkan scope negeri/daerah
- Developer tidak boleh override akses admin

## Struktur Hierarki Yang Betul

```
DEVELOPER (Super Admin)
  │
  ├── Login: DEVELOPER / Dev@123456
  ├── Akses: SEMUA negeri, daerah, sekolah
  ├── Panel: DeveloperPanel + DeveloperDashboard
  └── Boleh bypass semua restriction
      │
      ▼
ADMIN NEGERI (16 negeri berbeza)
  │
  ├── Login: Username unik per negeri (contoh: ADMIN_PRK_001)
  ├── Akses: Hanya daerah & sekolah dalam negerinya
  ├── Panel: AdminNegeriPanel
  ├── Boleh:
  │   - Lihat semua daerah dalam negerinya
  │   - Lihat semua sekolah dalam negerinya
  │   - Manage schools, badges untuk negerinya
  │   - TIDAK boleh tambah/padam daerah (Developer only)
  └── Contoh:
      - ADMIN_PRK_001 → Hanya akses PERAK
      - ADMIN_SEL_001 → Hanya akses SELANGOR
      │
      ▼
ADMIN DAERAH (Berbeza setiap daerah)
  │
  ├── Login: Username unik per daerah (contoh: ADMIN_PRK-KU_001)
  ├── Akses: Hanya sekolah dalam daerahnya
  ├── Panel: AdminDaerahPanel
  ├── Boleh:
  │   - Lihat sekolah dalam daerahnya sahaja
  │   - Tambah sekolah dalam daerahnya
  │   - Manage badges untuk daerahnya
  │   - TIDAK boleh lihat daerah lain
  └── Contoh:
      - ADMIN_PRK-KU_001 → Hanya akses KINTA UTARA
      - ADMIN_PRK-KS_001 → Hanya akses KINTA SELATAN
      │
      ▼
USER (Sekolah)
  │
  ├── Login: Kod Sekolah (contoh: ABA1234)
  ├── Akses: Data sekolah sendiri sahaja
  └── Panel: UserDashboard

```

## Perubahan Yang Perlu Dibuat

### 1. Backend (apps_script_secure.gs)

#### A. Update getAllData() - Add Filtering
```javascript
function getAllData(requestingRole, requestingNegeriCode, requestingDaerahCode) {
  // ... existing code ...
  
  // Filter schools based on role
  if (requestingRole === 'negeri') {
    schools = schools.filter(s => s.negeriCode === requestingNegeriCode);
    submissions = submissions.filter(s => s.negeriCode === requestingNegeriCode);
    daerahList = daerahList.filter(d => d.negeriCode === requestingNegeriCode);
  } else if (requestingRole === 'daerah') {
    schools = schools.filter(s => s.daerahCode === requestingDaerahCode);
    submissions = submissions.filter(s => s.daerahCode === requestingDaerahCode);
    daerahList = daerahList.filter(d => d.code === requestingDaerahCode);
    negeriList = []; // Daerah admin doesn't need negeri list
  }
  
  // Developer gets everything (no filter)
  
  return { ...data, schools, submissions, daerahList, negeriList };
}
```

#### B. Update loginAdminRegional() - Return Scope Info
```javascript
function loginAdminRegional(p) {
  // ... existing auth ...
  
  return createJSONOutput({
    status: 'success',
    role: role, // 'negeri' or 'daerah'
    username: username,
    fullName: fullName,
    negeriCode: negeriCode,   // For filtering
    daerahCode: daerahCode,   // For filtering
    scope: {
      canManageNegeri: false,
      canManageDaerah: role === 'negeri',
      canManageSchools: true,
      canManageBadges: true,
      negeriAccess: [negeriCode],
      daerahAccess: role === 'negeri' ? 
        'ALL_IN_NEGERI' : 
        [daerahCode]
    }
  });
}
```

### 2. Frontend Changes

#### A. AuthScreen.tsx - Add Login Type Selector
```tsx
<select value={loginType} onChange={(e) => setLoginType(e.target.value)}>
  <option value="user">👤 User Sekolah</option>
  <option value="admin_daerah">📍 Admin Daerah</option>
  <option value="admin_negeri">🏛️ Admin Negeri</option>
  <option value="developer">👨‍💻 Developer</option>
</select>
```

#### B. App.tsx - Handle Different Admin Types
```tsx
const [userSession, setUserSession] = useState<UserSession | null>(null);
const [adminSession, setAdminSession] = useState<{
  role: 'negeri' | 'daerah' | 'developer';
  negeriCode?: string;
  daerahCode?: string;
  scope: any;
} | null>(null);

// Different views
switch(view) {
  case 'admin_negeri':
    return <AdminNegeriPanel 
      negeriCode={adminSession.negeriCode}
      scope={adminSession.scope}
    />;
  case 'admin_daerah':
    return <AdminDaerahPanel 
      daerahCode={adminSession.daerahCode}
      scope={adminSession.scope}
    />;
  case 'developer':
    return <DeveloperPanel />;
  case 'user_dashboard':
    return <UserDashboard />;
}
```

#### C. Create New Components

**AdminNegeriPanel.tsx**
- Tab 1: Daerah dalam negeri (READ ONLY - cannot add/delete)
- Tab 2: Sekolah dalam negeri (can add/manage)
- Tab 3: Badges untuk negeri
- Tab 4: Data submissions filtered by negeriCode

**AdminDaerahPanel.tsx**
- Tab 1: Sekolah dalam daerah (can add/manage)
- Tab 2: Badges untuk daerah
- Tab 3: Data submissions filtered by daerahCode

### 3. API Service Updates

#### services/api.ts
```typescript
export const fetchCloudData = async (
  url: string, 
  role?: string, 
  negeriCode?: string, 
  daerahCode?: string
) => {
  const params = new URLSearchParams({
    role: role || '',
    negeriCode: negeriCode || '',
    daerahCode: daerahCode || ''
  });
  
  const targetUrl = `${url}?${params}&t=${Date.now()}`;
  // ...
};
```

### 4. Example Login Scenarios

#### Scenario 1: Admin Negeri Perak Login
```
Username: ADMIN_PRK_001
Password: (set by developer)

Result:
- View: AdminNegeriPanel
- Can see: All daerah in PERAK (PRK-KU, PRK-KS, PRK-HT, PRK-LP)
- Can see: All schools with negeriCode="PRK"
- Cannot: Add/delete daerah (Developer only)
- Cannot: See schools from Selangor
```

#### Scenario 2: Admin Daerah Kinta Utara Login
```
Username: ADMIN_PRK-KU_001
Password: (set by developer or admin negeri)

Result:
- View: AdminDaerahPanel
- Can see: Only schools with daerahCode="PRK-KU"
- Cannot: See schools from Kinta Selatan (PRK-KS)
- Cannot: See daerah list
```

#### Scenario 3: Developer Login
```
Username: DEVELOPER
Password: Dev@123456

Result:
- View: DeveloperPanel with hierarchy button
- Can see: EVERYTHING
- Can: Add negeri, daerah, admin regional, schools
- Can: Override any restriction
```

## Implementation Steps (Priority Order)

### Phase 1: Backend Foundation ✅ DONE
- [x] ADMINS sheet exists
- [x] addAdmin() function exists
- [x] loginAdminRegional() function exists

### Phase 2: Backend Filtering (NEXT)
1. Update getAllData() to accept role, negeriCode, daerahCode parameters
2. Add filtering logic for schools, submissions, daerah based on role
3. Update doGet() to pass filtering parameters

### Phase 3: Frontend Auth (NEXT)
1. Add loginType selector in AuthScreen
2. Update AuthScreen to call loginAdminRegional for admin_negeri/admin_daerah
3. Store admin session with scope info

### Phase 4: Admin Panels (NEXT)
1. Create AdminNegeriPanel component
2. Create AdminDaerahPanel component
3. Add routing in App.tsx

### Phase 5: Testing
1. Create test admins via DeveloperDashboard Tab 3
2. Test filtering works correctly
3. Test permissions enforced

## Database Sample Data

### ADMINS Sheet Sample
```
Username          | Role    | NegeriCode | DaerahCode | FullName
------------------|---------|------------|------------|------------------
ADMIN_PRK_001     | negeri  | PRK        |            | Ahmad Perak
ADMIN_SEL_001     | negeri  | SEL        |            | Siti Selangor
ADMIN_PRK-KU_001  | daerah  | PRK        | PRK-KU     | Ali Kinta Utara
ADMIN_PRK-KS_001  | daerah  | PRK        | PRK-KS     | Aminah Kinta Selatan
```

### Expected Behavior
- ADMIN_PRK_001 login → Sees 4 daerah (PRK-KU, PRK-KS, PRK-HT, PRK-LP)
- ADMIN_PRK-KU_001 login → Sees only schools with daerahCode="PRK-KU"
- DEVELOPER login → Sees everything, can create admins

## Security Considerations
1. Rate limiting per username (already implemented)
2. Password hashing (already implemented with salt)
3. CSRF tokens for sensitive operations (already implemented)
4. Server-side validation of scope (must implement in getAllData)
5. Cannot escalate privileges (admin cannot become developer)

## Notes
- Developer credentials stored in localStorage (local only)
- Admin credentials stored in ADMINS sheet (server)
- User credentials stored in USERS sheet (server)
- Each has different authentication flow
