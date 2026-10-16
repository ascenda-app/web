import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ensureSession = vi.fn();
const serverFetch = vi.fn();

vi.mock("@/lib/auth/refresh", () => ({
  ensureSession: () => ensureSession(),
}));

vi.mock("@/lib/api/server", () => ({
  serverFetch: (path: string, options?: unknown) => serverFetch(path, options),
}));

const { GET } = await import("./route");

const request = (init?: RequestInit): NextRequest =>
  new NextRequest(
    new Request("http://localhost:3000/api/export", {
      headers: { "Sec-Fetch-Site": "same-origin" },
      ...init,
    }),
  );

beforeEach(() => {
  ensureSession.mockResolvedValue({ userId: "u1", email: "a@b.es", accessToken: "at" });
  serverFetch.mockImplementation((path: string) => Promise.resolve({ path }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("GET /api/export", () => {
  it("export_withoutSession_returns401WithoutCallingTheGateway", async () => {
    ensureSession.mockResolvedValue(undefined);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(serverFetch).not.toHaveBeenCalled();
  });

  it("export_withSession_composesTheThreeServices", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(serverFetch).toHaveBeenCalledTimes(3);
    expect(body.account).toEqual({ path: "auth/me/export" });
    expect(body.profile).toEqual({ path: "profiles/me/export" });
    expect(body.ascents).toEqual({ path: "ascents/me/export" });
  });

  it("export_withSession_isServedAsADownloadThatIsNeverCached", async () => {
    const response = await GET(request());

    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="ascenda-export-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("export_whenOneServiceFails_failsWholeRatherThanReturningAPartialExport", async () => {
    serverFetch.mockImplementation((path: string) =>
      path === "ascents/me/export"
        ? Promise.reject(new Error("gateway down"))
        : Promise.resolve({ path }),
    );

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect((await response.json()).title).toBe("Export.Incomplete");
  });

  it("export_crossSiteRequest_isRejected", async () => {
    const response = await GET(
      new NextRequest(
        new Request("http://localhost:3000/api/export", {
          method: "POST",
          headers: { "Sec-Fetch-Site": "cross-site" },
        }),
      ),
    );

    expect(response.status).toBe(403);
    expect(serverFetch).not.toHaveBeenCalled();
  });
});
