import {
  Schema,
  model,
  models,
  type Model,
  type Types,
} from 'mongoose';
import {
  ENTITY_STATUSES,
  isValidPaise,
  type EntityStatus,
} from './types';

export interface IProduct {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  storeId: Types.ObjectId;
  categoryId: Types.ObjectId;
  /** Current price in integer paise (Req design money convention). */
  currentPrice: number;
  /** Original price in integer paise; must be > currentPrice when present. */
  originalPrice: number | null;
  /** Derived 1..100 (Req 16.6). */
  discountPercent: number | null;
  primaryImageUrl: string;
  additionalImages: string[];
  description: string;
  keyFeatures: string[];
  /** Never projected to public HTML (Req 7.9). */
  affiliateUrl: string;
  buttonLabel: string;
  offerExpiresAt: Date | null;
  featured: boolean;
  status: EntityStatus;
  viewCount: number;
  clickCount: number;
  lastVerifiedAt: Date;
  metaTitle: string | null;
  metaDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const paiseValidator = {
  validator: isValidPaise,
  message: 'Price must be an integer number of paise within 0.01–999,999,999.99.',
};

const productSchema = new Schema<IProduct>(
  {
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    // Store-scoped, case-sensitive unique slug (Req 24.12, 23.3/23.5).
    slug: { type: String, required: true, unique: true, maxlength: 200 },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    currentPrice: { type: Number, required: true, validate: paiseValidator },
    originalPrice: { type: Number, default: null, validate: paiseValidator },
    discountPercent: { type: Number, default: null, min: 1, max: 100 },
    primaryImageUrl: { type: String, required: true },
    additionalImages: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= 4,
        message: 'A product may have at most 4 additional images.',
      },
    },
    description: { type: String, default: '' },
    keyFeatures: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= 8 && v.every((f) => f.length <= 120),
        message: 'A product may have at most 8 key features of up to 120 characters each.',
      },
    },
    affiliateUrl: { type: String, required: true },
    buttonLabel: { type: String, default: 'VIEW DEAL' },
    offerExpiresAt: { type: Date, default: null },
    featured: { type: Boolean, default: false },
    status: { type: String, enum: ENTITY_STATUSES, default: 'active' },
    viewCount: { type: Number, default: 0, min: 0 },
    clickCount: { type: Number, default: 0, min: 0 },
    lastVerifiedAt: { type: Date, default: Date.now },
    metaTitle: { type: String, default: null },
    metaDescription: { type: String, default: null },
  },
  { timestamps: true },
);

// Composite sort indexes backing the five category sort modes (Req 5.5) and
// featured/popular listings (Req 1.8, 14.4). Each starts with the hot filter
// fields (status, categoryId) followed by the sort key.
productSchema.index({ status: 1, categoryId: 1, currentPrice: 1 }); // Price Low-High
productSchema.index({ status: 1, categoryId: 1, clickCount: -1 }); // popularity / top-N
productSchema.index({ status: 1, categoryId: 1, viewCount: -1 }); // Most Popular
productSchema.index({ status: 1, categoryId: 1, createdAt: -1 }); // Newest
productSchema.index({ status: 1, categoryId: 1, discountPercent: -1 }); // Biggest Discount
productSchema.index({ status: 1, featured: 1, createdAt: -1 }); // featured section
productSchema.index({ storeId: 1, status: 1 }); // store-scoped lookups
// Text index across the product's searchable text fields (Req 11.3).
productSchema.index({ title: 'text', description: 'text' });

export const Product: Model<IProduct> =
  (models.Product as Model<IProduct>) ?? model<IProduct>('Product', productSchema);
