import { supabase, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from './supabaseClient';

// ============================================================
// CLOUDFLARE R2 CLIENT
// ============================================================
// Upload terus dari browser ke R2 menggunakan presigned URL
// yang digenerate oleh Supabase Edge Function (server-side).
// Credentials R2 TIDAK PERNAH dedahkan ke browser.

export interface UploadResult {
  success: boolean;
  url?: string;
  objectKey?: string;
  message?: string;
}

export type R2Bucket = 'documents' | 'certificates' | 'templates';

interface PresignResponse {
  uploadUrl: string;
  publicUrl: string;
  objectKey: string;
  expiresIn: number;
  contentType: string;
  error?: string;
}

/**
 * Step 1: Minta presigned URL dari edge function
 * Step 2: Browser PUT terus ke R2 guna URL tu
 * Step 3: Return public URL untuk simpan dalam DB
 */
export async function uploadToR2(
  file: File,
  options: {
    folder?: string;
    bucket?: R2Bucket;
    onProgress?: (percent: number) => void;
  } = {},
): Promise<UploadResult> {
  try {
    if (!file) {
      return { success: false, message: 'Fail tidak dipilih.' };
    }

    // Validate size client-side dulu (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return { success: false, message: 'Saiz fail melebihi 10MB.' };
    }

    // Step 1: Dapatkan presigned URL
    const presignRes = await fetch(`${EDGE_FUNCTION_URL}/r2-presigned-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
        folder: options.folder,
        bucket: options.bucket || 'documents',
      }),
    });

    const presignData: PresignResponse = await presignRes.json();

    if (!presignRes.ok || presignData.error) {
      return {
        success: false,
        message: presignData.error || 'Gagal menjana URL upload.',
      };
    }

    // Step 2: Upload terus ke R2
    const uploadRes = await uploadWithProgress(
      presignData.uploadUrl,
      file,
      presignData.contentType,
      options.onProgress,
    );

    if (!uploadRes.ok) {
      return {
        success: false,
        message: `Upload ke R2 gagal (HTTP ${uploadRes.status}).`,
      };
    }

    return {
      success: true,
      url: presignData.publicUrl,
      objectKey: presignData.objectKey,
    };
  } catch (err: any) {
    console.error('uploadToR2 error:', err);
    return {
      success: false,
      message: err.message || 'Ralat sistem semasa upload.',
    };
  }
}

/**
 * Upload guna XMLHttpRequest supaya boleh track progress
 */
function uploadWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress?: (percent: number) => void,
): Promise<{ ok: boolean; status: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', contentType);

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status });
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
}

// Re-export untuk kemudahan
export { supabase };
