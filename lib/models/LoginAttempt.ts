import {
  Schema,
  model,
  models,
  type Model,
  type Types,
} from 'mongoose';

/**
 * Records each admin login attempt so the Auth_Service can enforce lockout
 * after 5 consecutive failures within a 15-minute window (Req 13.5).
 */
export interface ILoginAttempt {
  _id: Types.ObjectId;
  email: string;
  successful: boolean;
  createdAt: Date;
}

const loginAttemptSchema = new Schema<ILoginAttempt>(
  {
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    successful: { type: Boolean, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Window queries for lockout evaluation, newest first.
loginAttemptSchema.index({ email: 1, createdAt: -1 });
// Housekeeping: drop attempt records automatically after 24 hours.
loginAttemptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86_400 });

export const LoginAttempt: Model<ILoginAttempt> =
  (models.LoginAttempt as Model<ILoginAttempt>) ??
  model<ILoginAttempt>('LoginAttempt', loginAttemptSchema);
