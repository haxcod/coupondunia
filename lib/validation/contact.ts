/**
 * Contact-form schema (Req 12.2, 12.3, 12.5, 21.5).
 *
 * Name 1–100, Email valid & ≤254, Subject 1–150, Message 1–2000.
 */
import { z } from 'zod';
import { boundedString, emailField } from './primitives';

export const contactSchema = z.object({
  name: boundedString(1, 100),
  email: emailField,
  subject: boundedString(1, 150),
  message: boundedString(1, 2000),
});

export type ContactInput = z.infer<typeof contactSchema>;
