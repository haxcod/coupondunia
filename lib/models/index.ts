/**
 * Barrel export for all DealSpark Mongoose models, document interfaces, shared
 * domain types, and the category referential-guard error. Import models from
 * here (e.g. `import { Product } from '@/lib/models'`).
 */
export * from './types';

export { Store, type IStore } from './Store';
export {
  Category,
  CategoryHasDependentsError,
  type ICategory,
  type CategoryModel,
} from './Category';
export { Product, type IProduct } from './Product';
export { Deal, type IDeal } from './Deal';
export { Banner, type IBanner } from './Banner';
export { ClickEvent, type IClickEvent } from './ClickEvent';
export { ContactMessage, type IContactMessage } from './ContactMessage';
export { SearchLog, type ISearchLog } from './SearchLog';
export { AdminUser, type IAdminUser } from './AdminUser';
export { LoginAttempt, type ILoginAttempt } from './LoginAttempt';
export { Settings, type ISettings, type ISocialLinks } from './Settings';
