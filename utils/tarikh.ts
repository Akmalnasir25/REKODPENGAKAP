// ============================================================
// Pemformat tarikh Melayu.
//
// KENAPA INI WUJUD
//   Intl memendekkan Ogos kepada "Ogo" untuk locale ms-MY. Itu bukan
//   singkatan yang digunakan sesiapa dalam bahasa Melayu — Ogos memang
//   ditulis penuh. Bulan lain betul semuanya, jadi hanya jadual di bawah
//   yang diperlukan, bukan pemformat tersuai sepenuhnya.
//
//   Ia diletak di sini dan bukan disalin ke setiap skrin kerana ia pernah
//   muncul di tujuh tempat berasingan, dan yang seterusnya akan salah lagi.
// ============================================================

const BULAN_PENDEK = [
  'Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun',
  'Jul', 'Ogos', 'Sep', 'Okt', 'Nov', 'Dis',
];

/**
 * "09 Ogos 2026". Tarikh tidak sah atau kosong memulangkan '-' — skrin yang
 * memaparkan "Invalid Date" kelihatan seperti sistem rosak.
 */
export const tarikhPendek = (
  input?: string | number | Date | null,
  hariDuaDigit = true,
): string => {
  if (input === null || input === undefined || input === '') return '-';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '-';
  const hari = hariDuaDigit ? String(d.getDate()).padStart(2, '0') : String(d.getDate());
  return `${hari} ${BULAN_PENDEK[d.getMonth()]} ${d.getFullYear()}`;
};
