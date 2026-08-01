import {
  Schema,
  model,
  models,
  type Model,
  type Types,
} from 'mongoose';
import { ENTITY_STATUSES, LINK_TARGETS, type EntityStatus, type LinkTarget } from './types';

export interface IBanner {
  _id: Types.ObjectId;
  internalName: string;
  imageUrl: string;
  mobileImageUrl: string | null;
  headline: string | null;
  ctaText: string | null;
  linkUrl: string;
  linkTarget: LinkTarget;
  displayOrder: number;
  status: EntityStatus;
  createdAt: Date;
}

const bannerSchema = new Schema<IBanner>(
  {
    internalName: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
    imageUrl: { type: String, required: true },
    mobileImageUrl: { type: String, default: null },
    headline: { type: String, default: null, maxlength: 100 },
    ctaText: { type: String, default: null, maxlength: 30 },
    linkUrl: { type: String, default: '' },
    linkTarget: { type: String, enum: LINK_TARGETS, default: 'same_tab' },
    displayOrder: { type: Number, default: 0, min: 0, max: 9999 },
    status: { type: String, enum: ENTITY_STATUSES, default: 'active' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Composite sort index: active banners ordered by ascending display order
// for the hero carousel (Req 1.3, 18.7).
bannerSchema.index({ status: 1, displayOrder: 1 });

export const Banner: Model<IBanner> =
  (models.Banner as Model<IBanner>) ?? model<IBanner>('Banner', bannerSchema);
