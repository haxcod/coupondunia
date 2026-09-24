import Link from 'next/link';

type IconProps = { className?: string };

function Icon({ paths, className }: { paths: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
}

const ICONS: { match: string[]; paths: string }[] = [
  { match: ['fashion', 'apparel', 'cloth', 'wear'], paths: '<path d="M8 4 5 7l2 2 1-1v11h8V8l1 1 2-2-3-3-2 1a2 2 0 0 1-4 0Z"/>' },
  { match: ['electronic', 'gadget', 'tech', 'mobile', 'phone'], paths: '<path d="M8 13a4 4 0 1 0-4-4v7a2 2 0 0 0 4 0Z"/><path d="M16 13a4 4 0 1 1 4-4v7a2 2 0 0 1-4 0Z"/>' },
  { match: ['food', 'dining', 'restaurant', 'drink'], paths: '<path d="M4 10h16a8 8 0 0 1-16 0Z"/><path d="M6 10c0-3 2-5 6-5s6 2 6 5"/><path d="M4 15h16"/>' },
  { match: ['travel', 'flight', 'hotel', 'tourism'], paths: '<path d="M2 16l20-6-8-2-3-5-1 4-8 2 4 3-1 4Z"/>' },
  { match: ['grocery', 'supermarket', 'basket'], paths: '<path d="M5 9h14l-1.5 9h-11L5 9Z"/><path d="M9 9 7 4M15 9l2-5"/>' },
  { match: ['game', 'gaming', 'toy'], paths: '<rect x="3" y="8" width="18" height="9" rx="4"/><path d="M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01"/>' },
  { match: ['beauty', 'cosmetic', 'personal'], paths: '<path d="M9 8V5h6v3M8 8h8l-1 12H9L8 8Z"/><path d="M10 12h4"/>' },
  { match: ['home', 'kitchen', 'furniture', 'decor'], paths: '<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/>' },
  { match: ['sport', 'outdoor', 'fitness'], paths: '<circle cx="12" cy="12" r="9"/><path d="M4 8h16M4 16h16M9 3c-2 3-2 15 0 18M15 3c2 3 2 15 0 18"/>' },
  { match: ['baby', 'kid', 'child'], paths: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>' },
  { match: ['book', 'education', 'media'], paths: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/>' },
  { match: ['health', 'wellness', 'medical'], paths: '<path d="M12 6v12M6 12h12"/>' },
  { match: ['gift', 'party'], paths: '<rect x="3" y="8" width="18" height="14" rx="2"/><path d="M12 8v14M3 12h18M12 8a3 3 0 1 0-3-3M12 8a3 3 0 1 1 3-3"/>' },
  { match: ['car', 'automotive', 'motor'], paths: '<path d="M5 17h14v-4l-2-4H7l-2 4v4Z"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>' },
];

const DEFAULT_ICON = '<path d="M20.59 13.41 12 22l-8-8V4h10l6.59 6.59a2 2 0 0 1 0 2.82Z"/><circle cx="7.5" cy="7.5" r="1.5"/>';

function iconFor(name: string): string {
  const lower = name.toLowerCase();
  for (const entry of ICONS) {
    if (entry.match.some((kw) => lower.includes(kw))) return entry.paths;
  }
  return DEFAULT_ICON;
}

export interface CategoryPillProps {
  name: string;
  slug: string;
  iconUrl?: string | null;
  count?: number;
}

export function CategoryPill({ name, slug, iconUrl, count }: CategoryPillProps) {
  return (
    <Link
      href={`/category/${slug}`}
      className="group flex items-center gap-3.5 rounded-full border border-border bg-card px-4 py-3 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-accent hover:shadow-md hover:shadow-accent/10"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-accent transition-transform duration-200 ease-out group-hover:scale-110">
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconUrl} alt="" className="h-5 w-5 object-contain" />
        ) : (
          <Icon paths={iconFor(name)} className="h-5 w-5" />
        )}
      </span>

      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-foreground transition-colors duration-200 group-hover:text-accent">
          {name}
        </span>
        {count != null && count > 0 ? (
          <span className="shrink-0 rounded-full bg-border/60 px-2 py-0.5 text-[11px] font-medium text-secondary">
            {count}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
