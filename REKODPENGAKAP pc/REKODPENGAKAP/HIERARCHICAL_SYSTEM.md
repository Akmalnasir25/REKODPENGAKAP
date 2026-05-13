# 🚀 SISTEM HIERARKI PENGURUSAN PENGAKAP MALAYSIA

## 📊 STRUKTUR HIERARKI

```
MALAYSIA (Negara)
│
├── DEVELOPER (Super Admin)
│   ├── Full system access
│   ├── Manage: Negeri, Daerah, Admins, Sekolah
│   └── Create admin accounts (Negeri & Daerah)
│
├── NEGERI (State Level Admins)
│   ├── Access: All data dalam negeri mereka
│   ├── Manage: Daerah, Sekolah dalam negeri
│   └── Create daerah admin accounts
│
├── DAERAH (District Level Admins)
│   ├── Access: All data dalam daerah mereka
│   ├── Manage: Sekolah dalam daerah
│   └── Approve/Lock submissions
│
└── SEKOLAH (School Users)
    ├── Register dengan pilih: Negeri → Daerah → Sekolah
    ├── Submit registrations
    └── View own data only
```

## 🗄️ DATABASE STRUCTURE

### **New Sheets:**

#### 1. **NEGERI** (States)
```
Columns: NegeriCode | NegeriName | CreatedDate
Pre-populated with 16 Malaysian states:
- PRK (PERAK)
- SEL (SELANGOR)
- JHR (JOHOR)
- etc.
```

#### 2. **DAERAH** (Districts)
```
Columns: DaerahCode | DaerahName | NegeriCode | CreatedDate
Example:
- PRK-KU (KINTA UTARA, linked to PRK)
- PRK-KS (KINTA SELATAN, linked to PRK)
```

#### 3. **ADMINS** (Regional Admins)
```
Columns: Username | PasswordHash | Salt | Role | NegeriCode | DaerahCode | FullName | Phone | Email | CreatedDate | LastLogin
Roles:
- 'negeri' (State admin)
- 'daerah' (District admin)
```

### **Enhanced Existing Sheets:**

#### **SCHOOLS**
```
OLD: SchoolName | AllowStud | AllowAsst | AllowExam | LockedBadges | ApprovedBadges
NEW: SchoolName | SchoolCode | NegeriCode | DaerahCode | AllowStud | AllowAsst | AllowExam | LockedBadges | ApprovedBadges | CreatedDate
```

#### **USERS**
```
OLD: SchoolName | SchoolCode | PasswordHash | Salt | SecretKey
NEW: SchoolName | SchoolCode | NegeriCode | DaerahCode | PasswordHash | Salt | SecretKey | CreatedDate
```

#### **USER_PROFILES**
```
OLD: SchoolCode | SchoolName | Phone | GroupNumber | ... | LastUpdated
NEW: SchoolCode | SchoolName | NegeriCode | DaerahCode | Phone | GroupNumber | ... | LastUpdated
```

#### **DATA**
```
OLD: Date | School | SchoolCode | Badge | Student | ... | Remarks
NEW: Date | School | SchoolCode | NegeriCode | DaerahCode | Badge | Student | ... | Remarks
```

## 🔐 ACCESS CONTROL MATRIX

| Feature | Developer | Admin Negeri | Admin Daerah | Sekolah |
|---------|-----------|--------------|--------------|---------|
| Manage Negeri | ✅ | ❌ | ❌ | ❌ |
| Manage Daerah | ✅ | ❌ | ❌ | ❌ |
| Create Admin (Negeri) | ✅ | ❌ | ❌ | ❌ |
| Create Admin (Daerah) | ✅ | ✅ | ❌ | ❌ |
| Add Schools | ✅ | ✅ | ✅ | ❌ |
| Approve Submissions | ✅ | ✅ | ✅ | ❌ |
| View All Data | ✅ | Negeri Only | Daerah Only | Own Only |
| Submit Forms | ❌ | ❌ | ❌ | ✅ |

## 📝 USER REGISTRATION FLOW

### **For Schools (End Users):**

```
1. Visit Registration Page
   ↓
2. Select NEGERI (dropdown)
   ↓
3. Select DAERAH (filtered by Negeri)
   ↓
4. Select/Enter SEKOLAH (filtered by Daerah)
   ↓
5. Enter SchoolCode, Password, SecretKey
   ↓
6. System creates account with Negeri+Daerah linkage
```

### **Data Saved:**
```javascript
USERS sheet:
- SchoolName
- SchoolCode
- NegeriCode (from selection)
- DaerahCode (from selection)
- PasswordHash
- Salt
- SecretKey
- CreatedDate
```

## 🎯 BACKEND API ENDPOINTS

### **New Actions:**

#### **Negeri Management (Developer Only)**
```javascript
// Add Negeri
{ action: 'add_negeri', negeriCode: 'PRK', negeriName: 'PERAK' }

// Delete Negeri
{ action: 'delete_negeri', negeriCode: 'PRK' }
```

#### **Daerah Management (Developer Only)**
```javascript
// Add Daerah
{ action: 'add_daerah', daerahCode: 'PRK-KU', daerahName: 'KINTA UTARA', negeriCode: 'PRK' }

// Delete Daerah
{ action: 'delete_daerah', daerahCode: 'PRK-KU' }
```

#### **Admin Management**
```javascript
// Add Admin (Negeri or Daerah)
{
  action: 'add_admin',
  username: 'admin_perak',
  password: 'xxx',
  role: 'negeri', // or 'daerah'
  negeriCode: 'PRK',
  daerahCode: '', // empty for negeri admin
  fullName: 'Ahmad bin Ali',
  phone: '0123456789',
  email: 'admin@perak.gov.my'
}

// Delete Admin
{ action: 'delete_admin', username: 'admin_perak' }

// Login (Regional Admin)
{
  action: 'login_admin_regional',
  username: 'admin_perak',
  password: 'xxx'
}
```

### **Enhanced Response (getAllData)**
```javascript
{
  status: 'success',
  submissions: [...],
  schools: [...],
  badges: [...],
  userProfiles: [...],
  negeriList: [
    { code: 'PRK', name: 'PERAK', createdDate: '...' },
    { code: 'SEL', name: 'SELANGOR', createdDate: '...' }
  ],
  daerahList: [
    { code: 'PRK-KU', name: 'KINTA UTARA', negeriCode: 'PRK', createdDate: '...' },
    { code: 'PRK-KS', name: 'KINTA SELATAN', negeriCode: 'PRK', createdDate: '...' }
  ],
  isRegistrationOpen: true
}
```

## 🎨 FRONTEND REQUIREMENTS

### **1. Enhanced Registration Form**
```tsx
// components/AuthScreen.tsx
<form>
  <select name="negeri">
    <option>-- Pilih Negeri --</option>
    {negeriList.map(n => <option value={n.code}>{n.name}</option>)}
  </select>

  <select name="daerah" disabled={!selectedNegeri}>
    <option>-- Pilih Daerah --</option>
    {daerahList
      .filter(d => d.negeriCode === selectedNegeri)
      .map(d => <option value={d.code}>{d.name}</option>)}
  </select>

  <select name="sekolah" disabled={!selectedDaerah}>
    <option>-- Pilih Sekolah --</option>
    {schools
      .filter(s => s.daerahCode === selectedDaerah)
      .map(s => <option value={s.code}>{s.name}</option>)}
  </select>

  <input name="schoolCode" placeholder="Kod Sekolah" />
  <input type="password" name="password" placeholder="Kata Laluan" />
  <input name="secretKey" placeholder="Kata Kunci Keselamatan" />
  
  <button type="submit">Daftar Akaun</button>
</form>
```

### **2. Developer Dashboard**
```tsx
// New component: DeveloperDashboard.tsx
<Tabs>
  <Tab label="Negeri">
    <NegeriManagement />
  </Tab>
  <Tab label="Daerah">
    <DaerahManagement />
  </Tab>
  <Tab label="Admins">
    <AdminManagement />
  </Tab>
  <Tab label="Sekolah">
    <SchoolManagement />
  </Tab>
</Tabs>
```

### **3. Regional Admin Dashboard**
```tsx
// components/RegionalAdminDashboard.tsx
{role === 'negeri' && (
  <NegeriAdminView negeriCode={negeriCode} />
)}

{role === 'daerah' && (
  <DaerahAdminView daerahCode={daerahCode} />
)}
```

## 🔄 DATA MIGRATION STRATEGY

### **For Existing Data:**

```javascript
// Migration script to add Negeri & Daerah to existing records
function migrateExistingData() {
  // 1. Add default values to USERS
  var usersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('USERS');
  // Insert columns 3 & 4: NegeriCode, DaerahCode
  // Default: PRK, PRK-KU (for Kinta Utara schools)
  
  // 2. Add default values to SCHOOLS
  var schoolsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('SCHOOLS');
  // Insert columns 2, 3, 4: SchoolCode, NegeriCode, DaerahCode
  
  // 3. Add default values to DATA
  var dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DATA');
  // Insert columns 4 & 5: NegeriCode, DaerahCode
  
  // 4. Add default values to USER_PROFILES
  var profilesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('USER_PROFILES');
  // Insert columns 3 & 4: NegeriCode, DaerahCode
}
```

## 📊 BENEFITS FOR PITCHING

### **Scalability**
- ✅ Support multiple states
- ✅ Support multiple districts
- ✅ Support unlimited schools
- ✅ Hierarchical data filtering

### **Multi-Level Management**
- ✅ Developer → Full control
- ✅ State admins → State-level oversight
- ✅ District admins → District-level approval
- ✅ Schools → Self-service registration

### **Data Segregation**
- ✅ Each level sees only relevant data
- ✅ No data leakage between states/districts
- ✅ Role-based access control

### **Reporting & Analytics**
- ✅ National-level statistics (Developer)
- ✅ State-level reports (Negeri Admin)
- ✅ District-level reports (Daerah Admin)
- ✅ School-level reports (Users)

### **Future-Proof**
- ✅ Easy to add new states
- ✅ Easy to add new districts
- ✅ Easy to add new schools
- ✅ Scalable to national level

## 🎯 IMPLEMENTATION ROADMAP

### **Phase 1: Backend Setup** ✅ DONE
- [x] Create NEGERI sheet with pre-populated states
- [x] Create DAERAH sheet with sample districts
- [x] Create ADMINS sheet for regional admins
- [x] Enhance USERS, SCHOOLS, DATA, USER_PROFILES with Negeri/Daerah columns
- [x] Add API endpoints for Negeri/Daerah/Admin management
- [x] Add login for regional admins

### **Phase 2: Frontend Development** 🚧 NEXT
- [ ] Update AuthScreen with cascading dropdowns (Negeri → Daerah → Sekolah)
- [ ] Create DeveloperDashboard component
- [ ] Create RegionalAdminDashboard component
- [ ] Add Negeri/Daerah filters to existing dashboards
- [ ] Update state management to include negeri/daerah data

### **Phase 3: Data Migration** 📅 UPCOMING
- [ ] Write migration script for existing data
- [ ] Test migration on copy of production data
- [ ] Backup production database
- [ ] Run migration
- [ ] Verify data integrity

### **Phase 4: Testing & Deployment** 📅 UPCOMING
- [ ] Test developer access
- [ ] Test negeri admin access
- [ ] Test daerah admin access
- [ ] Test school user registration
- [ ] Deploy to production

## 📞 SUPPORT & DOCUMENTATION

For questions or issues, contact:
- **Developer**: [Your contact]
- **Documentation**: This file
- **System Status**: Check Google Sheets

---

**Last Updated**: December 7, 2025
**Version**: 2.0 - Hierarchical Multi-Level System
