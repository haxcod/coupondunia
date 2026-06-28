/**
 * `GET /api/public/search` — public catalog search endpoint (Task 9.1).
 *
 * Contract (design "HTTP API Contracts"):
 *   `GET /api/public/search?q=&type=`
 *     → `200 { products, productCount, deals, dealCount }`
 *     → empty matches still succeed with empty collections (Req 21.2)
 *     → missing / malformed params → `400 { error: { field?, message } }` (Req 21.7)
 *
 * Query parameters (validated by {@link searchParamsSchema}, Req 21.1, 11.10):
 *   - `q`    : required, 1–100 characters
 *   - `type` : optional, one of "product" | "deal" | "all" (defaults to "all")
 *
 * The handler delegates matching to the {@link search} Search_Service, which
 * returns up to {@link MAX_RESULTS} (50) items per collection within the
 * latency budget (Req 21.1). This handler reads request-specific data
 * (`searchParams`) and queries the database, so it runs at request time and is
 * never prerendered.
 */
import type { NextRequest } from 'next/server';
import { search } from '@/lib/search-service';
import { searchParamsSchema, validate } from '@/lib/validation';

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;

  // Only forward `type` when the caller actually supplied it, so the schema's
  // `.default('all')` applies for an omitted param while a present-but-invalid
  // value (e.g. `type=foo` or `type=`) is rejected as malformed (Req 21.7).
  const rawType = params.get('type');
  const candidate: { q: string | null; type?: string | null } = {
    q: params.get('q'),
  };
  if (rawType !== null) {
    candidate.type = rawType;
  }

  const result = validate(searchParamsSchema, candidate);
  if (!result.success) {
    // Malformed/missing parameter — identify the offending field, mutate nothing.
    return Response.json({ error: result.error }, { status: 400 });
  }

  const results = await search({ q: result.data.q, type: result.data.type });
  return Response.json(results, { status: 200 });
}
