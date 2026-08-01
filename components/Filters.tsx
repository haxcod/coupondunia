'use client';

/**
 * Filters — the category-detail filter controls (Task 10.7,
 * Req 5.3/5.6/5.7/5.8/5.9).
 *
 * A controlled, presentational client component. It owns no filter state: it
 * renders the supplied `value` ({@link ProductFilters} from
 * `@/lib/product-filters`) and reports every change through `onChange`, leaving
 * the owning page (Task 11.x) to wire the result to URL state / data fetching
 * and to actually filter the products.
 *
 * It renders four filter groups (Req 5.6):
 *   - **Subcategory pills** — single-select; an "All" pill represents the
 *     cleared state, and exactly one pill is shown in a distinct selected state
 *     at any time (Req 5.3).
 *   - **Store checkboxes** — multi-select set membership.
 *   - **Discount tiers** — single-select minimum thresholds (10%+, 30%+, 50%+)
 *     sourced from `DISCOUNT_TIERS`.
 *   - **Price range** — an inclusive ₹0–₹1,00,000 band (configurable ceiling).
 *
 * Layout responsiveness (Req 5.6): from 768px up the controls render inline as
 * a panel; below 768px they are collapsed behind a "Filters" trigger that opens
 * an accessible bottom-sheet (focus moved in, Escape / backdrop to close, body
 * scroll locked, focus restored on close).
 *
 * Active filters are always surfaced as a row of removable chips (Req 5.7);
 * removing a chip clears just that clause and leaves the rest intact (Req 5.8).
 *
 * **Units.** Price values in `ProductFilters.priceRange` are integer paise — the
 * same unit as `Product.currentPrice` — so the value is directly usable by
 * `matchesFilters` / `buildProductFilterQuery`. The inputs display whole rupees
 * and convert at the boundary.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import {
  DISCOUNT_TIERS,
  type DiscountTier,
  type PriceRange,
  type ProductFilters,
} from '@/lib/product-filters';

/** A selectable option (subcategory or store) rendered by the controls. */
export interface FilterOption {
  id: string;
  name: string;
}

export interface FiltersProps {
  /** Subcategories available for the subcategory-pill row (Req 5.3). */
  subcategories?: FilterOption[];
  /** Stores available for the store-checkbox group (Req 5.6). */
  stores?: FilterOption[];
  /** The current filter selection (controlled). */
  value: ProductFilters;
  /** Reports a new, fully-resolved filter selection. */
  onChange: (filters: ProductFilters) => void;
  /** Upper bound of the price control in rupees (Req 5.6 default ₹1,00,000). */
  priceCeilingRupees?: number;
  /** Optional extra classes appended to the outer wrapper. */
  className?: string;
}

const DEFAULT_PRICE_CEILING_RUPEES = 100_000;
const PAISE_PER_RUPEE = 100;

/** Whole-rupee formatter (e.g. ₹1,999) for chips and the price summary. */
const RUPEE_FORMAT = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatPaiseAsRupees(paise: number): string {
  return RUPEE_FORMAT.format(Math.round(paise / PAISE_PER_RUPEE));
}

/** Active lower price bound in paise, or null when unbounded. */
function priceMinPaise(range: PriceRange | null | undefined): number | null {
  const min = range?.min;
  return typeof min === 'number' && Number.isFinite(min) ? min : null;
}

/** Active upper price bound in paise, or null when unbounded. */
function priceMaxPaise(range: PriceRange | null | undefined): number | null {
  const max = range?.max;
  return typeof max === 'number' && Number.isFinite(max) ? max : null;
}

/** Count of active filter clauses, used for the mobile trigger badge. */
function countActiveFilters(filters: ProductFilters): number {
  let count = 0;
  if (filters.subcategoryId) count += 1;
  if (filters.storeIds && filters.storeIds.length > 0) {
    count += filters.storeIds.length;
  }
  if (typeof filters.discountTier === 'number') count += 1;
  if (priceMinPaise(filters.priceRange) !== null || priceMaxPaise(filters.priceRange) !== null) {
    count += 1;
  }
  return count;
}

export function Filters({
  subcategories = [],
  stores = [],
  value,
  onChange,
  priceCeilingRupees = DEFAULT_PRICE_CEILING_RUPEES,
  className,
}: FiltersProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const ceilingPaise = Math.round(priceCeilingRupees * PAISE_PER_RUPEE);
  const activeCount = countActiveFilters(value);
  const hasActive = activeCount > 0;

  // --- immutable update helpers ---------------------------------------------

  const setSubcategory = useCallback(
    (id: string | null) => onChange({ ...value, subcategoryId: id }),
    [onChange, value],
  );

  const toggleStore = useCallback(
    (id: string) => {
      const current = value.storeIds ?? [];
      const next = current.includes(id)
        ? current.filter((storeId) => storeId !== id)
        : [...current, id];
      onChange({ ...value, storeIds: next.length > 0 ? next : null });
    },
    [onChange, value],
  );

  const setDiscountTier = useCallback(
    (tier: DiscountTier | null) => onChange({ ...value, discountTier: tier }),
    [onChange, value],
  );

  const applyPrice = useCallback(
    (minPaise: number | null, maxPaise: number | null) => {
      // Treat a full-span band (floor..ceiling) as no filter at all so we don't
      // surface a no-op price chip.
      const atFloor = minPaise === null || minPaise <= 0;
      const atCeiling = maxPaise === null || maxPaise >= ceilingPaise;
      if (atFloor && atCeiling) {
        onChange({ ...value, priceRange: null });
        return;
      }
      onChange({ ...value, priceRange: { min: minPaise, max: maxPaise } });
    },
    [ceilingPaise, onChange, value],
  );

  const clearAll = useCallback(() => {
    onChange({
      subcategoryId: null,
      storeIds: null,
      discountTier: null,
      priceRange: null,
    });
  }, [onChange]);

  // --- bottom-sheet a11y: focus, Escape, backdrop, scroll lock --------------

  useEffect(() => {
    if (!sheetOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setSheetOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Restore focus to the trigger (or whatever was focused) on close.
      (triggerRef.current ?? previouslyFocused)?.focus();
    };
  }, [sheetOpen]);

  // --- render ----------------------------------------------------------------

  const controls = (
    <FilterControls
      subcategories={subcategories}
      stores={stores}
      value={value}
      ceilingPaise={ceilingPaise}
      priceCeilingRupees={priceCeilingRupees}
      onSelectSubcategory={setSubcategory}
      onToggleStore={toggleStore}
      onSelectDiscountTier={setDiscountTier}
      onApplyPrice={applyPrice}
    />
  );

  return (
    <div className={className}>
      {/* Mobile trigger (below 768px) + active-chip row are always available. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          className="inline-flex cursor-pointer items-center gap-2 rounded-control border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:border-accent md:hidden"
        >
          <FilterIcon />
          Filters
          {activeCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-badge bg-accent px-1.5 text-xs font-semibold text-card">
              {activeCount}
            </span>
          )}
        </button>

        <ActiveFilterChips
          subcategories={subcategories}
          stores={stores}
          value={value}
          onClearSubcategory={() => setSubcategory(null)}
          onRemoveStore={toggleStore}
          onClearDiscountTier={() => setDiscountTier(null)}
          onClearPrice={() => applyPrice(null, null)}
          onClearAll={clearAll}
        />
      </div>

      {/* Desktop inline panel (768px and up). */}
      <div className="hidden rounded-card border border-border bg-card p-4 md:block">
        <h2 className="mb-4 text-base font-semibold text-foreground">Filters</h2>
        {controls}
        {hasActive && (
          <button
            type="button"
            onClick={clearAll}
            className="mt-4 cursor-pointer text-sm font-medium text-accent transition-colors duration-200 hover:text-accent-hover"
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* Bottom-sheet (below 768px), mounted only while open. */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            aria-hidden="true"
            onClick={() => setSheetOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-modal bg-card p-4 shadow-lg"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Filters</h2>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Close filters"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-control text-secondary transition-colors duration-200 hover:bg-background hover:text-foreground"
              >
                <CloseIcon />
              </button>
            </div>

            {controls}

            <div className="mt-6 flex items-center gap-3">
              {hasActive && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="cursor-pointer rounded-control border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors duration-200 hover:border-accent"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="flex-1 cursor-pointer rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-card transition-colors duration-200 hover:bg-accent-hover"
              >
                Show results
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Filter controls body — shared by the desktop panel and the bottom-sheet.
// =============================================================================

interface FilterControlsProps {
  subcategories: FilterOption[];
  stores: FilterOption[];
  value: ProductFilters;
  ceilingPaise: number;
  priceCeilingRupees: number;
  onSelectSubcategory: (id: string | null) => void;
  onToggleStore: (id: string) => void;
  onSelectDiscountTier: (tier: DiscountTier | null) => void;
  onApplyPrice: (minPaise: number | null, maxPaise: number | null) => void;
}

function FilterControls({
  subcategories,
  stores,
  value,
  ceilingPaise,
  priceCeilingRupees,
  onSelectSubcategory,
  onToggleStore,
  onSelectDiscountTier,
  onApplyPrice,
}: FilterControlsProps) {
  return (
    <div className="flex flex-col gap-6">
      {subcategories.length > 0 && (
        <SubcategoryPills
          subcategories={subcategories}
          selectedId={value.subcategoryId ?? null}
          onSelect={onSelectSubcategory}
        />
      )}

      {stores.length > 0 && (
        <StoreCheckboxes
          stores={stores}
          selectedIds={value.storeIds ?? []}
          onToggle={onToggleStore}
        />
      )}

      <DiscountTiers
        selected={value.discountTier ?? null}
        onSelect={onSelectDiscountTier}
      />

      <PriceRangeControl
        range={value.priceRange ?? null}
        ceilingPaise={ceilingPaise}
        priceCeilingRupees={priceCeilingRupees}
        onApply={onApplyPrice}
      />
    </div>
  );
}

// --- subcategory pills -------------------------------------------------------

interface SubcategoryPillsProps {
  subcategories: FilterOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function SubcategoryPills({
  subcategories,
  selectedId,
  onSelect,
}: SubcategoryPillsProps) {
  const groupId = useId();
  return (
    <fieldset className="border-0 p-0">
      <legend id={groupId} className="mb-2 text-sm font-medium text-foreground">
        Subcategory
      </legend>
      <div className="flex flex-wrap gap-2" role="group" aria-labelledby={groupId}>
        <Pill selected={selectedId === null} onClick={() => onSelect(null)}>
          All
        </Pill>
        {subcategories.map((sub) => (
          <Pill
            key={sub.id}
            selected={selectedId === sub.id}
            onClick={() => onSelect(selectedId === sub.id ? null : sub.id)}
          >
            {sub.name}
          </Pill>
        ))}
      </div>
    </fieldset>
  );
}

interface PillProps {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function Pill({ selected, onClick, children }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`cursor-pointer rounded-badge border px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
        selected
          ? 'border-accent bg-accent text-card'
          : 'border-border bg-card text-foreground hover:border-accent'
      }`}
    >
      {children}
    </button>
  );
}

// --- store checkboxes --------------------------------------------------------

interface StoreCheckboxesProps {
  stores: FilterOption[];
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
}

function StoreCheckboxes({ stores, selectedIds, onToggle }: StoreCheckboxesProps) {
  const groupId = useId();
  return (
    <fieldset className="border-0 p-0">
      <legend id={groupId} className="mb-2 text-sm font-medium text-foreground">
        Stores
      </legend>
      <div className="flex flex-col gap-2" role="group" aria-labelledby={groupId}>
        {stores.map((store) => {
          const checked = selectedIds.includes(store.id);
          return (
            <label
              key={store.id}
              className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(store.id)}
                className="h-4 w-4 cursor-pointer accent-accent"
              />
              <span>{store.name}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// --- discount tiers ----------------------------------------------------------

interface DiscountTiersProps {
  selected: DiscountTier | null;
  onSelect: (tier: DiscountTier | null) => void;
}

function DiscountTiers({ selected, onSelect }: DiscountTiersProps) {
  const groupId = useId();
  return (
    <fieldset className="border-0 p-0">
      <legend id={groupId} className="mb-2 text-sm font-medium text-foreground">
        Discount
      </legend>
      <div className="flex flex-wrap gap-2" role="group" aria-labelledby={groupId}>
        {DISCOUNT_TIERS.map((tier) => (
          <Pill
            key={tier}
            selected={selected === tier}
            onClick={() => onSelect(selected === tier ? null : tier)}
          >
            {tier}%+
          </Pill>
        ))}
      </div>
    </fieldset>
  );
}

// --- price range -------------------------------------------------------------

interface PriceRangeControlProps {
  range: PriceRange | null;
  ceilingPaise: number;
  priceCeilingRupees: number;
  onApply: (minPaise: number | null, maxPaise: number | null) => void;
}

/** Parse a rupee text input into paise, or null when blank/invalid. */
function rupeesInputToPaise(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const rupees = Number(trimmed);
  if (!Number.isFinite(rupees) || rupees < 0) return null;
  return Math.round(rupees * PAISE_PER_RUPEE);
}

/** Display paise as a bare rupee number for an input value, or '' when null. */
function paiseToRupeesInput(paise: number | null): string {
  if (paise === null) return '';
  return String(Math.round(paise / PAISE_PER_RUPEE));
}

function PriceRangeControl({
  range,
  ceilingPaise,
  priceCeilingRupees,
  onApply,
}: PriceRangeControlProps) {
  const groupId = useId();
  const minId = useId();
  const maxId = useId();

  const minPaise = priceMinPaise(range);
  const maxPaise = priceMaxPaise(range);

  const handleMin = (raw: string) => {
    onApply(rupeesInputToPaise(raw), maxPaise);
  };
  const handleMax = (raw: string) => {
    onApply(minPaise, rupeesInputToPaise(raw));
  };

  return (
    <fieldset className="border-0 p-0">
      <legend id={groupId} className="mb-2 text-sm font-medium text-foreground">
        Price range
      </legend>
      <div className="flex items-end gap-3" role="group" aria-labelledby={groupId}>
        <div className="flex-1">
          <label htmlFor={minId} className="mb-1 block text-xs text-secondary">
            Min (₹)
          </label>
          <input
            id={minId}
            type="number"
            inputMode="numeric"
            min={0}
            max={priceCeilingRupees}
            placeholder="0"
            value={paiseToRupeesInput(minPaise)}
            onChange={(event) => handleMin(event.target.value)}
            className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors duration-200 focus-visible:border-accent"
          />
        </div>
        <span className="pb-2 text-secondary" aria-hidden="true">
          –
        </span>
        <div className="flex-1">
          <label htmlFor={maxId} className="mb-1 block text-xs text-secondary">
            Max (₹)
          </label>
          <input
            id={maxId}
            type="number"
            inputMode="numeric"
            min={0}
            max={priceCeilingRupees}
            placeholder={String(priceCeilingRupees)}
            value={paiseToRupeesInput(maxPaise)}
            onChange={(event) => handleMax(event.target.value)}
            className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors duration-200 focus-visible:border-accent"
          />
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">
        {formatPaiseAsRupees(0)} – {formatPaiseAsRupees(ceilingPaise)}
      </p>
    </fieldset>
  );
}

// =============================================================================
// Active filter chips (Req 5.7/5.8) — always visible, each removable.
// =============================================================================

interface ActiveFilterChipsProps {
  subcategories: FilterOption[];
  stores: FilterOption[];
  value: ProductFilters;
  onClearSubcategory: () => void;
  onRemoveStore: (id: string) => void;
  onClearDiscountTier: () => void;
  onClearPrice: () => void;
  onClearAll: () => void;
}

function ActiveFilterChips({
  subcategories,
  stores,
  value,
  onClearSubcategory,
  onRemoveStore,
  onClearDiscountTier,
  onClearPrice,
  onClearAll,
}: ActiveFilterChipsProps) {
  const chips: { key: string; label: string; onRemove: () => void }[] = [];

  if (value.subcategoryId) {
    const name =
      subcategories.find((sub) => sub.id === value.subcategoryId)?.name ??
      'Subcategory';
    chips.push({ key: `sub`, label: name, onRemove: onClearSubcategory });
  }

  for (const id of value.storeIds ?? []) {
    const name = stores.find((store) => store.id === id)?.name ?? 'Store';
    chips.push({ key: `store-${id}`, label: name, onRemove: () => onRemoveStore(id) });
  }

  if (typeof value.discountTier === 'number') {
    chips.push({
      key: 'discount',
      label: `${value.discountTier}%+ off`,
      onRemove: onClearDiscountTier,
    });
  }

  const minPaise = priceMinPaise(value.priceRange);
  const maxPaise = priceMaxPaise(value.priceRange);
  if (minPaise !== null || maxPaise !== null) {
    const from = minPaise !== null ? formatPaiseAsRupees(minPaise) : formatPaiseAsRupees(0);
    const to = maxPaise !== null ? formatPaiseAsRupees(maxPaise) : 'and up';
    chips.push({
      key: 'price',
      label: maxPaise !== null ? `${from} – ${to}` : `${from} and up`,
      onRemove: onClearPrice,
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-badge bg-background py-1 pl-3 pr-1 text-sm text-foreground"
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`Remove filter: ${chip.label}`}
            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-badge text-secondary transition-colors duration-200 hover:bg-border hover:text-foreground"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={onClearAll}
        className="cursor-pointer text-sm font-medium text-accent transition-colors duration-200 hover:text-accent-hover"
      >
        Clear all
      </button>
    </div>
  );
}

// =============================================================================
// Inline SVG icons (no emoji — ui-ux-pro-max).
// =============================================================================

function FilterIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="h-4 w-4"
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ?? 'h-5 w-5'}
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
