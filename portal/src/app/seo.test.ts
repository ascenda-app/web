import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { locales } from "@/i18n/config";
import type { PagedResponse, PeakListItemResponse } from "@/types/api";

const serverFetch = vi.fn();

vi.mock("@/lib/api/server", () => ({
  serverFetch: (path: string) => serverFetch(path),
}));

const robots = (await import("./robots")).default;
const sitemapModule = await import("./sitemap");
const sitemap = sitemapModule.default;
const { generateSitemaps } = sitemapModule;

const original = process.env.NEXT_PUBLIC_SITE_URL;

const peakPage = (
  ids: string[],
  totalCount: number,
): PagedResponse<PeakListItemResponse> => ({
  items: ids.map((id) => ({
    id,
    name: id,
    altitudeMeters: 3000,
    prominenceMeters: null,
    latitude: 42,
    longitude: 0,
    countryCode: "ES",
    region: null,
    imageUrl: null,
    imageAuthor: null,
    imageLicense: null,
  })),
  page: 1,
  size: 100,
  totalCount,
  totalPages: Math.ceil(totalCount / 100),
});

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
});

afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = original;
  vi.clearAllMocks();
});

describe("robots", () => {
  it("robots_publicCatalogue_isAllowed", () => {
    expect(robots().rules).toMatchObject([{ userAgent: "*", allow: "/" }]);
  });

  it("robots_privateAndTransportRoutes_areDisallowed", () => {
    const [rule] = [robots().rules].flat();

    expect(rule?.disallow).toEqual(
      expect.arrayContaining(["/api/", "/*/dashboard", "/*/login"]),
    );
  });

  it("robots_sitemap_pointsToTheSiteUrl", () => {
    expect(robots().sitemap).toBe("http://localhost:3000/sitemap.xml");
  });
});

describe("generateSitemaps", () => {
  it("generateSitemaps_smallCatalogue_producesASingleSitemap", async () => {
    serverFetch.mockResolvedValue(peakPage(["p1"], 1));

    await expect(generateSitemaps()).resolves.toEqual([{ id: 0 }]);
  });

  it("generateSitemaps_unreachableGateway_stillProducesTheStaticSitemap", async () => {
    serverFetch.mockRejectedValue(new Error("gateway down"));

    await expect(generateSitemaps()).resolves.toEqual([{ id: 0 }]);
  });
});

describe("sitemap", () => {
  it("sitemap_firstChunk_includesTheStaticPathsInEveryLocale", async () => {
    serverFetch.mockResolvedValue(peakPage([], 0));

    const urls = (await sitemap({ id: Promise.resolve("0") })).map(
      (entry) => entry.url,
    );

    for (const locale of locales) {
      expect(urls).toContain(`http://localhost:3000/${locale}`);
      expect(urls).toContain(`http://localhost:3000/${locale}/peaks`);
    }
  });

  it("sitemap_peaks_areEmittedInEveryLocale", async () => {
    serverFetch.mockResolvedValue(peakPage(["abc"], 1));

    const urls = (await sitemap({ id: Promise.resolve("0") })).map(
      (entry) => entry.url,
    );

    for (const locale of locales) {
      expect(urls).toContain(`http://localhost:3000/${locale}/peaks/abc`);
    }
  });

  it("sitemap_everyEntry_carriesItsHreflangAlternates", async () => {
    serverFetch.mockResolvedValue(peakPage(["abc"], 1));

    for (const entry of await sitemap({ id: Promise.resolve("0") })) {
      expect(Object.keys(entry.alternates?.languages ?? {})).toHaveLength(
        locales.length + 1,
      );
    }
  });

  it("sitemap_laterChunk_omitsTheStaticPaths", async () => {
    serverFetch.mockResolvedValue(peakPage([], 0));

    await expect(sitemap({ id: Promise.resolve("1") })).resolves.toEqual([]);
  });

  it("sitemap_unreachableGateway_stillReturnsTheStaticPaths", async () => {
    serverFetch.mockRejectedValue(new Error("gateway down"));

    const urls = (await sitemap({ id: Promise.resolve("0") })).map(
      (entry) => entry.url,
    );

    expect(urls).toContain("http://localhost:3000/en/peaks");
    expect(urls).toHaveLength(locales.length * 6);
  });
});
