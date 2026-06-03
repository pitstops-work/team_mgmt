import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';

// We use access: 'public' in client uploads, which requires a token for a
// PUBLIC Blob store. The project has two stores — a private one whose token
// landed in BLOB_READ_WRITE_TOKEN, and a public one whose token landed in
// BLOBS_READ_WRITE_TOKEN. Prefer the public-store token; fall back so the
// route still works if only the default name is set.
function pickToken(): string | undefined {
  return process.env.BLOBS_READ_WRITE_TOKEN
    || process.env.BLOB_READ_WRITE_TOKEN
    || undefined;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      token: pickToken(),
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/vnd.ms-powerpoint',
          'image/jpeg',
          'image/png',
          'text/plain',
          'text/markdown',
        ],
        maximumSizeInBytes: 50 * 1024 * 1024,
      }),
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
