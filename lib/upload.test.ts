// Feature: dealspark, Property 17: Upload validation maps inputs to accept or the correct error
//
// Property 17: Upload validation maps inputs to accept or the correct error
// "For any (MIME type, byte size, presence) triple sent to the upload endpoint,
//  the request succeeds with a resolvable public URL if and only if a file is
//  present, its type is one of JPEG/PNG/WebP/GIF, and its size is between 1 byte
//  and 5 MB; otherwise it is rejected with a 400 whose reason corresponds to the
//  specific violation (missing file, unsupported type, or oversize)."
//
// Validates: Requirements 22.1, 22.3, 22.4, 22.5
//
// `validateUpload` is pure (no DB, no I/O), so this property exercises the full
// decision table directly. We generate (contentType, size) candidates that span
// every branch — null/undefined (no file), allowed/disallowed MIME types, and
// sizes below 1, in range, and above 5 MB — and assert the result matches an
// independent oracle that re-implements the same decision order:
//
//   missing_file → unsupported_type → file_too_large → empty_file → accept

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  MIN_UPLOAD_BYTES,
  validateUpload,
  type UploadCandidate,
  type UploadValidationErrorCode,
} from '@/lib/upload';

// ---------------------------------------------------------------------------
// Independent oracle: the expected error code (or null for "accept") for a
// candidate, encoding the same precedence as the unit under test but written
// independently so a regression in either side is caught.
// ---------------------------------------------------------------------------
function expectedError(
  candidate: UploadCandidate,
): UploadValidationErrorCode | null {
  const { contentType, size } = candidate;
  if (contentType == null || size == null) return 'missing_file';
  if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(contentType)) {
    return 'unsupported_type';
  }
  if (size > MAX_UPLOAD_BYTES) return 'file_too_large';
  if (size < MIN_UPLOAD_BYTES) return 'empty_file';
  return null;
}

// ---------------------------------------------------------------------------
// Generators spanning every branch of the decision table.
// ---------------------------------------------------------------------------

// contentType: a mix of "no type" (null/undefined), allowed MIME types, and a
// broad set of disallowed strings (incl. near-misses like SVG and PDF).
const contentTypeArb: fc.Arbitrary<string | null | undefined> = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constantFrom(...ALLOWED_UPLOAD_TYPES),
  fc.constantFrom(
    'image/svg+xml',
    'image/bmp',
    'image/tiff',
    'application/pdf',
    'text/plain',
    'video/mp4',
    'image/jpg', // common-but-invalid alias
    '',
    'IMAGE/PNG', // case-sensitive: not allowed
  ),
  fc.string(),
);

// size: a mix of "no size" (null/undefined), sub-minimum (incl. 0 and
// negatives), the exact valid boundaries, in-range values, and oversize values
// (incl. exactly MAX + 1).
const sizeArb: fc.Arbitrary<number | null | undefined> = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.integer({ min: -1000, max: 0 }), // empty / sub-minimum
  fc.constantFrom(MIN_UPLOAD_BYTES, MAX_UPLOAD_BYTES), // valid boundaries
  fc.integer({ min: MIN_UPLOAD_BYTES, max: MAX_UPLOAD_BYTES }), // in range
  fc.constantFrom(MAX_UPLOAD_BYTES + 1, MAX_UPLOAD_BYTES * 2), // oversize
  fc.integer({ min: MAX_UPLOAD_BYTES + 1, max: MAX_UPLOAD_BYTES * 10 }),
);

const candidateArb: fc.Arbitrary<UploadCandidate> = fc.record({
  contentType: contentTypeArb,
  size: sizeArb,
});

describe('Property 17: Upload validation maps inputs to accept or the correct error', () => {
  it('maps every (contentType, size) candidate to accept or the correct error code', () => {
    fc.assert(
      fc.property(candidateArb, (candidate) => {
        const result = validateUpload(candidate);
        const oracle = expectedError(candidate);

        if (oracle === null) {
          // Accept iff present, allowed type, and size within [1, MAX].
          expect(result.ok).toBe(true);
          if (result.ok) {
            // Accepted result echoes the validated content type unchanged.
            expect(result.contentType).toBe(candidate.contentType);
          }
        } else {
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error).toBe(oracle);
            // Every rejection carries a non-empty, human-readable message.
            expect(typeof result.message).toBe('string');
            expect(result.message.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
