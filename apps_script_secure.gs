/**
 * ------------------------------------------------------------------
 * SISTEM PENGURUSAN DATA PENGAKAP - SECURE APPSCRIPT
 * Integrasi: CSRF, rate-limiting, password hashing (SHA-256+salt),
 * migration from plaintext passwords, input sanitization.
 * ------------------------------------------------------------------
 */

// --- NAMA SHEET ---
var SHEET_DATA = "DATA";
var SHEET_SCHOOLS = "SCHOOLS";
var SHEET_BADGES = "BADGES";
var SHEET_USERS = "USERS";
var SHEET_USER_PROFILES = "USER_PROFILES";
var SHEET_NEGERI = "NEGERI";
var SHEET_DAERAH = "DAERAH";
var SHEET_ADMINS = "ADMINS";

// --- GLOBAL PROPERTIES ---
var SCRIPT_PROP = PropertiesService.getScriptProperties();

// Configurable properties (set in Project Properties if desired)
var CSRF_TTL_SECONDS = parseInt(SCRIPT_PROP.getProperty('CSRF_TTL_SECONDS') || '3600', 10);
var RATE_LIMIT_WINDOW_SECONDS = parseInt(SCRIPT_PROP.getProperty('RATE_LIMIT_WINDOW_SECONDS') || '900', 10);
var RATE_LIMIT_MAX_ATTEMPTS = parseInt(SCRIPT_PROP.getProperty('RATE_LIMIT_MAX_ATTEMPTS') || '5', 10);

// Utility: hex conversion
function _toHex(bytes) {
  return bytes.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

function generateSalt() {
  var raw = Utilities.getUuid();
  return raw.replace(/-/g, '').substring(0, 16);
}

function hashPassword(password, salt) {
  var input = salt + String(password);
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input);
  return _toHex(digest);
}

// ---------------- CSRF ----------------
function issueCsrfToken() {
  var token = Utilities.getUuid().replace(/-/g,'') + '_' + Math.floor(Math.random()*1e9);
  var expiresAt = Date.now() + CSRF_TTL_SECONDS * 1000;
  var key = 'csrf_' + token;
  SCRIPT_PROP.setProperty(key, String(expiresAt));
  return { token: token, expiresAt: expiresAt };
}

function validateCsrfToken(token) {
  if (!token) return false;
  var key = 'csrf_' + token;
  var val = SCRIPT_PROP.getProperty(key);
  if (!val) return false;
  var expiresAt = parseInt(val, 10);
  if (Date.now() > expiresAt) { SCRIPT_PROP.deleteProperty(key); return false; }
  // one-time token
  SCRIPT_PROP.deleteProperty(key);
  return true;
}

// ---------------- Rate limit (per identifier) ----------------
function _rateKey(id) { return 'rl_' + (id || 'anon'); }

function checkRateLimit(id) {
  var key = _rateKey(id);
  var raw = SCRIPT_PROP.getProperty(key);
  var now = Date.now();
  if (!raw) return { ok: true };
  try {
    var obj = JSON.parse(raw);
    if (obj.lockedUntil && now < obj.lockedUntil) return { ok: false, lockedUntil: obj.lockedUntil };
    if (now - obj.firstAttempt > RATE_LIMIT_WINDOW_SECONDS * 1000) { SCRIPT_PROP.deleteProperty(key); return { ok: true }; }
    if ((obj.count || 0) >= RATE_LIMIT_MAX_ATTEMPTS) {
      var locked = now + RATE_LIMIT_WINDOW_SECONDS * 1000;
      obj.lockedUntil = locked; SCRIPT_PROP.setProperty(key, JSON.stringify(obj));
      return { ok: false, lockedUntil: locked };
    }
    return { ok: true };
  } catch (e) { SCRIPT_PROP.deleteProperty(key); return { ok: true }; }
}

function recordFailedAttempt(id) {
  var key = _rateKey(id);
  var raw = SCRIPT_PROP.getProperty(key);
  var now = Date.now();
  if (!raw) { var o = { count: 1, firstAttempt: now }; SCRIPT_PROP.setProperty(key, JSON.stringify(o)); return o; }
  try {
    var obj = JSON.parse(raw);
    if (now - obj.firstAttempt > RATE_LIMIT_WINDOW_SECONDS * 1000) { var n = { count: 1, firstAttempt: now }; SCRIPT_PROP.setProperty(key, JSON.stringify(n)); return n; }
    obj.count = (obj.count || 0) + 1; SCRIPT_PROP.setProperty(key, JSON.stringify(obj)); return obj;
  } catch (e) { var o2 = { count: 1, firstAttempt: now }; SCRIPT_PROP.setProperty(key, JSON.stringify(o2)); return o2; }
}

function resetAttempts(id) { SCRIPT_PROP.deleteProperty(_rateKey(id)); }

// ---------------- Sanitization ----------------
function sanitizeString(s) { if (!s || typeof s !== 'string') return ''; return s.replace(/[\x00-\x1F\x7F]/g, '').trim(); }
function isValidSchoolCode(code) { if (!code) return false; return /^[A-Z0-9\-\_]{2,20}$/.test(code); }

// ---------------- User storage helpers ----------------
function _ensureUsersSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_USERS);
  if (!sh) { sh = ss.insertSheet(SHEET_USERS); sh.appendRow(["SchoolName","SchoolCode","PasswordHash","Salt","SecretKey"]); }
  return sh;
}

function migrateUserPasswordsIfNeeded() {
  var sh = _ensureUsersSheet();
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    // If sheet has old format where password stored in col 3 and salt missing
    if (row.length >= 4 && row[2] && (!row[3] || row.length === 4)) {
      var plain = String(row[2]);
      var salt = generateSalt();
      var hash = hashPassword(plain, salt);
      // write back to row: columns 3..5 -> [hash, salt, secretKey]
      sh.getRange(i+1, 3, 1, 3).setValues([[hash, salt, row[3] || '']]);
    }
  }
}

function getUserRecordBySchoolCode(schoolCode) {
  var sh = _ensureUsersSheet();
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).toUpperCase() == String(schoolCode).toUpperCase()) {
      return { 
        rowIndex: i+1, 
        schoolName: data[i][0], 
        schoolCode: data[i][1], 
        negeriCode: data[i][2],
        daerahCode: data[i][3],
        passwordHash: data[i][4], 
        salt: data[i][5], 
        secretKey: data[i][6] 
      };
    }
  }
  return null;
}

function saveUserRecord(schoolName, schoolCode, passwordPlain, secretKey, negeriCode, daerahCode) {
  var sh = _ensureUsersSheet();
  var salt = generateSalt();
  var hash = hashPassword(passwordPlain, salt);
  sh.appendRow([
    schoolName, 
    schoolCode, 
    negeriCode || '', 
    daerahCode || '', 
    hash, 
    salt, 
    secretKey || '', 
    new Date()
  ]);
  return true;
}

function updateUserPasswordByRow(rowIndex, newPasswordPlain) {
  var sh = _ensureUsersSheet();
  var salt = generateSalt();
  var hash = hashPassword(newPasswordPlain, salt);
  sh.getRange(rowIndex, 5).setValue(hash);  // Column 5 = PasswordHash
  sh.getRange(rowIndex, 6).setValue(salt);   // Column 6 = Salt
}

// ---------------- Admin password helpers (migrate & validate) ----------------
function _getAdminHashes() {
  var aHash = SCRIPT_PROP.getProperty('ADMIN_PASS_HASH');
  var aSalt = SCRIPT_PROP.getProperty('ADMIN_PASS_SALT');
  var dHash = SCRIPT_PROP.getProperty('DISTRICT_PASS_HASH');
  var dSalt = SCRIPT_PROP.getProperty('DISTRICT_PASS_SALT');
  var oldAdmin = SCRIPT_PROP.getProperty('ADMIN_PASS');
  if (oldAdmin && !aHash) {
    var s = generateSalt(); var h = hashPassword(oldAdmin, s);
    SCRIPT_PROP.setProperty('ADMIN_PASS_HASH', h); SCRIPT_PROP.setProperty('ADMIN_PASS_SALT', s);
    aHash = h; aSalt = s;
  }
  var oldDistrict = SCRIPT_PROP.getProperty('DISTRICT_PASS');
  if (oldDistrict && !dHash) {
    var s2 = generateSalt(); var h2 = hashPassword(oldDistrict, s2);
    SCRIPT_PROP.setProperty('DISTRICT_PASS_HASH', h2); SCRIPT_PROP.setProperty('DISTRICT_PASS_SALT', s2);
    dHash = h2; dSalt = s2;
  }
  return { admin: { hash: aHash, salt: aSalt }, district: { hash: dHash, salt: dSalt } };
}

function validateAdminPassword(role, passwordPlain) {
  var hashes = _getAdminHashes();
  var target = role === 'district' ? hashes.district : hashes.admin;
  if (!target.hash || !target.salt) return false;
  var comp = hashPassword(passwordPlain, target.salt);
  return comp === target.hash;
}

// ---------------- Main handlers (doGet/doPost) ----------------
function doGet(e) {
  var action = (e.parameter && e.parameter.action) || '';
  if (action === 'get_csrf') {
    var tok = issueCsrfToken();
    return createJSONOutput({ status: 'success', csrfToken: tok.token, expiresAt: tok.expiresAt });
  }
  
  // Get filtering parameters for hierarchical access
  var role = (e.parameter && e.parameter.role) || '';
  var negeriCode = (e.parameter && e.parameter.negeriCode) || '';
  var daerahCode = (e.parameter && e.parameter.daerahCode) || '';
  
  return handleRequest(e, role, negeriCode, daerahCode);
}

function doPost(e) { return handleRequest(e, '', '', ''); }

// ---------------- Integrate with existing handleRequest structure ----------------
function handleRequest(e, requestingRole, requestingNegeriCode, requestingDaerahCode) {
  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    if (!e.postData) { 
      var data = getAllData(requestingRole, requestingNegeriCode, requestingDaerahCode); 
      return createJSONOutput(data); 
    }
    var params = JSON.parse(e.postData.contents);
    var action = params.action;

    // CSRF validation for sensitive actions
    if (['login_user','register_user','reset_password','change_password','update_user_profile','submit_form','update_data','delete_data'].indexOf(action) !== -1) {
      var token = params.csrfToken;
      if (!validateCsrfToken(token)) return createJSONOutput({ status: 'error', message: 'Invalid or expired CSRF token' });
    }

    // Admin login
    if (action === 'login_admin') {
      var username = (params.username || '').toString();
      var inputPass = (params.password || '').toString();
      var rl = checkRateLimit('admin_' + username);
      if (!rl.ok) { var wait = Math.ceil((rl.lockedUntil - Date.now())/1000); return createJSONOutput({ status:'error', message: 'Too many attempts', waitSeconds: wait }); }
      if (username === 'DAERAH' && validateAdminPassword('district', inputPass)) { resetAttempts('admin_' + username); return createJSONOutput({ status: 'success', role: 'district' }); }
      if (username === 'ADMIN' && validateAdminPassword('admin', inputPass)) { resetAttempts('admin_' + username); return createJSONOutput({ status: 'success', role: 'admin' }); }
      recordFailedAttempt('admin_' + username); return createJSONOutput({ status: 'error', message: 'Log masuk gagal. Semak Nama Pengguna & Kata Laluan.' });
    }

    if (action === 'change_admin_password') {
      var role = params.role; var newPass = params.newPassword || '';
      var salt = generateSalt(); var hash = hashPassword(newPass, salt);
      if (role === 'district') { SCRIPT_PROP.setProperty('DISTRICT_PASS_HASH', hash); SCRIPT_PROP.setProperty('DISTRICT_PASS_SALT', salt); }
      else { SCRIPT_PROP.setProperty('ADMIN_PASS_HASH', hash); SCRIPT_PROP.setProperty('ADMIN_PASS_SALT', salt); }
      return createJSONOutput({ status: 'success' });
    }

    if (action === 'login_user') return loginUser(params);
    if (action === 'register_user') return registerUser(params);
    if (action === 'reset_password') return resetPassword(params);
    if (action === 'change_password') return changePassword(params);
    if (action === 'update_user_profile') return updateUserProfile(params);

    if (action === 'submit_form') return submitForm(params);
    if (action === 'update_data') return updateParticipantId(params);
    if (action === 'delete_data') return deleteData(params);
    if (action === 'migrate_year') return migrateYear(params);
    if (action === 'add_school') return addSchool(params);
    if (action === 'delete_school') return deleteSchool(params);
    if (action === 'update_school_permission') return updateSchoolPermission(params);
    if (action === 'toggle_school_edit_batch') return toggleSchoolEditBatch(params);
    if (action === 'lock_school_badge') return updateSchoolBadgeStatus(params, 'lock');
    if (action === 'unlock_school_badge') return updateSchoolBadgeStatus(params, 'unlock');
    if (action === 'approve_school_badge') return updateSchoolBadgeStatus(params, 'approve');
    if (action === 'setup_database') { setupDatabase(); return createJSONOutput({ status: 'success', message: 'Struktur Database berjaya dijana.' }); }
    if (action === 'clear_sheet_data') { clearSheetData(params.target); return createJSONOutput({ status: 'success' }); }
    if (action === 'add_badge_type') return addBadgeType(params);
    if (action === 'delete_badge_type') return deleteBadgeType(params);
    if (action === 'update_badge_deadline') return updateBadgeDeadline(params);
    if (action === 'toggle_registration') return toggleRegistration(params);
    
    // Negeri & Daerah Management (Developer only)
    if (action === 'add_negeri') return addNegeri(params);
    if (action === 'add_daerah') return addDaerah(params);
    if (action === 'delete_negeri') return deleteNegeri(params);
    if (action === 'delete_daerah') return deleteDaerah(params);
    
    // Admin Management
    if (action === 'add_admin') return addAdmin(params);
    if (action === 'delete_admin') return deleteAdmin(params);
    if (action === 'login_admin_regional') return loginAdminRegional(params);
    if (action === 'change_admin_regional_password') return changeAdminRegionalPassword(params);

    return createJSONOutput({ status: 'error', message: 'Action tidak sah: ' + action });
  } catch (err) {
    return createJSONOutput({ status: 'error', message: err.toString() });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ---------------- Existing functions preserved (getAllData, submitForm, etc.) ----------------
function getAllData(requestingRole, requestingNegeriCode, requestingDaerahCode) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Get schools first to create lookup map
  var schoolSheet = ss.getSheetByName(SHEET_SCHOOLS);
  var schoolMap = {};
  if (schoolSheet) {
    var sData = schoolSheet.getDataRange().getValues();
    for (var j = 1; j < sData.length; j++) {
       if(sData[j][0] == "") continue;
       var schoolCode = sData[j][1];
       schoolMap[schoolCode] = {
         negeriCode: sData[j][2],
         daerahCode: sData[j][3]
       };
    }
  }
  
  var sheet = ss.getSheetByName(SHEET_DATA);
  var submissions = [];
  if (sheet) {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
       var row = data[i];
       if (row[0] === "") continue;
       var schoolCode = row[2];
       var schoolInfo = schoolMap[schoolCode] || {};
       submissions.push({
         rowIndex: i + 1,
         date: row[0],
         school: row[1],
         schoolCode: schoolCode,
         negeriCode: row[3] || '',
         daerahCode: row[4] || '',
         badge: row[5],
         student: row[6],
         gender: row[7],
         race: row[8],
         id: row[9],
         icNumber: row[10],
         studentPhone: row[11],
         role: row[12],
         remarks: row[13]
       });
    }
  }

  var schoolSheet = ss.getSheetByName(SHEET_SCHOOLS);
  var schools = [];
  if (schoolSheet) {
    var sData = schoolSheet.getDataRange().getValues();
    for (var j = 1; j < sData.length; j++) {
       if(sData[j][0] == "") continue;
       schools.push({
         name: sData[j][0],
         schoolCode: sData[j][1],
         negeriCode: sData[j][2],
         daerahCode: sData[j][3],
         allowStudents: sData[j][4] === true,
         allowAssistants: sData[j][5] === true,
         allowExaminers: sData[j][6] === true,
         lockedBadges: sData[j][7] ? sData[j][7].toString().split(',') : [],
         approvedBadges: sData[j][8] ? sData[j][8].toString().split(',') : []
       });
    }
  }

  var badgeSheet = ss.getSheetByName(SHEET_BADGES);
  var badges = [];
  if (badgeSheet) {
    var bData = badgeSheet.getDataRange().getValues();
    for (var k = 1; k < bData.length; k++) {
      if(bData[k][0] == "") continue;
      badges.push({
        name: bData[k][0],
        isOpen: bData[k][1] === true,
        deadline: bData[k][2] ? bData[k][2] : ""
      });
    }
  }
  
  // Get user profiles data
  var profileSheet = ss.getSheetByName(SHEET_USER_PROFILES);
  var userProfiles = [];
  if (profileSheet) {
    var pData = profileSheet.getDataRange().getValues();
    for (var m = 1; m < pData.length; m++) {
      if(pData[m][0] == "") continue;
      userProfiles.push({
        schoolCode: pData[m][0],
        schoolName: pData[m][1],
        phone: pData[m][2],
        groupNumber: pData[m][3],
        principalName: pData[m][4],
        principalPhone: pData[m][5],
        leaderName: pData[m][6],
        leaderPhone: pData[m][7],
        leaderIC: pData[m][8],
        leaderGender: pData[m][9],
        leaderMembershipId: pData[m][10],
        leaderRace: pData[m][11],
        remarks: pData[m][12],
        lastUpdated: pData[m][13]
      });
    }
  }
  
  // Auto-inject leader from profile as PEMIMPIN for each badge type
  if (userProfiles.length > 0) {
    // Group submissions by schoolCode and badge to find unique combinations
    var schoolBadgeMap = {};
    for (var s = 0; s < submissions.length; s++) {
      var sub = submissions[s];
      var key = sub.schoolCode + '|' + sub.badge;
      if (!schoolBadgeMap[key]) {
        schoolBadgeMap[key] = { schoolCode: sub.schoolCode, school: sub.school, badge: sub.badge, date: sub.date };
      }
    }
    
    // For each school-badge combination, add leader if exists in profile
    for (var key in schoolBadgeMap) {
      var combo = schoolBadgeMap[key];
      var profile = null;
      
      // Find profile for this school
      for (var p = 0; p < userProfiles.length; p++) {
        if (userProfiles[p].schoolCode.toUpperCase() === combo.schoolCode.toUpperCase()) {
          profile = userProfiles[p];
          break;
        }
      }
      
      // If profile exists and has leaderName, add as PEMIMPIN
      if (profile && profile.leaderName) {
        submissions.push({
          rowIndex: 0,
          date: combo.date,
          school: combo.school,
          schoolCode: combo.schoolCode,
          badge: combo.badge,
          student: profile.leaderName.toUpperCase(),
          gender: profile.leaderGender || '',
          race: profile.leaderRace || '',
          id: profile.leaderMembershipId || '',
          icNumber: profile.leaderIC || '',
          studentPhone: profile.leaderPhone || '',
          role: 'PEMIMPIN',
          remarks: 'AUTO-ADD DARI PROFIL'
        });
      }
    }
  }
  
  var isOpen = SCRIPT_PROP.getProperty('IS_OPEN');
  var isRegistrationOpen = (isOpen === null || isOpen === 'true');
  
  // Get Negeri data
  var negeriSheet = ss.getSheetByName(SHEET_NEGERI);
  var negeriList = [];
  if (negeriSheet) {
    var nData = negeriSheet.getDataRange().getValues();
    for (var n = 1; n < nData.length; n++) {
      if(nData[n][0] == "") continue;
      negeriList.push({
        code: nData[n][0],
        name: nData[n][1],
        createdDate: nData[n][2]
      });
    }
  }
  
  // Get Daerah data
  var daerahSheet = ss.getSheetByName(SHEET_DAERAH);
  var daerahList = [];
  if (daerahSheet) {
    var dData = daerahSheet.getDataRange().getValues();
    for (var d = 1; d < dData.length; d++) {
      if(dData[d][0] == "") continue;
      daerahList.push({
        code: dData[d][0],
        name: dData[d][1],
        negeriCode: dData[d][2],
        createdDate: dData[d][3]
      });
    }
  }
  
  // HIERARCHICAL FILTERING BASED ON ROLE
  // Developer: sees everything (no filter)
  // Admin Negeri: sees only their negeri
  // Admin Daerah: sees only their daerah
  
  if (requestingRole === 'negeri' && requestingNegeriCode) {
    // Filter schools to only this negeri
    schools = schools.filter(function(s) { 
      return s.negeriCode === requestingNegeriCode; 
    });
    
    // Filter submissions to only this negeri
    submissions = submissions.filter(function(s) {
      // Find school for this submission
      var schoolCode = s.schoolCode;
      for (var si = 0; si < schools.length; si++) {
        if (schools[si].schoolCode === schoolCode) {
          return true;
        }
      }
      return false;
    });
    
    // Filter daerah to only this negeri
    daerahList = daerahList.filter(function(d) { 
      return d.negeriCode === requestingNegeriCode; 
    });
    
    // Keep only this negeri in negeriList
    negeriList = negeriList.filter(function(n) { 
      return n.code === requestingNegeriCode; 
    });
    
  } else if (requestingRole === 'daerah' && requestingDaerahCode) {
    // Filter schools to only this daerah
    schools = schools.filter(function(s) { 
      return s.daerahCode === requestingDaerahCode; 
    });
    
    // Filter submissions to only this daerah
    submissions = submissions.filter(function(s) {
      var schoolCode = s.schoolCode;
      for (var si = 0; si < schools.length; si++) {
        if (schools[si].schoolCode === schoolCode) {
          return true;
        }
      }
      return false;
    });
    
    // Keep only this daerah in daerahList
    daerahList = daerahList.filter(function(d) { 
      return d.code === requestingDaerahCode; 
    });
    
    // Find the negeri for this daerah
    var daerahNegeriCode = '';
    for (var di = 0; di < daerahList.length; di++) {
      if (daerahList[di].code === requestingDaerahCode) {
        daerahNegeriCode = daerahList[di].negeriCode;
        break;
      }
    }
    
    // Keep only the parent negeri
    negeriList = negeriList.filter(function(n) { 
      return n.code === daerahNegeriCode; 
    });
  }
  
  return { status: 'success', submissions: submissions, schools: schools, badges: badges, userProfiles: userProfiles, negeriList: negeriList, daerahList: daerahList, isRegistrationOpen: isRegistrationOpen };
}

function submitForm(p) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_DATA);
  if (!sheet) { setupDatabase(); sheet = ss.getSheetByName(SHEET_DATA); }
  var timestamp = p.customDate ? new Date(p.customDate) : new Date();
  
  // Lookup school location codes from SCHOOLS sheet
  var negeriCode = '';
  var daerahCode = '';
  var schoolsSheet = ss.getSheetByName(SHEET_SCHOOLS);
  if (schoolsSheet) {
    var schoolsData = schoolsSheet.getDataRange().getValues();
    for (var i = 1; i < schoolsData.length; i++) {
      if (String(schoolsData[i][1]).toUpperCase() === String(p.schoolCode).toUpperCase()) {
        negeriCode = schoolsData[i][2] || '';
        daerahCode = schoolsData[i][3] || '';
        break;
      }
    }
  }
  
  var rowsToAdd = [];
  function createRow(person, roleName) {
      return [timestamp, p.schoolName, p.schoolCode, negeriCode, daerahCode, p.badgeType, person.name.toUpperCase(), person.gender, person.race, person.membershipId ? person.membershipId.toUpperCase() : "", person.icNumber, person.phoneNumber, roleName, person.remarks || ""];
  }
  if (p.participants) p.participants.forEach(function(person) { if (person.name) rowsToAdd.push(createRow(person, p.badgeType === "Anugerah Rambu" ? "PENERIMA RAMBU" : "PESERTA")); });
  if (p.assistants) p.assistants.forEach(function(person) { if (person.name) rowsToAdd.push(createRow(person, "PENOLONG PEMIMPIN")); });
  if (p.examiners) p.examiners.forEach(function(person) { if (person.name) rowsToAdd.push(createRow(person, "PENGUJI")); });
  if (rowsToAdd.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, rowsToAdd[0].length).setValues(rowsToAdd);
  
  // Auto-sync leader info to USER_PROFILES sheet
  if (p.schoolCode && (p.principalName || p.principalPhone || p.leaderName || p.phone || p.leaderIC || p.leaderGender || p.leaderMembershipId || p.leaderRace)) {
    var profileSheet = ss.getSheetByName(SHEET_USER_PROFILES);
    if (!profileSheet) {
      profileSheet = ss.insertSheet(SHEET_USER_PROFILES);
      profileSheet.appendRow(["SchoolCode", "SchoolName", "Phone", "GroupNumber", "PrincipalName", "PrincipalPhone", "LeaderName", "LeaderPhone", "LeaderIC", "LeaderGender", "LeaderMembershipId", "LeaderRace", "Remarks", "LastUpdated"]);
    }
    
    var profileData = profileSheet.getDataRange().getValues();
    var schoolCode = String(p.schoolCode).toUpperCase();
    var profileRow = -1;
    
    // Find existing profile
    for (var i = 1; i < profileData.length; i++) {
      if (String(profileData[i][0]).toUpperCase() === schoolCode) {
        profileRow = i + 1;
        break;
      }
    }
    
    var now = new Date();
    
    if (profileRow === -1) {
      // Create new profile - groupNumber will be empty, user must set via Profile page
      profileSheet.appendRow([
        schoolCode,
        p.schoolName || '',
        p.phone || '',
        '', // groupNumber - empty by default, set via Profile
        p.principalName || '',
        p.principalPhone || '',
        p.leaderName || '',
        p.leaderPhone || '',
        p.leaderIC || '',
        p.leaderGender || '',
        p.leaderMembershipId || '',
        p.leaderRace || '',
        '',
        now
      ]);
    } else {
      // Update existing profile (only if new data provided, preserve groupNumber)
      if (p.schoolName) profileSheet.getRange(profileRow, 2).setValue(p.schoolName);
      if (p.phone) profileSheet.getRange(profileRow, 3).setValue(p.phone);
      // Note: Column 4 (groupNumber) is NOT updated from form - only via Profile page
      if (p.principalName) profileSheet.getRange(profileRow, 5).setValue(p.principalName);
      if (p.principalPhone) profileSheet.getRange(profileRow, 6).setValue(p.principalPhone);
      if (p.leaderName) profileSheet.getRange(profileRow, 7).setValue(p.leaderName);
      if (p.leaderPhone) profileSheet.getRange(profileRow, 8).setValue(p.leaderPhone);
      if (p.leaderIC) profileSheet.getRange(profileRow, 9).setValue(p.leaderIC);
      if (p.leaderGender) profileSheet.getRange(profileRow, 10).setValue(p.leaderGender);
      if (p.leaderMembershipId) profileSheet.getRange(profileRow, 11).setValue(p.leaderMembershipId);
      if (p.leaderRace) profileSheet.getRange(profileRow, 12).setValue(p.leaderRace);
      profileSheet.getRange(profileRow, 14).setValue(now);
    }
  }
  
  return createJSONOutput({ status: 'success', count: rowsToAdd.length });
}

function updateParticipantId(p) { var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_DATA); sheet.getRange(p.rowIndex, 8).setValue(p.newId); return createJSONOutput({ status: 'success' }); }

function deleteData(p) { var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_DATA); if (p.rowIndex) { sheet.deleteRow(p.rowIndex); return createJSONOutput({ status: 'success' }); } var data = sheet.getDataRange().getValues(); for (var i = 1; i < data.length; i++) { if (data[i][7] == p.id && data[i][4] == p.name) { sheet.deleteRow(i + 1); return createJSONOutput({ status: 'success' }); } } return createJSONOutput({ status: 'error', message: 'Rekod tidak dijumpai.' }); }

function migrateYear(p) { var ss = SpreadsheetApp.getActiveSpreadsheet(); var sheet = ss.getSheetByName(SHEET_DATA); var data = sheet.getDataRange().getValues(); var sourceYear = parseInt(p.sourceYear); var targetYear = parseInt(p.targetYear); var newRows = []; for (var i = 1; i < data.length; i++) { var rowDate = new Date(data[i][0]); var rowYear = rowDate.getFullYear(); var badge = data[i][3]; if (rowYear === sourceYear) { var newBadge = ""; if (badge === "Keris Gangsa") newBadge = "Keris Perak"; else if (badge === "Keris Perak") newBadge = "Keris Emas"; if (newBadge !== "") { var row = data[i].slice(); row[0] = targetYear + "-01-01"; row[3] = newBadge; row[7] = ""; row[11] = "MIGRASI DARI " + sourceYear; newRows.push(row); } } } if (newRows.length > 0) { sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows); return createJSONOutput({ status: 'success', count: newRows.length }); } else { return createJSONOutput({ status: 'error', message: 'Tiada data layak untuk migrasi.' }); } }

function addSchool(p) { 
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SCHOOLS); 
    // SCHOOLS: SchoolName | SchoolCode | NegeriCode | DaerahCode | AllowStudents | AllowAssistants | AllowExaminers | LockedBadges | ApprovedBadges
    sheet.appendRow([
        p.schoolName, 
        p.schoolCode || '', 
        p.negeriCode || '', 
        p.daerahCode || '', 
        true, // AllowStudents
        true, // AllowAssistants
        true, // AllowExaminers
        "", // LockedBadges
        ""  // ApprovedBadges
    ]); 
    return createJSONOutput({ status: 'success' }); 
}

function deleteSchool(p) { 
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SCHOOLS); 
    var data = sheet.getDataRange().getValues(); 
    for(var i=0; i<data.length; i++) { 
        // Match by schoolCode (more unique) or schoolName
        if(data[i][1] == p.schoolCode || data[i][0] == p.schoolName) { 
            sheet.deleteRow(i+1); 
            return createJSONOutput({ status: 'success' }); 
        } 
    } 
    return createJSONOutput({ status: 'error', message: 'Sekolah tak jumpa' }); 
}

function updateSchoolPermission(p) { var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SCHOOLS); var data = sheet.getDataRange().getValues(); var colIndex = -1; if (p.permissionType === 'students') colIndex = 2; else if (p.permissionType === 'assistants') colIndex = 3; else if (p.permissionType === 'examiners') colIndex = 4; for(var i=1; i<data.length; i++) { if(data[i][0] == p.schoolName) { if (p.permissionType === 'all') sheet.getRange(i+1, 2, 1, 3).setValue(p.status); else sheet.getRange(i+1, colIndex).setValue(p.status); return createJSONOutput({ status: 'success' }); } } return createJSONOutput({ status: 'error' }); }

function toggleSchoolEditBatch(p) { var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SCHOOLS); var lastRow = sheet.getLastRow(); if (lastRow <= 1) return createJSONOutput({ status: 'success' }); var colIndex = -1; if (p.permissionType === 'students') colIndex = 2; else if (p.permissionType === 'assistants') colIndex = 3; else if (p.permissionType === 'examiners') colIndex = 4; if (p.permissionType === 'all') sheet.getRange(2, 2, lastRow - 1, 3).setValue(p.status); else sheet.getRange(2, colIndex, lastRow - 1, 1).setValue(p.status); return createJSONOutput({ status: 'success' }); }

function updateSchoolBadgeStatus(p, type) { var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SCHOOLS); var data = sheet.getDataRange().getValues(); for(var i=1; i<data.length; i++) { if(data[i][0] == p.schoolName) { var locked = data[i][4] ? data[i][4].toString().split(',') : []; var approved = data[i][5] ? data[i][5].toString().split(',') : []; if (type === 'lock') { if (locked.indexOf(p.badge) === -1) locked.push(p.badge); } else if (type === 'unlock') { var index = locked.indexOf(p.badge); if (index > -1) locked.splice(index, 1); var appIndex = approved.indexOf(p.badge); if (appIndex > -1) approved.splice(appIndex, 1); } else if (type === 'approve') { if (approved.indexOf(p.badge) === -1) approved.push(p.badge); } sheet.getRange(i+1, 5).setValue(locked.join(',')); sheet.getRange(i+1, 6).setValue(approved.join(',')); return createJSONOutput({ status: 'success' }); } } return createJSONOutput({ status: 'error' }); }

// ---------------- Authentication: users ----------------
function loginUser(p) {
  migrateUserPasswordsIfNeeded();
  var user = getUserRecordBySchoolCode(p.schoolCode);
  if (!user) { recordFailedAttempt(p.schoolCode); return createJSONOutput({ status: 'error', message: 'Salah info.' }); }
  var rl = checkRateLimit(p.schoolCode);
  if (!rl.ok) { var wait = Math.ceil((rl.lockedUntil - Date.now())/1000); return createJSONOutput({ status:'error', message:'Too many attempts', waitSeconds: wait }); }
  var comp = hashPassword(p.password, user.salt || '');
  if (comp !== user.passwordHash) { recordFailedAttempt(p.schoolCode); return createJSONOutput({ status: 'error', message: 'Salah info.' }); }
  resetAttempts(p.schoolCode);
  return createJSONOutput({ status: 'success', user: { schoolName: user.schoolName, schoolCode: user.schoolCode, isLoggedIn: true } });
}

function registerUser(p) { 
  var existing = getUserRecordBySchoolCode(p.schoolCode); 
  if (existing) return createJSONOutput({ status: 'error', message: 'Kod sekolah ini telah didaftarkan.' }); 
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Lookup school location codes from SCHOOLS sheet
  var negeriCode = '';
  var daerahCode = '';
  var schoolExists = false;
  var schoolsSheet = ss.getSheetByName(SHEET_SCHOOLS);
  
  if (schoolsSheet) {
    var schoolsData = schoolsSheet.getDataRange().getValues();
    for (var i = 1; i < schoolsData.length; i++) {
      if (String(schoolsData[i][1]).toUpperCase() === String(p.schoolCode).toUpperCase()) {
        negeriCode = schoolsData[i][2] || '';
        daerahCode = schoolsData[i][3] || '';
        schoolExists = true;
        break;
      }
    }
    
    // If school doesn't exist in SCHOOLS sheet, create it (without location codes for now)
    // Admin will need to update location codes later via AdminPanel
    if (!schoolExists) {
      schoolsSheet.appendRow([
        p.schoolName,
        p.schoolCode,
        '', // NegeriCode - empty, admin must set later
        '', // DaerahCode - empty, admin must set later
        true, // AllowStudents
        true, // AllowAssistants
        true, // AllowExaminers
        '', // LockedBadges
        '', // ApprovedBadges
        new Date()
      ]);
    }
  }
  
  saveUserRecord(p.schoolName, p.schoolCode, p.password, p.secretKey, negeriCode, daerahCode); 
  return createJSONOutput({ status: 'success' }); 
}

function resetPassword(p) { var user = getUserRecordBySchoolCode(p.schoolCode); if (!user) return createJSONOutput({ status: 'error', message: 'Kod Sekolah tidak dijumpai.' }); if (user.secretKey != p.secretKey) return createJSONOutput({ status: 'error', message: 'Kata Kunci Keselamatan Salah.' }); updateUserPasswordByRow(user.rowIndex, p.newPassword); return createJSONOutput({ status: 'success' }); }

function changePassword(p) { var user = getUserRecordBySchoolCode(p.schoolCode); if (!user) return createJSONOutput({ status: 'error', message: 'Kod Sekolah tidak dijumpai.' }); var compOld = hashPassword(p.oldPassword, user.salt || ''); if (compOld !== user.passwordHash) return createJSONOutput({ status: 'error', message: 'Kata laluan lama salah.' }); updateUserPasswordByRow(user.rowIndex, p.newPassword); return createJSONOutput({ status: 'success' }); }

function updateUserProfile(p) {
  // Update user profile information in USER_PROFILES sheet (separate from USERS auth sheet)
  var schoolCode = sanitizeString(p.schoolCode);
  if (!schoolCode) return createJSONOutput({ status: 'error', message: 'Kod Sekolah diperlukan.' });
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_USER_PROFILES);
  
  // Create sheet if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_USER_PROFILES);
    sheet.appendRow(["SchoolCode", "SchoolName", "Phone", "GroupNumber", "PrincipalName", "PrincipalPhone", "LeaderName", "LeaderPhone", "LeaderIC", "LeaderGender", "LeaderMembershipId", "LeaderRace", "Remarks", "LastUpdated"]);
  }
  
  var data = sheet.getDataRange().getValues();
  var userRow = -1;
  
  // Find existing profile by schoolCode (column 1, index 0)
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toUpperCase() === String(schoolCode).toUpperCase()) {
      userRow = i + 1; // Sheet rows are 1-indexed
      break;
    }
  }
  
  // Get school name from USERS sheet
  var usersSheet = ss.getSheetByName(SHEET_USERS);
  var usersData = usersSheet.getDataRange().getValues();
  var schoolName = '';
  for (var j = 1; j < usersData.length; j++) {
    if (String(usersData[j][1]).toUpperCase() === String(schoolCode).toUpperCase()) {
      schoolName = usersData[j][0];
      break;
    }
  }
  
  var timestamp = new Date();
  
  if (userRow === -1) {
    // Create new profile row
    sheet.appendRow([
      schoolCode,
      schoolName,
      sanitizeString(p.phone || ''),
      sanitizeString(p.groupNumber || ''),
      sanitizeString(p.principalName || ''),
      sanitizeString(p.principalPhone || ''),
      sanitizeString(p.leaderName || ''),
      sanitizeString(p.leaderPhone || ''),
      sanitizeString(p.leaderIC || ''),
      sanitizeString(p.leaderGender || ''),
      sanitizeString(p.leaderMembershipId || ''),
      sanitizeString(p.leaderRace || ''),
      sanitizeString(p.remarks || ''),
      timestamp
    ]);
  } else {
    // Update existing profile row - update all fields
    sheet.getRange(userRow, 1).setValue(schoolCode);
    sheet.getRange(userRow, 2).setValue(schoolName);
    sheet.getRange(userRow, 3).setValue(sanitizeString(p.phone || ''));
    sheet.getRange(userRow, 4).setValue(sanitizeString(p.groupNumber || ''));
    sheet.getRange(userRow, 5).setValue(sanitizeString(p.principalName || ''));
    sheet.getRange(userRow, 6).setValue(sanitizeString(p.principalPhone || ''));
    sheet.getRange(userRow, 7).setValue(sanitizeString(p.leaderName || ''));
    sheet.getRange(userRow, 8).setValue(sanitizeString(p.leaderPhone || ''));
    sheet.getRange(userRow, 9).setValue(sanitizeString(p.leaderIC || ''));
    sheet.getRange(userRow, 10).setValue(sanitizeString(p.leaderGender || ''));
    sheet.getRange(userRow, 11).setValue(sanitizeString(p.leaderMembershipId || ''));
    sheet.getRange(userRow, 12).setValue(sanitizeString(p.leaderRace || ''));
    sheet.getRange(userRow, 13).setValue(sanitizeString(p.remarks || ''));
    sheet.getRange(userRow, 14).setValue(timestamp);
  }
  
  return createJSONOutput({ success: true, message: 'Profil berjaya dikemaskini.' });
}

function addBadgeType(p) { var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BADGES); sheet.appendRow([p.badgeType, true, ""]); return createJSONOutput({ status: 'success' }); }

function deleteBadgeType(p) { var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BADGES); var data = sheet.getDataRange().getValues(); for(var i=0; i<data.length; i++) { if(data[i][0] == p.badgeType) { sheet.deleteRow(i+1); return createJSONOutput({ status: 'success' }); } } return createJSONOutput({ status: 'error' }); }

function updateBadgeDeadline(p) { var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BADGES); var data = sheet.getDataRange().getValues(); for(var i=1; i<data.length; i++) { if(data[i][0] == p.badgeType) { sheet.getRange(i+1, 3).setValue(p.deadline); return createJSONOutput({ status: 'success' }); } } return createJSONOutput({ status: 'error' }); }

function toggleRegistration(p) { if (p.targetBadge) { var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BADGES); var data = sheet.getDataRange().getValues(); for(var i=1; i<data.length; i++) { if(data[i][0] == p.targetBadge) { sheet.getRange(i+1, 2).setValue(p.status); return createJSONOutput({ status: 'success' }); } } } else { SCRIPT_PROP.setProperty('IS_OPEN', p.status); return createJSONOutput({ status: 'success' }); } }

function setupDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // NEGERI Sheet (Developer only can manage)
  if (!ss.getSheetByName(SHEET_NEGERI)) { 
    var sNegeri = ss.insertSheet(SHEET_NEGERI); 
    sNegeri.appendRow(["NegeriCode", "NegeriName", "CreatedDate"]);
    // Pre-populate Malaysian states
    sNegeri.appendRow(["PRK", "PERAK", new Date()]);
    sNegeri.appendRow(["SEL", "SELANGOR", new Date()]);
    sNegeri.appendRow(["JHR", "JOHOR", new Date()]);
    sNegeri.appendRow(["KDH", "KEDAH", new Date()]);
    sNegeri.appendRow(["KEL", "KELANTAN", new Date()]);
    sNegeri.appendRow(["MLK", "MELAKA", new Date()]);
    sNegeri.appendRow(["NSN", "NEGERI SEMBILAN", new Date()]);
    sNegeri.appendRow(["PHG", "PAHANG", new Date()]);
    sNegeri.appendRow(["PNG", "PULAU PINANG", new Date()]);
    sNegeri.appendRow(["PLS", "PERLIS", new Date()]);
    sNegeri.appendRow(["SBH", "SABAH", new Date()]);
    sNegeri.appendRow(["SWK", "SARAWAK", new Date()]);
    sNegeri.appendRow(["TRG", "TERENGGANU", new Date()]);
    sNegeri.appendRow(["WPK", "WP KUALA LUMPUR", new Date()]);
    sNegeri.appendRow(["WPL", "WP LABUAN", new Date()]);
    sNegeri.appendRow(["WPP", "WP PUTRAJAYA", new Date()]);
  }
  
  // DAERAH Sheet (Developer only can manage)
  if (!ss.getSheetByName(SHEET_DAERAH)) { 
    var sDaerah = ss.insertSheet(SHEET_DAERAH); 
    sDaerah.appendRow(["DaerahCode", "DaerahName", "NegeriCode", "CreatedDate"]);
    // Sample districts for Perak
    sDaerah.appendRow(["PRK-KU", "KINTA UTARA", "PRK", new Date()]);
    sDaerah.appendRow(["PRK-KS", "KINTA SELATAN", "PRK", new Date()]);
    sDaerah.appendRow(["PRK-HT", "HILIR PERAK", "PRK", new Date()]);
    sDaerah.appendRow(["PRK-LP", "LARUT MATANG", "PRK", new Date()]);
  }
  
  // ADMINS Sheet (for Negeri & Daerah admins)
  if (!ss.getSheetByName(SHEET_ADMINS)) { 
    var sAdmins = ss.insertSheet(SHEET_ADMINS); 
    sAdmins.appendRow(["Username", "PasswordHash", "Salt", "Role", "NegeriCode", "DaerahCode", "FullName", "Phone", "Email", "CreatedDate", "LastLogin"]);
    // Role can be: 'negeri' or 'daerah'
  }
  
  // DATA Sheet - Enhanced with Negeri & Daerah
  if (!ss.getSheetByName(SHEET_DATA)) { 
    var s = ss.insertSheet(SHEET_DATA); 
    s.appendRow(["Date", "School", "SchoolCode", "NegeriCode", "DaerahCode", "Badge", "Student", "Gender", "Race", "ID", "IC", "SPhone", "Role", "Remarks"]); 
  }
  
  // SCHOOLS Sheet - Enhanced with Negeri & Daerah
  if (!ss.getSheetByName(SHEET_SCHOOLS)) { 
    var s2 = ss.insertSheet(SHEET_SCHOOLS); 
    s2.appendRow(["SchoolName", "SchoolCode", "NegeriCode", "DaerahCode", "AllowStud", "AllowAsst", "AllowExam", "LockedBadges", "ApprovedBadges", "CreatedDate"]); 
  }
  
  if (!ss.getSheetByName(SHEET_BADGES)) { 
    var s3 = ss.insertSheet(SHEET_BADGES); 
    s3.appendRow(["BadgeName", "IsOpen", "Deadline"]); 
    s3.appendRow(["Keris Gangsa", true, ""]); 
    s3.appendRow(["Keris Perak", true, ""]); 
    s3.appendRow(["Keris Emas", true, ""]); 
    s3.appendRow(["Anugerah Rambu", true, ""]); 
  }
  
  // USERS Sheet - Enhanced with Negeri & Daerah
  if (!ss.getSheetByName(SHEET_USERS)) { 
    var s4 = ss.insertSheet(SHEET_USERS); 
    s4.appendRow(["SchoolName", "SchoolCode", "NegeriCode", "DaerahCode", "PasswordHash", "Salt", "SecretKey", "CreatedDate"]); 
  }
  
  if (!ss.getSheetByName(SHEET_USER_PROFILES)) { 
    var s5 = ss.insertSheet(SHEET_USER_PROFILES); 
    s5.appendRow(["SchoolCode", "SchoolName", "NegeriCode", "DaerahCode", "Phone", "GroupNumber", "PrincipalName", "PrincipalPhone", "LeaderName", "LeaderPhone", "LeaderIC", "LeaderGender", "LeaderMembershipId", "LeaderRace", "Remarks", "LastUpdated"]); 
  }
}

function clearSheetData(target) { var ss = SpreadsheetApp.getActiveSpreadsheet(); var sheet = ss.getSheetByName(target); if (sheet) { var lastRow = sheet.getLastRow(); if (lastRow > 1) { sheet.deleteRows(2, lastRow - 1); } } }

// ---------------- Negeri & Daerah Management (Developer Only) ----------------
function addNegeri(p) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NEGERI);
  if (!sheet) return createJSONOutput({ status: 'error', message: 'Sheet NEGERI tidak wujud.' });
  sheet.appendRow([p.negeriCode, p.negeriName, new Date()]);
  return createJSONOutput({ status: 'success' });
}

function addDaerah(p) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_DAERAH);
  if (!sheet) return createJSONOutput({ status: 'error', message: 'Sheet DAERAH tidak wujud.' });
  sheet.appendRow([p.daerahCode, p.daerahName, p.negeriCode, new Date()]);
  return createJSONOutput({ status: 'success' });
}

function deleteNegeri(p) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NEGERI);
  var data = sheet.getDataRange().getValues();
  for(var i=0; i<data.length; i++) {
    if(data[i][0] == p.negeriCode) {
      sheet.deleteRow(i+1);
      return createJSONOutput({ status: 'success' });
    }
  }
  return createJSONOutput({ status: 'error', message: 'Negeri tidak dijumpai.' });
}

function deleteDaerah(p) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_DAERAH);
  var data = sheet.getDataRange().getValues();
  for(var i=0; i<data.length; i++) {
    if(data[i][0] == p.daerahCode) {
      sheet.deleteRow(i+1);
      return createJSONOutput({ status: 'success' });
    }
  }
  return createJSONOutput({ status: 'error', message: 'Daerah tidak dijumpai.' });
}

// ---------------- Admin Management (Regional Admins) ----------------
function addAdmin(p) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ADMINS);
  if (!sheet) return createJSONOutput({ status: 'error', message: 'Sheet ADMINS tidak wujud.' });
  
  // Check if username exists
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toUpperCase() === String(p.username).toUpperCase()) {
      return createJSONOutput({ status: 'error', message: 'Username sudah wujud.' });
    }
  }
  
  var salt = generateSalt();
  var hash = hashPassword(p.password, salt);
  
  sheet.appendRow([
    p.username,
    hash,
    salt,
    p.role, // 'negeri' or 'daerah'
    p.negeriCode || '',
    p.daerahCode || '',
    p.fullName || '',
    p.phone || '',
    p.email || '',
    new Date(),
    ''
  ]);
  
  return createJSONOutput({ status: 'success' });
}

function deleteAdmin(p) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ADMINS);
  var data = sheet.getDataRange().getValues();
  for(var i=1; i<data.length; i++) {
    if(data[i][0] == p.username) {
      sheet.deleteRow(i+1);
      return createJSONOutput({ status: 'success' });
    }
  }
  return createJSONOutput({ status: 'error', message: 'Admin tidak dijumpai.' });
}

function loginAdminRegional(p) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ADMINS);
  if (!sheet) return createJSONOutput({ status: 'error', message: 'Sistem admin tidak tersedia.' });
  
  var username = (p.username || '').toString().trim();
  var inputPass = (p.password || '').toString();
  
  if (!username || !inputPass) {
    return createJSONOutput({ status: 'error', message: 'Sila isi nama pengguna dan kata laluan.' });
  }
  
  var rl = checkRateLimit('admin_regional_' + username);
  if (!rl.ok) {
    var wait = Math.ceil((rl.lockedUntil - Date.now())/1000);
    return createJSONOutput({ status:'error', message: 'Terlalu banyak cubaan', waitSeconds: wait });
  }
  
  var data = sheet.getDataRange().getValues();
  
  // Check if sheet has data
  if (data.length <= 1) {
    return createJSONOutput({ status: 'error', message: 'Tiada admin didaftarkan. Sila hubungi pentadbir sistem.' });
  }
  
  for (var i = 1; i < data.length; i++) {
    var dbUsername = String(data[i][0]).trim();
    
    if (dbUsername.toUpperCase() === username.toUpperCase()) {
      var hash = String(data[i][1]);
      var salt = String(data[i][2]);
      var role = String(data[i][3]).toLowerCase();
      var negeriCode = String(data[i][4] || '');
      var daerahCode = String(data[i][5] || '');
      var fullName = String(data[i][6] || '');
      
      // Validate role
      if (role !== 'negeri' && role !== 'daerah') {
        return createJSONOutput({ status: 'error', message: 'Jenis akaun tidak sah. Sila hubungi pentadbir.' });
      }
      
      // Check password
      var comp = hashPassword(inputPass, salt);
      if (comp !== hash) {
        recordFailedAttempt('admin_regional_' + username);
        return createJSONOutput({ status: 'error', message: 'Kata laluan salah.' });
      }
      
      // Update last login (column 11 = K)
      sheet.getRange(i+1, 11).setValue(new Date());
      
      resetAttempts('admin_regional_' + username);
      
      // Return with scope information for hierarchical access
      return createJSONOutput({
        status: 'success',
        admin: {
          role: role,
          username: username,
          fullName: fullName,
          negeriCode: negeriCode,
          daerahCode: daerahCode,
          scope: {
            canManageNegeri: false, // Only developer can
            canManageDaerah: false, // Only developer can
            canManageSchools: true,
            canManageBadges: true,
            canViewAllNegeri: false,
            canViewAllDaerah: role === 'negeri',
            negeriAccess: negeriCode ? [negeriCode] : [],
            daerahAccess: daerahCode ? [daerahCode] : (role === 'negeri' ? 'ALL_IN_NEGERI' : [])
          }
        }
      });
    }
  }
  
  recordFailedAttempt('admin_regional_' + username);
  return createJSONOutput({ status: 'error', message: 'Nama pengguna tidak dijumpai.' });
}

function changeAdminRegionalPassword(p) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ADMINS);
  if (!sheet) return createJSONOutput({ status: 'error', message: 'Sistem admin tidak tersedia.' });
  
  var username = (p.username || '').toString();
  var role = (p.role || '').toString();
  var newPassword = (p.newPassword || '').toString();
  
  if (!newPassword) {
    return createJSONOutput({ status: 'error', message: 'Kata laluan baru diperlukan.' });
  }
  
  // Find admin record by username
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var currentUsername = String(data[i][0]);
    var currentRole = String(data[i][3]);
    
    if (currentUsername.toUpperCase() === username.toUpperCase() && currentRole === role) {
      // Generate new salt and hash
      var salt = generateSalt();
      var hash = hashPassword(newPassword, salt);
      
      // Update password hash (column 2) and salt (column 3)
      sheet.getRange(i+1, 2).setValue(hash);
      sheet.getRange(i+1, 3).setValue(salt);
      
      // Update last modified timestamp (column 12)
      sheet.getRange(i+1, 12).setValue(new Date());
      
      return createJSONOutput({ 
        status: 'success', 
        message: 'Kata laluan berjaya dikemaskini.' 
      });
    }
  }
  
  return createJSONOutput({ 
    status: 'error', 
    message: 'Admin tidak dijumpai.' 
  });
}

function createJSONOutput(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
