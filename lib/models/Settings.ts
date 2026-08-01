import {
  Schema,
  model,
  models,
  type Model,
  type Types,
} from 'mongoose';

export interface ISocialLinks {
  facebook: string;
  instagram: string;
  twitter: string;
  youtube: string;
}

/**
 * Singleton site-settings document. Uniqueness of the `singletonKey` index
 * guarantees at most one settings row ever exists (Req 20.x).
 */
export interface ISettings {
  _id: Types.ObjectId;
  singletonKey: 'global';
  siteName: string;
  tagline: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  contactEmail: string;
  adminEmailNotifications: boolean;
  defaultMetaTitleSuffix: string;
  defaultMetaDescription: string;
  ga4MeasurementId: string;
  searchConsoleCode: string;
  social: ISocialLinks;
  defaultAffiliateDisclosure: string;
  createdAt: Date;
  updatedAt: Date;
}

const socialSchema = new Schema<ISocialLinks>(
  {
    facebook: { type: String, default: '' },
    instagram: { type: String, default: '' },
    twitter: { type: String, default: '' },
    youtube: { type: String, default: '' },
  },
  { _id: false },
);

const settingsSchema = new Schema<ISettings>(
  {
    singletonKey: {
      type: String,
      enum: ['global'],
      default: 'global',
      unique: true,
      required: true,
    },
    siteName: { type: String, default: 'DealSpark' },
    tagline: { type: String, default: '' },
    logoUrl: { type: String, default: null },
    faviconUrl: { type: String, default: null },
    contactEmail: { type: String, default: '' },
    adminEmailNotifications: { type: Boolean, default: true },
    defaultMetaTitleSuffix: { type: String, default: ' | DealSpark' },
    defaultMetaDescription: { type: String, default: '' },
    ga4MeasurementId: { type: String, default: '' },
    searchConsoleCode: { type: String, default: '' },
    social: { type: socialSchema, default: () => ({}) },
    defaultAffiliateDisclosure: { type: String, default: '' },
  },
  { timestamps: true },
);

export const Settings: Model<ISettings> =
  (models.Settings as Model<ISettings>) ??
  model<ISettings>('Settings', settingsSchema);
