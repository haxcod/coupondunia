/**
 * `POST /api/admin/upload` — administrator image upload (Task 9.4, Req 22).
 *
 * Responsibilities of this handler (the accept/reject rules themselves live in
 * `lib/upload.ts` so they can be unit/property-tested without HTTP):
 *
 *  - Session guard: reject any request without a valid administrator session
 *    with HTTP 401 and store nothing (Req 22.2, 13.8).
 *  - Read the multipart `file` field via `request.formData()`.
 *  - Validate the file's declared content type and size through
 *    {@link validateUpload}; on failure return HTTP 400 with a per-field error
 *    envelope identifying the problem (Req 22.3, 22.4, 22.5).
 *  - On success, persist the bytes to object storage and return HTTP 200 with a
 *    resolvable public URL (Req 22.1).
 *
 * Route Handlers are not cached and run at request time; reading `formData()`
 * (a request body API) keeps this handler dynamic per the Next.js 16 model.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { requireAdminSession } from '@/lib/admin-guard';
import { storeUpload, validateUpload } from '@/lib/upload';

/** The multipart form field carrying the image. */
const FILE_FIELD = 'file';

function errorResponse(message: string, status: number, field?: string) {
  return NextResponse.json(
    { error: field === undefined ? { message } : { field, message } },
    { status },
  );
}

export async function POST(request: NextRequest) {
  // (1) Authoritative session guard (Req 22.2 / 13.8): 401 and store nothing.
  const guard = await requireAdminSession();
  if (!guard.ok) {
    return guard.response;
  }

  // (2) Parse the multipart body. A malformed/absent body means no file.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse('A file is required.', 400, FILE_FIELD);
  }

  const entry = formData.get(FILE_FIELD);
  const file = entry instanceof File ? entry : null;

  // (3) Validate type + size (and the missing-file case) via the pure rules.
  const validation = validateUpload(
    file === null
      ? { contentType: null, size: null }
      : { contentType: file.type, size: file.size },
  );

  if (!validation.ok) {
    // Every validation failure maps to HTTP 400 (Req 22.3, 22.4, 22.5).
    return errorResponse(validation.message, 400, FILE_FIELD);
  }

  // `file` is non-null here: a null file always fails validation above.
  const bytes = new Uint8Array(await (file as File).arrayBuffer());

  // (4) Persist and return a resolvable public URL (Req 22.1).
  try {
    const stored = await storeUpload({
      body: bytes,
      contentType: validation.contentType,
    });
    return NextResponse.json({ url: stored.url }, { status: 200 });
  } catch {
    return errorResponse('Failed to store the uploaded image.', 500);
  }
}
