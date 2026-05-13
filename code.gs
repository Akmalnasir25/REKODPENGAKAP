/**
 * Repair DATA row with multiple student names in one cell.
 *
 * Target issue:
 * - Sheet: DATA
 * - Row: 1516
 * - Column G / Student contains 4 names in one cell.
 *
 * What this script does:
 * 1. Creates a backup sheet before changes.
 * 2. Replaces row 1516 with the first student name.
 * 3. Inserts 3 new rows below row 1516 for the remaining names.
 * 4. Copies the same school/program/date fields to each new row.
 * 5. Clears ID, IC, phone, role, and remarks for the split rows unless you fill them later.
 *
 * How to use:
 * 1. Open Google Sheet linked to the system.
 * 2. Extensions > Apps Script.
 * 3. Paste this file into Code.gs.
 * 4. Run: repairSriKintaMergedStudentCell
 * 5. Approve permission if asked.
 */
function repairSriKintaMergedStudentCell() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('DATA');

  if (!sheet) {
    throw new Error("Sheet 'DATA' tidak dijumpai.");
  }

  const targetRow = 1516;
  const totalColumns = 14; // A:N based on current DATA structure

  const expectedSchool = 'SK SRI KINTA';
  const expectedSchoolCode = 'ABB2075';
  const expectedBadge = 'Keris Emas';

  const names = [
    'QIESYA IZZ ZARA BINTI MUHAMAD NAZRI',
    'MOHAMAD ARFAN KHAIRY BIN ADI IRWANTO',
    'QAISARA NUR AISYAH BINTI MUHAMMAD HAFRIZ',
    'NUR SHAFFIQAH QASEH BINTI MOHAMAD HASHIM'
  ];

  const rowValues = sheet.getRange(targetRow, 1, 1, totalColumns).getValues()[0];

  // DATA columns:
  // A Date
  // B School
  // C SchoolCode
  // D NegeriCode
  // E DaerahCode
  // F Badge
  // G Student
  // H Gender
  // I Race
  // J ID
  // K IC
  // L SPhone
  // M Role
  // N Remarks
  const school = String(rowValues[1] || '').trim();
  const schoolCode = String(rowValues[2] || '').trim();
  const badge = String(rowValues[5] || '').trim();
  const currentStudentCell = String(rowValues[6] || '').trim();

  if (school !== expectedSchool || schoolCode !== expectedSchoolCode || badge !== expectedBadge) {
    throw new Error(
      'Row sasaran tidak sepadan. Script dibatalkan untuk elak ubah row yang salah.\n\n' +
      'Dijumpai:\n' +
      'School: ' + school + '\n' +
      'SchoolCode: ' + schoolCode + '\n' +
      'Badge: ' + badge
    );
  }

  const alreadyFixed = names.includes(currentStudentCell) && !currentStudentCell.includes('\n');
  if (alreadyFixed) {
    Logger.log('Row 1516 nampaknya sudah dibetulkan. Tiada perubahan dibuat.');
    return;
  }

  createBackupSheet_(ss, sheet);

  // Prepare rows. Each row keeps same Date/School/SchoolCode/NegeriCode/DaerahCode/Badge.
  // Student is changed one-by-one.
  const fixedRows = names.map(function(name) {
    const newRow = rowValues.slice();
    newRow[6] = name;       // G Student
    newRow[7] = '';         // H Gender - kosongkan untuk semakan/manual update
    newRow[8] = '';         // I Race
    newRow[9] = '';         // J ID
    newRow[10] = '';        // K IC
    newRow[11] = '';        // L SPhone
    newRow[12] = 'PESERTA'; // M Role
    newRow[13] = 'Dibaiki daripada cell bergabung DATA!G1516 pada ' + new Date().toLocaleString('ms-MY');
    return newRow;
  });

  // Replace original row with first student.
  sheet.getRange(targetRow, 1, 1, totalColumns).setValues([fixedRows[0]]);

  // Insert remaining rows below target row, then write them.
  sheet.insertRowsAfter(targetRow, fixedRows.length - 1);
  sheet.getRange(targetRow + 1, 1, fixedRows.length - 1, totalColumns).setValues(fixedRows.slice(1));

  Logger.log('Selesai: DATA!G1516 telah dipecahkan kepada ' + names.length + ' row berasingan.');
}

/**
 * Create a backup copy of DATA before repair.
 */
function createBackupSheet_(ss, sourceSheet) {
  const timestamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyyMMdd_HHmmss');
  const backupName = 'DATA_BACKUP_BEFORE_REPAIR_' + timestamp;

  const backupSheet = sourceSheet.copyTo(ss);
  backupSheet.setName(backupName);
  ss.setActiveSheet(sourceSheet);

  Logger.log('Backup dibuat: ' + backupName);
}
