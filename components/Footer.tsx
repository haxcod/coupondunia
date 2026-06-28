/*
 * Footer (Server Component) — site-wide footer (Req 1.13, 20.5).
 *
 * Renders the site logo, tagline, navigation link columns, an affiliate
 * disclaimer, a copyright notice, and social links — using the `#EFEFED`
 * footer background (`bg-footer`, Req 1.13). Only *populated* social links are
 * rendered; any link left blank is omitted entirely (Req 20.5).
 *
 * Brand icons use official Simple Icons SVG paths (not emoji) per the
 * ui-ux-pro-max icon rule. All dynamic data arrives via props with sensible
 * defaults so the footer renders standalone; pages pass real values sourced
 * from Settings/catalog. The component never reads settings itself.
 */
import Link from 'next/link';

export interface FooterSocialLinks {
  facebook?: string;
  instagram?: string;
  twitter?: string;
  youtube?: string;
}

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  title: string;
  links: FooterLink[];
}

export interface FooterProps {
  /** Brand name shown as a wordmark when no logo image is configured. */
  siteName?: string;
  /** Short brand tagline rendered under the logo. */
  tagline?: string;
  /** Optional logo image URL; falls back to the site-name wordmark. */
  logoUrl?: string | null;
  /** Social profile URLs; empty/blank entries are omitted (Req 20.5). */
  social?: FooterSocialLinks;
  /** Navigation link columns; defaults to the standard site columns. */
  columns?: FooterColumn[];
  /** Affiliate disclaimer text (Req 1.13). */
  affiliateDisclaimer?: string;
}

const DEFAULT_COLUMNS: FooterColumn[] = [
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms', href: '/terms' },
      { label: 'Privacy', href: '/privacy' },
    ],
  },
  {
    title: 'Browse',
    links: [
      { label: 'All Categories', href: '/categories' },
      { label: 'All Coupons', href: '/coupons' },
    ],
  },
];

const DEFAULT_DISCLAIMER =
  'DealSpark is reader-supported. When you buy through links on our site we may earn an affiliate commission at no additional cost to you. Prices and availability are accurate as of the date and time indicated and are subject to change.';

interface SocialIconDef {
  key: keyof FooterSocialLinks;
  label: string;
  /** Official Simple Icons 24×24 path. */
  path: string;
}

/* Official Simple Icons brand paths (24×24 viewBox). */
const SOCIAL_ICONS: SocialIconDef[] = [
  {
    key: 'facebook',
    label: 'Facebook',
    path: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
  },
  {
    key: 'instagram',
    label: 'Instagram',
    path: 'M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z',
  },
  {
    key: 'twitter',
    label: 'X',
    path: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
  },
  {
    key: 'youtube',
    label: 'YouTube',
    path: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  },
];

export function Footer({
  siteName = 'DealSpark',
  tagline = 'Discover the best deals, coupons, and offers from top stores.',
  logoUrl = null,
  social = {},
  columns = DEFAULT_COLUMNS,
  affiliateDisclaimer = DEFAULT_DISCLAIMER,
}: FooterProps) {
  // Render only social links that carry a non-blank URL (Req 20.5).
  const populatedSocial = SOCIAL_ICONS.map((icon) => ({
    ...icon,
    url: (social[icon.key] ?? '').trim(),
  })).filter((icon) => icon.url.length > 0);

  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto bg-footer text-foreground">
      <div className="mx-auto w-full max-w-content px-4 py-12">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand: logo, tagline, social links */}
          <div>
            <Link
              href="/"
              aria-label={`${siteName} home`}
              className="inline-flex cursor-pointer items-center gap-2"
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={siteName} className="h-8 w-auto" />
              ) : (
                <span className="text-xl font-bold tracking-tight text-foreground">
                  {siteName}
                </span>
              )}
            </Link>

            {tagline ? (
              <p className="mt-3 max-w-xs text-sm text-secondary">{tagline}</p>
            ) : null}

            {populatedSocial.length > 0 ? (
              <ul className="mt-4 flex items-center gap-3">
                {populatedSocial.map((icon) => (
                  <li key={icon.key}>
                    <a
                      href={icon.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={icon.label}
                      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-control border border-border bg-card text-secondary transition-colors duration-200 hover:text-accent"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="h-5 w-5"
                        aria-hidden="true"
                      >
                        <path d={icon.path} />
                      </svg>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* Navigation link columns */}
          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-sm font-semibold text-foreground">
                {column.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="cursor-pointer text-sm text-secondary transition-colors duration-200 hover:text-accent"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Affiliate disclaimer (Req 1.13) */}
        <p className="mt-10 border-t border-border pt-6 text-xs leading-relaxed text-muted">
          {affiliateDisclaimer}
        </p>

        {/* Copyright (Req 1.13) */}
        <p className="mt-4 text-xs text-muted">
          © {year} {siteName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
