import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { getSiteBaseUrl } from "@/lib/seo";
/*
 * Poppins is the Coupon Saga typeface — the geometric sans used across the
 * design's headings and body. `next/font` self-hosts it with a system fallback
 * stack for graceful degradation. Exposed as `--font-poppins`, which the
 * `--font-sans` token in globals.css consumes.
 */
const poppins = Poppins({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700", "800"],
  fallback: [
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Roboto",
    "Helvetica",
    "Arial",
    "sans-serif",
  ],
});

export const metadata: Metadata = {
  // Resolves relative Open Graph / Twitter image URLs to absolute ones and
  // silences Next's "metadataBase is not set" warning. Sourced from
  // NEXT_PUBLIC_SITE_URL (with a safe fallback) so it is correct per environment.
  metadataBase: new URL(getSiteBaseUrl()),
  title: "Coupon Saga",
  description:
    "Discover the best promo codes, discounts, and cashback offers from your favorite brands.",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
