/*
 * BrandStrip — the partner ribbon that runs continuously right-to-left.
 *
 * Two identical groups are rendered; the track shifts by half its width so the
 * loop is seamless (see `.marquee` in globals.css). The second group is hidden
 * from assistive tech so the names are only announced once, and the whole rail
 * pauses on hover. Reduced motion turns it into a static, scrollable row.
 *
 * The design shows licensed brand wordmarks; without those assets these are set
 * as muted type, which keeps the same rhythm without shipping brand art.
 */
const BRANDS = ['GONG', 'Shopify', 'amazon', 'Spotify', 'ATLASSIAN', 'Mailchimp'];

function BrandGroup({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <div
      className="marquee-group"
      // The second pass exists purely to close the loop: hidden from assistive
      // tech, and dropped entirely under reduced motion so the static fallback
      // does not read as the same names listed twice.
      data-duplicate={duplicate || undefined}
      aria-hidden={duplicate || undefined}
    >
      {BRANDS.map((brand) => (
        <span
          key={brand}
          className="marquee-item whitespace-nowrap text-lg font-bold tracking-tight text-muted/80 sm:text-xl"
        >
          {brand}
        </span>
      ))}
    </div>
  );
}

export function BrandStrip() {
  return (
    <section
      aria-label="Featured on"
      className="marquee border-y border-border bg-card py-7"
    >
      <div className="marquee-track">
        <BrandGroup />
        <BrandGroup duplicate />
      </div>
    </section>
  );
}
