/**
 * Shared 24×24 stroke icon wrapper for the admin products screens (Task 15.7).
 *
 * Matches the icon convention used across the admin shell (ui-ux-pro-max:
 * consistent SVG icons, fixed 24×24 viewBox, `currentColor` stroke). Callers
 * pass the path/line children for the specific glyph.
 */
export function Icon({
  children,
  className = "h-4 w-4",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}
