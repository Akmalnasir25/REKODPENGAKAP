import { supabase } from './supabaseClient';
import { LOGO_URL } from '../constants';

// ============================================================
// LOGO SERVICE - Upload & Fetch logos for negeri/daerah
// Uses Supabase Storage bucket: 'logos'
// ============================================================

const BUCKET_NAME = 'logos';

/**
 * Upload logo for negeri or daerah
 * @param file - The image file to upload
 * @param type - 'negeri' or 'daerah'
 * @param code - The negeri/daerah code
 * @returns Public URL of uploaded logo
 */
export const uploadLogo = async (
  file: File,
  type: 'negeri' | 'daerah',
  code: string
): Promise<string> => {
  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
  const filePath = `${type}/${code}.${fileExt}`;

  // Remove old logo if exists (any extension)
  try {
    const { data: existingFiles } = await supabase.storage
      .from(BUCKET_NAME)
      .list(type, { search: code });

    if (existingFiles && existingFiles.length > 0) {
      const toRemove = existingFiles
        .filter(f => f.name.startsWith(code))
        .map(f => `${type}/${f.name}`);
      if (toRemove.length > 0) {
        await supabase.storage.from(BUCKET_NAME).remove(toRemove);
      }
    }
  } catch (e) {
    // Ignore cleanup errors
  }

  // Upload new logo
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    });

  if (error) throw new Error(`Gagal muat naik logo: ${error.message}`);

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);

  return urlData.publicUrl;
};

/**
 * Get logo URL for a specific negeri or daerah
 * @param type - 'negeri' or 'daerah'
 * @param code - The negeri/daerah code
 * @returns Public URL or null if not found
 */
export const getLogoUrl = async (
  type: 'negeri' | 'daerah',
  code: string
): Promise<string | null> => {
  if (!code) return null;

  try {
    const { data: files, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(type, { search: code });

    if (error || !files || files.length === 0) return null;

    const logoFile = files.find(f => f.name.startsWith(code));
    if (!logoFile) return null;

    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(`${type}/${logoFile.name}`);

    return urlData.publicUrl;
  } catch (e) {
    // Bucket doesn't exist or network error - return null silently
    return null;
  }
};

/**
 * Resolve the correct logo to use based on priority:
 * 1. Daerah logo (if uploaded)
 * 2. Negeri logo (if uploaded)
 * 3. Default logo (LOGO_URL from constants)
 */
export const resolveLogoUrl = async (
  negeriCode?: string,
  daerahCode?: string
): Promise<string> => {
  try {
    // Try daerah logo first
    if (daerahCode) {
      const daerahLogo = await getLogoUrl('daerah', daerahCode);
      if (daerahLogo) return daerahLogo;
    }

    // Try negeri logo
    if (negeriCode) {
      const negeriLogo = await getLogoUrl('negeri', negeriCode);
      if (negeriLogo) return negeriLogo;
    }
  } catch (e) {
    // Any error - fallback to default
  }

  // Fallback to default
  return LOGO_URL;
};

/**
 * Delete logo for negeri or daerah
 */
export const deleteLogo = async (
  type: 'negeri' | 'daerah',
  code: string
): Promise<void> => {
  try {
    const { data: files } = await supabase.storage
      .from(BUCKET_NAME)
      .list(type, { search: code });

    if (files && files.length > 0) {
      const toRemove = files
        .filter(f => f.name.startsWith(code))
        .map(f => `${type}/${f.name}`);
      if (toRemove.length > 0) {
        await supabase.storage.from(BUCKET_NAME).remove(toRemove);
      }
    }
  } catch (e) {
    // Ignore errors
  }
};
