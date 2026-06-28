import {
  Schema,
  model,
  models,
  type HydratedDocument,
  type Model,
  type Types,
} from 'mongoose';
import {
  DEAL_TYPES,
  ENTITY_STATUSES,
  isValidPaise,
  type DealType,
  type EntityStatus,
} from './types';

export interface IDeal {
  _id: Types.ObjectId;
  headline: string;
  slug: string;
  storeId: Types.ObjectId;
  categoryId: Types.ObjectId;
  dealType: DealType;
  /** Required & 1..50 when dealType === 'coupon_code'. */
  couponCode: string | null;
  /** Never projected to public HTML (Req 7.9). */
  destinationUrl: string;
  discountValue: string | null;
  buttonLabel: string | null;
  terms: string | null;
  /** 3..5 steps rendered on the deal page (Req 8.8). */
  howToUseSteps: string[];
  validFrom: Date | null;
  validUntil: Date | null;
  /** Money fields stored in integer paise. */
  minOrderValue: number | null;
  maxDiscountCap: number | null;
  applicableFor: string | null;
  featured: boolean;
  status: EntityStatus;
  clickCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const paiseValidator = {
  validator: isValidPaise,
  message: 'Money values must be an integer number of paise within range.',
};

const dealSchema = new Schema<IDeal>(
  {
    headline: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    // Store-scoped, case-sensitive unique slug (Req 24.12, 23.3/23.5).
    slug: { type: String, required: true, unique: true, maxlength: 200 },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    dealType: { type: String, enum: DEAL_TYPES, required: true },
    couponCode: {
      type: String,
      default: null,
      maxlength: 50,
    },
    destinationUrl: { type: String, required: true, maxlength: 2048 },
    discountValue: { type: String, default: null },
    buttonLabel: { type: String, default: null },
    terms: { type: String, default: null },
    howToUseSteps: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => v.length === 0 || (v.length >= 3 && v.length <= 5),
        message: 'How-to-use steps must contain between 3 and 5 entries when provided.',
      },
    },
    validFrom: { type: Date, default: null },
    validUntil: {
      type: Date,
      default: null,
    },
    minOrderValue: { type: Number, default: null, validate: paiseValidator },
    maxDiscountCap: { type: Number, default: null, validate: paiseValidator },
    applicableFor: { type: String, default: null },
    featured: { type: Boolean, default: false },
    status: { type: String, enum: ENTITY_STATUSES, default: 'active' },
    clickCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// Conditional/cross-field rules that depend on sibling values (Req 17.7, 17.9).
dealSchema.pre('validate', function enforceDealInvariants(this: HydratedDocument<IDeal>) {
  // coupon_code deals require a non-empty code of 1–50 characters.
  if (this.dealType === 'coupon_code') {
    const code = this.couponCode;
    if (typeof code !== 'string' || code.trim().length < 1 || code.length > 50) {
      this.invalidate(
        'couponCode',
        'A coupon-code deal requires a coupon code of 1–50 characters.',
      );
    }
  }
  // Date ordering: validFrom <= validUntil.
  if (this.validFrom && this.validUntil && this.validFrom.getTime() > this.validUntil.getTime()) {
    this.invalidate('validUntil', 'validUntil must be on or after validFrom.');
  }
});

// Composite sort indexes: deals listing by desc creation (Req 10.1) and
// featured "Today's Best Coupons" (Req 1.11).
dealSchema.index({ status: 1, createdAt: -1 });
dealSchema.index({ status: 1, featured: 1, createdAt: -1 });
dealSchema.index({ storeId: 1, status: 1, createdAt: -1 }); // store-scoped deals
dealSchema.index({ categoryId: 1, status: 1 });
// Text index across the deal's searchable text fields (Req 11.3).
dealSchema.index({ headline: 'text', couponCode: 'text' });

export const Deal: Model<IDeal> =
  (models.Deal as Model<IDeal>) ?? model<IDeal>('Deal', dealSchema);
