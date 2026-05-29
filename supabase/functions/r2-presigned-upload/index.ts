// Supabase Edge Function: r2-presigned-upload
// Generate presigned URL untuk upload terus dari browser ke Cloudflare R2
// tanpa dedahkan credentials.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import {
  AwsClient,
} from 'https://esm.sh/aws4fetch@1.0.20';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface PresignRequest {
  fileName: string;
  contentType: string;
  fileSize?: number;
  folder?: string; // cth: "leader-xyz/ic", "course-abc/template"
  bucket?: 'documents' | 'certificates' | 'templates';
}

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/pdf',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Validate auth (basic - hanya pastikan ada anon key valid)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Authorization required' }, 401);
    }

    const body: PresignRequest = await req.json();

    // Validation
    if (!body.fileName || typeof body.fileName !== 'string') {
      return jsonResponse({ error: 'fileName diperlukan' }, 400);
    }
    if (!body.contentType || !ALLOWED_TYPES.includes(body.contentType)) {
      return jsonResponse({
        error: `Jenis fail tidak dibenarkan. Hanya: ${ALLOWED_TYPES.join(', ')}`,
      }, 400);
    }
    if (body.fileSize && body.fileSize > MAX_FILE_SIZE) {
      return jsonResponse({
        error: `Saiz fail melebihi had ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      }, 400);
    }

    // R2 credentials dari environment
    const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID');
    const R2_ACCESS_KEY = Deno.env.get('R2_ACCESS_KEY_ID');
    const R2_SECRET_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY');
    const R2_BUCKET = Deno.env.get('R2_BUCKET_NAME') || 'scoutnadi';
    const R2_PUBLIC_URL = Deno.env.get('R2_PUBLIC_URL'); // cth: https://pub-xxx.r2.dev atau custom domain

    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
      return jsonResponse({ error: 'R2 not configured on server' }, 500);
    }

    // Build object key
    const ext = (body.fileName.split('.').pop() || 'bin').toLowerCase();
    const folderPrefix = body.folder ? `${sanitizeFolder(body.folder)}/` : '';
    const bucketFolder = body.bucket || 'documents';
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 10);
    const objectKey = `${bucketFolder}/${folderPrefix}${timestamp}-${random}.${ext}`;

    // Generate presigned PUT URL (valid 5 min)
    const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const url = new URL(`${endpoint}/${R2_BUCKET}/${objectKey}`);
    url.searchParams.set('X-Amz-Expires', '300');

    const aws = new AwsClient({
      accessKeyId: R2_ACCESS_KEY,
      secretAccessKey: R2_SECRET_KEY,
      region: 'auto',
      service: 's3',
    });

    const signed = await aws.sign(
      new Request(url, {
        method: 'PUT',
        headers: {
          'Content-Type': body.contentType,
        },
      }),
      { aws: { signQuery: true } },
    );

    const publicUrl = R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL.replace(/\/$/, '')}/${objectKey}`
      : `${endpoint}/${R2_BUCKET}/${objectKey}`;

    return jsonResponse({
      uploadUrl: signed.url,
      publicUrl,
      objectKey,
      expiresIn: 300,
      contentType: body.contentType,
    });
  } catch (err) {
    console.error('r2-presigned-upload error:', err);
    return jsonResponse({ error: (err as Error).message || 'Internal error' }, 500);
  }
});

function sanitizeFolder(folder: string): string {
  return folder
    .replace(/\.\./g, '')
    .replace(/[^a-zA-Z0-9_\-/]/g, '')
    .replace(/^\/+|\/+$/g, '')
    .slice(0, 100);
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
