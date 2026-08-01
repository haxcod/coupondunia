/**
 * SMTP mailer helper (Nodemailer) — admin notification emails (Req 12.3, 21.5).
 *
 * This module centralizes the pluggable SMTP transport described in the design
 * ("Email: SMTP via Nodemailer"). Configuration is read entirely from
 * environment variables so the same code runs in dev, test, and production:
 *
 *   - `SMTP_HOST`   — SMTP server host (required; when absent, mail is disabled)
 *   - `SMTP_PORT`   — SMTP port (default 587)
 *   - `SMTP_SECURE` — `"true"` to use TLS on connect (defaults to true for 465)
 *   - `SMTP_USER` / `SMTP_PASS` — optional auth credentials
 *   - `SMTP_FROM`   — From header (defaults to SMTP_USER or `no-reply@<host>`)
 *
 * The transport is created lazily and cached for the lifetime of the process so
 * we do not rebuild a connection pool on every request. Callers are expected to
 * treat email dispatch as best-effort: the contact route persists the
 * `ContactMessage` first and never lets a send failure roll that back
 * (Req 12.6 / 21.6).
 */
import nodemailer, { type Transporter } from 'nodemailer';

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

/**
 * Resolve SMTP configuration from the environment. Returns `null` when no SMTP
 * host is configured, signalling that email dispatch is disabled for this
 * deployment (the caller treats this as a no-op rather than an error).
 */
function readSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? user ?? `no-reply@${host}`;

  return { host, port, secure, user, pass, from };
}

// Cache the transport (and the config it was built from) across invocations.
let cachedTransport: Transporter | null = null;
let cachedFrom: string | null = null;

function getTransport(): { transport: Transporter; from: string } | null {
  const config = readSmtpConfig();
  if (!config) return null;

  if (!cachedTransport) {
    cachedTransport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth:
        config.user && config.pass
          ? { user: config.user, pass: config.pass }
          : undefined,
    });
    cachedFrom = config.from;
  }

  return { transport: cachedTransport, from: cachedFrom ?? config.from };
}

/** Escape a string for safe interpolation into the HTML email body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Payload for the contact-form admin notification email. */
export interface ContactNotification {
  /** Configured admin recipient (Settings.contactEmail or an env fallback). */
  recipient: string;
  name: string;
  email: string;
  subject: string;
  message: string;
}

/**
 * Send the admin notification email for a contact-form submission.
 *
 * Throws when no SMTP transport is configured or when the underlying send
 * fails; the caller is responsible for catching so that a failure here never
 * discards the already-persisted `ContactMessage` (Req 12.6 / 21.6).
 */
export async function sendContactNotification(
  input: ContactNotification,
): Promise<void> {
  const mailer = getTransport();
  if (!mailer) {
    throw new Error('SMTP transport is not configured (SMTP_HOST is unset).');
  }

  const heading = `New contact message: ${input.subject}`;
  const text = [
    heading,
    '',
    `Name:    ${input.name}`,
    `Email:   ${input.email}`,
    `Subject: ${input.subject}`,
    '',
    'Message:',
    input.message,
  ].join('\n');

  const html = [
    `<h2>${escapeHtml(heading)}</h2>`,
    `<p><strong>Name:</strong> ${escapeHtml(input.name)}</p>`,
    `<p><strong>Email:</strong> ${escapeHtml(input.email)}</p>`,
    `<p><strong>Subject:</strong> ${escapeHtml(input.subject)}</p>`,
    `<p><strong>Message:</strong></p>`,
    `<p style="white-space:pre-wrap">${escapeHtml(input.message)}</p>`,
  ].join('');

  await mailer.transport.sendMail({
    from: mailer.from,
    to: input.recipient,
    replyTo: input.email,
    subject: `[DealSpark Contact] ${input.subject}`,
    text,
    html,
  });
}
