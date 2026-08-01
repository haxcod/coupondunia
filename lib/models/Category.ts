import {
  Schema,
  model,
  models,
  type Model,
  type Types,
} from 'mongoose';
import { ENTITY_STATUSES, type EntityStatus } from './types';
import { Product } from './Product';

export interface ICategory {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  parentId: Types.ObjectId | null;
  iconUrl: string | null;
  description: string | null;
  showOnHomepage: boolean;
  homepageSectionTitle: string | null;
  displayOrder: number;
  status: EntityStatus;
  metaTitle: string | null;
  metaDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Raised when a category cannot be deleted because dependent child categories
 * or products still reference it (Req 15.10). MongoDB has no foreign-key
 * constraints, so this guard is enforced at the application layer.
 */
export class CategoryHasDependentsError extends Error {
  constructor(
    public readonly categoryId: string,
    public readonly childCategoryCount: number,
    public readonly productCount: number,
  ) {
    super(
      `Category ${categoryId} cannot be deleted while it has dependents ` +
        `(${childCategoryCount} child categories, ${productCount} products).`,
    );
    this.name = 'CategoryHasDependentsError';
  }
}

export interface CategoryModel extends Model<ICategory> {
  /**
   * Throws {@link CategoryHasDependentsError} if the category still has child
   * categories or associated products. Call before deleting (Req 15.10).
   */
  assertDeletable(categoryId: Types.ObjectId | string): Promise<void>;
}

const categorySchema = new Schema<ICategory, CategoryModel>(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
    // Case-sensitive unique slug (Req 23.3/23.5).
    slug: { type: String, required: true, unique: true, maxlength: 200 },
    parentId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    iconUrl: { type: String, default: null },
    description: { type: String, default: null },
    showOnHomepage: { type: Boolean, default: false },
    homepageSectionTitle: { type: String, default: null },
    displayOrder: { type: Number, default: 0, min: 0, max: 9999 },
    status: { type: String, enum: ENTITY_STATUSES, default: 'active' },
    metaTitle: { type: String, default: null },
    metaDescription: { type: String, default: null },
  },
  { timestamps: true },
);

// Composite sort index for homepage / listing ordering (Req 4.3, 1.8).
categorySchema.index({ status: 1, displayOrder: 1, name: 1 });
// Fast child-category lookups for the referential guard.
categorySchema.index({ parentId: 1 });
// Text index for search across category name (Req 11.3).
categorySchema.index({ name: 'text' });

categorySchema.statics.assertDeletable = async function assertDeletable(
  this: CategoryModel,
  categoryId: Types.ObjectId | string,
): Promise<void> {
  const [childCategoryCount, productCount] = await Promise.all([
    this.countDocuments({ parentId: categoryId }),
    Product.countDocuments({ categoryId }),
  ]);
  if (childCategoryCount > 0 || productCount > 0) {
    throw new CategoryHasDependentsError(
      String(categoryId),
      childCategoryCount,
      productCount,
    );
  }
};

/** Extract the target category id from a delete query's filter, if present. */
function categoryIdFromFilter(filter: Record<string, unknown>): unknown {
  if (!filter) return undefined;
  const id = filter._id;
  // Only guard single-document deletes addressed by a concrete _id.
  if (typeof id === 'string' || (id && typeof id === 'object' && 'toString' in id)) {
    return id;
  }
  return undefined;
}

// Query-middleware guards so deletes through the model also enforce Req 15.10.
async function guardQueryDelete(this: {
  model: CategoryModel;
  getFilter(): Record<string, unknown>;
}): Promise<void> {
  const id = categoryIdFromFilter(this.getFilter());
  if (id !== undefined) {
    await this.model.assertDeletable(id as Types.ObjectId | string);
  }
}

categorySchema.pre('findOneAndDelete', guardQueryDelete);
categorySchema.pre('deleteOne', { query: true, document: false }, guardQueryDelete);

// Document-middleware guard for doc.deleteOne().
categorySchema.pre(
  'deleteOne',
  { document: true, query: false },
  async function guardDocDelete(this: ICategory & { constructor: CategoryModel }) {
    await (this.constructor as CategoryModel).assertDeletable(this._id);
  },
);

export const Category: CategoryModel =
  (models.Category as CategoryModel) ??
  model<ICategory, CategoryModel>('Category', categorySchema);
