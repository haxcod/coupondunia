import {
  Schema,
  model,
  models,
  type Model,
  type Types,
} from 'mongoose';

export interface IAdminUser {
  _id: Types.ObjectId;
  email: string;
  /** bcrypt hash (Req 13.6). */
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const adminUserSchema = new Schema<IAdminUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

export const AdminUser: Model<IAdminUser> =
  (models.AdminUser as Model<IAdminUser>) ??
  model<IAdminUser>('AdminUser', adminUserSchema);
