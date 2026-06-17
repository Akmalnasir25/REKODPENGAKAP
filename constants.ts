


// Legacy Apps Script endpoint sudah ditamatkan — data kini melalui Supabase.
// Nilai sentinel bukan-kosong dikekalkan kerana beberapa guard lama masih
// menyemak `!scriptUrl` (login admin, hantar borang, dll). Ia TIDAK digunakan
// untuk sebarang permintaan rangkaian — Supabase mengabaikannya sepenuhnya.
export const DEFAULT_SERVER_URL = "supabase";
export const APP_VERSION = "";

export const LOCAL_STORAGE_KEYS = {
  SCRIPT_URL: 'APPS_SCRIPT_URL',
  LEADER_CACHE: 'LEADER_INFO_CACHE',
  SESSION: 'USER_SESSION_DATA'
};

// Logo Configuration
export const LOGO_URL = "/logo-default.png";