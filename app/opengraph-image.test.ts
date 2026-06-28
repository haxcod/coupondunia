import { describe, expect, it } from "vitest";

import { alt, contentType, size } from "./opengraph-image";

/**
 * Focused contract test for the default site Open Graph image route
 * (Task 12.6). It verifies the Next 16 `opengraph-image` convention exports and
 * the affiliate-URL confidentiality guarantee for the route's static branding
 * (Req 24.8 / 7.9 / 24.1). The exhaustive server-rendered-output property test
 * lives separately in Task 12.7 (Property 11).
 */
describe("default opengraph-image route", () => {
  it("exports the 1200x630 size required for Open Graph cards (Req 24.8)", () => {
    expect(size).toEqual({ width: 1200, height: 630 });
  });

  it("declares a PNG content type per the file convention", () => {
    expect(contentType).toBe("image/png");
  });

  it("provides non-empty alt text within the 1-125 character range (Req 24.10)", () => {
    expect(alt.trim().length).toBeGreaterThan(0);
    expect(alt.length).toBeLessThanOrEqual(125);
  });

  it("carries no affiliate/destination URL in its branding (Req 7.9 / 24.1)", () => {
    // The route renders only static brand strings. Guard against any future
    // edit that introduces an outbound URL into the default OG image.
    expect(alt).not.toMatch(/https?:\/\//i);
  });
});
