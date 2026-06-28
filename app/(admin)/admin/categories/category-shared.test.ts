import { describe, expect, it } from "vitest";

import { buildCategoryBody, defaultMetaTitle } from "./category-shared";
import type { AdminCategoryDetailView } from "./category-shared";

describe("defaultMetaTitle (Req 15.9)", () => {
  it("formats the default meta title as '[Category] Deals & Coupons | DealSpark'", () => {
    expect(defaultMetaTitle("Electronics")).toBe(
      "Electronics Deals & Coupons | DealSpark",
    );
  });

  it("trims surrounding whitespace from the category name", () => {
    expect(defaultMetaTitle("  Home & Kitchen  ")).toBe(
      "Home & Kitchen Deals & Coupons | DealSpark",
    );
  });

  it("falls back to a generic title when the name is blank", () => {
    expect(defaultMetaTitle("   ")).toBe("Deals & Coupons | DealSpark");
    expect(defaultMetaTitle("")).toBe("Deals & Coupons | DealSpark");
  });
});

describe("buildCategoryBody", () => {
  const detail: AdminCategoryDetailView = {
    id: "cat-1",
    name: "Electronics",
    slug: "electronics",
    parentId: "parent-1",
    iconUrl: "https://cdn.example.test/icon.png",
    description: "Gadgets and gizmos",
    showOnHomepage: true,
    homepageSectionTitle: "Top Electronics",
    displayOrder: 5,
    status: "active",
    metaTitle: "Custom title",
    metaDescription: "Custom description",
  };

  it("carries the existing slug so an inline-toggle round-trip keeps it stable", () => {
    const body = buildCategoryBody(detail);
    expect(body.slug).toBe("electronics");
  });

  it("preserves every editable field when round-tripping a toggle change", () => {
    const body = buildCategoryBody({ ...detail, status: "inactive" });
    expect(body).toEqual({
      name: "Electronics",
      slug: "electronics",
      parentId: "parent-1",
      iconUrl: "https://cdn.example.test/icon.png",
      description: "Gadgets and gizmos",
      showOnHomepage: true,
      homepageSectionTitle: "Top Electronics",
      displayOrder: 5,
      status: "inactive",
      metaTitle: "Custom title",
      metaDescription: "Custom description",
    });
  });
});
