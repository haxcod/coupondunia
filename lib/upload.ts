/**
 * Image upload domain logic for DealSpark (Task 9.4, Req 22).
 *
 * This module is split into two concerns so the rules can be exercised without
 * an HTTP request:
 *
 *  - {@link validateUpload} is a **pure** predicate that maps an upload
 *    candidate (its declared content type and byte size) to either an accepted
 *    result or a specific, named error. It encodes the entire decision table
 *    from Requirement 22 — supported types (Req 22.1), unsupported type
 *    (Req 22.3), oversize (Req 22.4), and missing/empty file (Req 22.5) — and
 *    is the unit under test for Property 17 (Task 9.5).
 *  - {@link storeUpload} performs the side-effecting write to S3-compatible
 *    object storage and returns a resolvable public URL (Req 22.1).
 *
 * The route handler (`app/api/admin/upload/route.ts`) is responsible only for
 * the session guard (Req 22.2) and for translating these results into HTTP
 * responses; all of the accept/reject logic lives here.
 */
import { randomUUID } from 'node:crypto';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

// ---------------------------------------------------------------------------
// Constants (exported for reuse by tests and the route handler)
// ---------------------------------------------------------------------------

/** The MIME types accepted by `/api/admin/upload` (Req 22.1). */
export const ALLOWED_UPLOAD_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export type AllowedUploadType = (typeof ALLOWED_UPLOAD_TYPES)[number];

/** Smallest accepted upload: 1 byte (Req 22.1 lower bound). */
export const MIN_UPLOAD_BYTES = 1;

/** Largest accepted upload: 5 MB (Req 22.1 upper bound / Req 22.4). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** File extension chosen for each accepted MIME type. */
const EXTENSION_BY_TYPE: Record<AllowedUploadType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// ---------------------------------------------------------------------------
// Pure validation (Req 22.1, 22.3, 22.4, 22.5) — the unit under Property 17
// ---------------------------------------------------------------------------

/**
 * The distinct ways an upload candidate can be rejected. Each maps to an HTTP
 * 400 in the route handler, with a message identifying the problem.
 */
export type UploadValidationErrorCode =
  | 'missing_file' // no file attached (Req 22.5)
  | 'empty_file' // a file was attached but is 0 bytes (Req 22.1 lower bound)
  | 'unsupported_type' // not JPEG/PNG/WebP/GIF (Req 22.3)
  | 'file_too_large'; // larger than 5 MB (Req 22.4)

export interface UploadValidationFailure {
  ok: false;
  error: UploadValidationErrorCode;
  message: string;
}

export interface UploadValidationSuccess {
  ok: true;
  /** The validated, supported content type, narrowed for {@link storeUpload}. */
  contentType: AllowedUploadType;
}

export type UploadValidationResult =
  | UploadValidationSuccess
  | UploadValidationFailure;

/**
 * An upload candidate described purely by its declared content type and size.
 *
 * A `null`/`undefined` `contentType` or `size` represents "no file attached"
 * (Req 22.5), letting the route handler delegate even the missing-file case to
 * this single source of truth.
 */
export interface UploadCandidate {
  contentType: string | null | undefined;
  size: number | null | undefined;
}

/** Type guard: whether a declared content type is one of the accepted MIME types. */
export function isAllowedUploadType(
  contentType: string | null | undefined,
): contentType is AllowedUploadType {
  return (
    typeof contentType === 'string' &&
    (ALLOWED_UPLOAD_TYPES as readonly string[]).includes(contentType)
  );
}

/**
 * Decide whether an upload candidate is acceptable, returning the validated
 * content type on success or a specific error on failure.
 *
 * Decision order (each rejection is mutually exclusive and deterministic):
 *  1. No file attached → `missing_file` (Req 22.5).
 *  2. Unsupported MIME type → `unsupported_type` (Req 22.3).
 *  3. Larger than 5 MB → `file_too_large` (Req 22.4).
 *  4. Smaller than 1 byte (i.e. empty) → `empty_file` (Req 22.1 lower bound).
 *  5. Otherwise accept (Req 22.1).
 */
export function validateUpload({
  contentType,
  size,
}: UploadCandidate): UploadValidationResult {
  // (1) No file attached at all (Req 22.5).
  if (contentType == null || size == null) {
    return {
      ok: false,
      error: 'missing_file',
      message: 'A file is required.',
    };
  }

  // (2) Unsupported file type (Req 22.3).
  if (!isAllowedUploadType(contentType)) {
    return {
      ok: false,
      error: 'unsupported_type',
      message:
        'Unsupported file type. Allowed types are JPEG, PNG, WebP, and GIF.',
    };
  }

  // (3) Oversize (Req 22.4).
  if (size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: 'file_too_large',
      message: 'File exceeds the maximum allowed size of 5 MB.',
    };
  }

  // (4) Empty / sub-minimum file (Req 22.1 lower bound of 1 byte).
  if (size < MIN_UPLOAD_BYTES) {
    return {
      ok: false,
      error: 'empty_file',
      message: 'A file is required.',
    };
  }

  // (5) Accept (Req 22.1).
  return { ok: true, contentType };
}

// ---------------------------------------------------------------------------
// Object-storage persistence (Req 22.1)
// ---------------------------------------------------------------------------

interface UploadStorageConfig {
  bucket: string;
  region: string;
  /** Custom endpoint for S3-compatible providers (MinIO, R2, Spaces, …). */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Optional CDN/public base URL that serves the bucket's objects. */
  publicBaseUrl?: string;
  /** Path-style addressing is required by most S3-compatible providers. */
  forcePathStyle: boolean;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Configure object storage to enable image uploads.`,
    );
  }
  return value;
}

/** Read and validate the object-storage configuration from the environment. */
function readStorageConfig(): UploadStorageConfig {
  const endpoint = process.env.S3_ENDPOINT?.trim() || undefined;
  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL?.trim() || undefined;
  return {
    bucket: requireEnv('S3_BUCKET'),
    region: process.env.S3_REGION?.trim() || 'us-east-1',
    endpoint,
    accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
    publicBaseUrl,
    // Default to path-style when a custom endpoint is used (S3-compatible),
    // otherwise honour an explicit opt-in.
    forcePathStyle:
      process.env.S3_FORCE_PATH_STYLE === 'true' || endpoint !== undefined,
  };
}

let cachedClient: S3Client | null = null;
let cachedClientKey: string | null = null;

function getClient(config: UploadStorageConfig): S3Client {
  // Re-create the client only when the resolved configuration changes (keeps
  // tests that mutate env vars correct while avoiding per-request churn).
  const key = `${config.region}|${config.endpoint ?? ''}|${config.accessKeyId}|${config.forcePathStyle}`;
  if (cachedClient && cachedClientKey === key) {
    return cachedClient;
  }
  cachedClient = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  cachedClientKey = key;
  return cachedClient;
}

/** Build a resolvable public URL for a stored object key (Req 22.1). */
function buildPublicUrl(config: UploadStorageConfig, key: string): string {
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl.replace(/\/+$/, '')}/${key}`;
  }
  if (config.endpoint) {
    const base = config.endpoint.replace(/\/+$/, '');
    return config.forcePathStyle
      ? `${base}/${config.bucket}/${key}`
      : `${base}/${key}`;
  }
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
}

export interface StoredUpload {
  /** A publicly accessible URL that resolves to the stored image (Req 22.1). */
  url: string;
  /** The object key within the bucket. */
  key: string;
}

export interface StoreUploadInput {
  body: Uint8Array;
  contentType: AllowedUploadType;
}

/**
 * Persist an accepted image to S3-compatible object storage under a random,
 * collision-resistant key and return a resolvable public URL (Req 22.1).
 */
export async function storeUpload({
  body,
  contentType,
}: StoreUploadInput): Promise<StoredUpload> {
  const config = readStorageConfig();
  const client = getClient(config);
  const key = `uploads/${randomUUID()}.${EXTENSION_BY_TYPE[contentType]}`;

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  return { url: buildPublicUrl(config, key), key };
}
