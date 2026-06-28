/**
 * Edge/proxy-safe session cookie constant.
 *
 * `proxy.ts` performs an optimistic, cookie-presence-only admin gate and must
 * stay lightweight: it cannot import the full `@/lib/auth` module, which pulls
 * in `bcrypt`, `jose`, Mongoose models, and `next/headers` (none of which are
 * appropriate to evaluate at the proxy boundary).
 *
 * To keep a single source of truth for the cookie name without dragging those
 * dependencies into the proxy, the constant lives here and is re-exported from
 * `@/lib/auth` for the request-scoped auth consumers.
 */

/** Name of the httpOnly Administrator session cookie (Req 13.2). */
export const SESSION_COOKIE_NAME = 'dealspark_admin_session';
