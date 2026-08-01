import {
  Schema,
  model,
  models,
  type Model,
  type Types,
} from 'mongoose';

export interface IStore {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdAt: Date;
}

const storeSchema = new Schema<IStore>(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
    // Case-sensitive unique slug (Req 23.3/23.5): MongoDB's default binary
    // collation makes a plain unique index case-sensitive.
    slug: { type: String, required: true, unique: true, maxlength: 200 },
    logoUrl: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Text index for search across store name (Req 11.3).
storeSchema.index({ name: 'text' });

export const Store: Model<IStore> =
  (models.Store as Model<IStore>) ?? model<IStore>('Store', storeSchema);
