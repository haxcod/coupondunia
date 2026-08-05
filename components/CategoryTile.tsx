/*
 * CategoryTile — a bordered card with a line icon and label, used in the
 * "Browse by categories" / "Popular categories" grids. When a category has an
 * admin-uploaded iconUrl it is used; otherwise a keyword-matched line icon is
 * picked, falling back to a generic tag.
 */
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

/* Keyword → icon path data (drawn on a 24×24 grid). */
const ICONS: { match: string[]; paths: string }[] = [
  { match: ['fashion', 'apparel', 'cloth', 'wear'], paths: '<path d="M8 4 5 7l2 2 1-1v11h8V8l1 1 2-2-3-3-2 1a2 2 0 0 1-4 0Z"/>' },
  { match: ['electronic', 'gadget', 'tech', 'mobile', 'phone'], paths: '<path d="M8 13a4 4 0 1 0-4-4v7a2 2 0 0 0 4 0Z"/><path d="M16 13a4 4 0 1 1 4-4v7a2 2 0 0 1-4 0Z"/>' },
  { match: ['food', 'dining', 'restaurant'], paths: '<path d="M4 10h16a8 8 0 0 1-16 0Z"/><path d="M6 10c0-3 2-5 6-5s6 2 6 5"/><path d="M4 15h16"/>' },
  { match: ['travel', 'flight', 'hotel'], paths: '<path d="M2 16l20-6-8-2-3-5-1 4-8 2 4 3-1 4Z"/>' },
  { match: ['grocery', 'supermarket', 'basket'], paths: '<path d="M5 9h14l-1.5 9h-11L5 9Z"/><path d="M9 9 7 4M15 9l2-5"/>' },
  { match: ['game', 'gaming', 'toy'], paths: '<rect x="3" y="8" width="18" height="9" rx="4"/><path d="M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01"/>' },
  { match: ['beauty', 'cosmetic', 'personal'], paths: '<path d="M9 8V5h6v3M8 8h8l-1 12H9L8 8Z"/><path d="M10 12h4"/>' },
  { match: ['home', 'kitchen', 'furniture'], paths: '<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/>' },
  { match: ['sport', 'outdoor', 'fitness'], paths: '<circle cx="12" cy="12" r="9"/><path d="M4 8h16M4 16h16M9 3c-2 3-2 15 0 18M15 3c2 3 2 15 0 18"/>' },
];

const DEFAULT_ICON = '<path d="M20.59 13.41 12 22l-8-8V4h10l6.59 6.59a2 2 0 0 1 0 2.82Z"/><circle cx="7.5" cy="7.5" r="1.5"/>';

function iconFor(name: string): string {
  const lower = name.toLowerCase();
  for (const entry of ICONS) {
    if (entry.match.some((kw) => lower.includes(kw))) return entry.paths;
  }
  return DEFAULT_ICON;
}

interface CategoryTileProps {
  name: string;
  slug: string;
  iconUrl?: string | null;
}

export function CategoryTile({ name, slug, iconUrl }: CategoryTileProps) {
  return (
    <Link
      href={`/category/${slug}`}
      className="group flex flex-col items-center gap-3 rounded-card border border-border bg-card px-4 py-6 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
    >
      <span className="flex h-11 w-11 items-center justify-center text-accent transition-transform duration-300 ease-out group-hover:scale-110">
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconUrl} alt="" className="h-8 w-8 object-contain" />
        ) : (
          <Icon paths={iconFor(name)} className="h-8 w-8" />
        )}
      </span>
      <span className="text-xs font-semibold uppercase tracking-wide text-foreground group-hover:text-accent">
        {name}
      </span>
    </Link>
  );
}
