import {
  Schema,
  model,
  models,
  type Model,
  type Types,
} from 'mongoose';

export interface IContactMessage {
  _id: Types.ObjectId;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: Date;
}

const contactMessageSchema = new Schema<IContactMessage>(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
    email: { type: String, required: true, trim: true, minlength: 1, maxlength: 254 },
    subject: { type: String, required: true, trim: true, minlength: 1, maxlength: 150 },
    message: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

contactMessageSchema.index({ createdAt: -1 });

export const ContactMessage: Model<IContactMessage> =
  (models.ContactMessage as Model<IContactMessage>) ??
  model<IContactMessage>('ContactMessage', contactMessageSchema);
