/*
 * Newsletter block — "Deals delivered to your inbox." from the design, with the
 * designer's own artwork. There is no subscriber backend yet, so the button is
 * presentational.
 */
import Image from 'next/image';

export function Newsletter() {
  return (
    <section
      aria-label="Newsletter"
      className="reveal mx-auto w-full max-w-content px-4 py-14"
    >
      <div className="grid items-center gap-10 md:grid-cols-2">
        <div className="relative aspect-[5/3] w-full overflow-hidden rounded-card bg-surface">
          <Image
            src="/figma/newsletter.webp"
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 620px"
            className="object-cover"
          />
        </div>

        <div>
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
            Deals delivered to your inbox.
          </h2>
          <p className="mt-3 font-semibold text-foreground">
            Subscribe now for top-notch shopping advice
          </p>
          <button
            type="button"
            className="press mt-6 inline-flex items-center gap-2 rounded-control bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover hover:shadow-lg hover:shadow-accent/25"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
            Subscribe
          </button>
        </div>
      </div>
    </section>
  );
}
