import {
  Schema,
  model,
  models,
  type Model,
  type Types,
} from 'mongoose';
import {
  CLICK_EVENT_TTL_SECONDS,
  CLICK_TYPES,
  DEVICE_TYPES,
  MAX_REFERRER_LENGTH,
  MAX_USER_AGENT_LENGTH,
  type ClickType,
  type DeviceType,
} from './types';

/**
 * Anonymous click record. Deliberately stores NO personally identifiable
 * information (no IP, email, name, phone, government id, or account id) per
 * Req 27.1/27.2 — the schema below has no field that could hold such data.
 */
export interface IClickEvent {
  _id: Types.ObjectId;
  clickType: ClickType;
  productId: Types.ObjectId | null;
  dealId: Types.ObjectId | null;
  deviceType: DeviceType;
  referrer: string;
  userAgent: string;
  createdAt: Date;
}

const clickEventSchema = new Schema<IClickEvent>(
  {
    clickType: { type: String, enum: CLICK_TYPES, required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    dealId: { type: Schema.Types.ObjectId, ref: 'Deal', default: null },
    deviceType: { type: String, enum: DEVICE_TYPES, default: 'unknown' },
    referrer: { type: String, default: '', maxlength: MAX_REFERRER_LENGTH },
    userAgent: { type: String, default: '', maxlength: MAX_USER_AGENT_LENGTH },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    // Reject unknown keys so PII-bearing fields can never be silently persisted.
    strict: 'throw',
  },
);

// MongoDB TTL index: documents expire 90 days after createdAt (Req 27.3/27.4).
// The application-level sweep (task 5.9) complements this for deterministic
// deletion semantics in tests.
clickEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: CLICK_EVENT_TTL_SECONDS });
// Trailing-window analytics aggregation by type (Req 14.x / 19.x).
clickEventSchema.index({ clickType: 1, createdAt: -1 });
clickEventSchema.index({ productId: 1, createdAt: -1 });
clickEventSchema.index({ dealId: 1, createdAt: -1 });

export const ClickEvent: Model<IClickEvent> =
  (models.ClickEvent as Model<IClickEvent>) ??
  model<IClickEvent>('ClickEvent', clickEventSchema);
