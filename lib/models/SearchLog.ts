import {
  Schema,
  model,
  models,
  type Model,
  type Types,
} from 'mongoose';

/** Anonymous search-query log used for admin search analytics (Req 19.8). */
export interface ISearchLog {
  _id: Types.ObjectId;
  query: string;
  resultCount: number;
  createdAt: Date;
}

const searchLogSchema = new Schema<ISearchLog>(
  {
    query: { type: String, required: true, trim: true, maxlength: 200 },
    resultCount: { type: Number, required: true, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

searchLogSchema.index({ createdAt: -1 });
searchLogSchema.index({ query: 1, createdAt: -1 });

export const SearchLog: Model<ISearchLog> =
  (models.SearchLog as Model<ISearchLog>) ??
  model<ISearchLog>('SearchLog', searchLogSchema);
