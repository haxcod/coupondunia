/**
 * Minimal ambient type declarations for `nodemailer` (v9).
 *
 * The installed `nodemailer` package ships no bundled `.d.ts` files and no
 * `@types/nodemailer` is installed, so under `strict` TypeScript an import would
 * fail with TS7016. We declare only the small surface the app actually uses
 * (creating an SMTP transport and sending a single mail), keeping the project
 * free of an extra dependency while remaining type-safe.
 */
declare module 'nodemailer' {
  export interface SmtpAuth {
    user: string;
    pass: string;
  }

  export interface TransportOptions {
    host?: string;
    port?: number;
    secure?: boolean;
    auth?: SmtpAuth;
  }

  export interface SendMailOptions {
    from?: string;
    to?: string | string[];
    replyTo?: string;
    subject?: string;
    text?: string;
    html?: string;
  }

  export interface SentMessageInfo {
    messageId: string;
    accepted: string[];
    rejected: string[];
    response: string;
  }

  export interface Transporter {
    sendMail(mailOptions: SendMailOptions): Promise<SentMessageInfo>;
    verify(): Promise<true>;
  }

  export function createTransport(options: TransportOptions): Transporter;

  const nodemailer: {
    createTransport: typeof createTransport;
  };

  export default nodemailer;
}
