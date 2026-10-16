import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readAccessToken = vi.fn();
const refreshSession = vi.fn();
const ensureSession = vi.fn();

vi.mock("@/lib/auth/cookies", () => ({
  readAccessToken: () => readAccessToken(),
}));

vi.mock("@/lib/auth/refresh", () => ({
  refreshSession: () => refreshSession(),
  ensureSession: () => ensureSession(),
}));

vi.mock("@/lib/api/gateway", () => ({
  gatewayUrl: () => "http://gateway:8080",
  correlationHeader: "X-Correlation-Id",
}));

const { DELETE, GET, POST } = await import("./route");

const context = (...path: string[]) => ({ params: Promise.resolve({ path }) });

const request = (url: string, init?: RequestInit): NextRequest =>
  new NextRequest(
    new Request(url, {
      ...init,
      headers: { "Sec-Fetch-Site": "same-origin", ...init?.headers },
    }),
  );

const upstream = (status: number, body = "{}"): Response =>
  new Response(status === 204 ? null : body, { status });

const callArgs = (mock: ReturnType<typeof vi.fn>, index = 0) =>
  mock.mock.calls[index] as [string, RequestInit & { headers: Headers }];

beforeEach(() => {
  readAccessToken.mockResolvedValue("access-token");
  refreshSession.mockResolvedValue({ status: "rejected" });
  ensureSession.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("lista blanca de rutas", () => {
  it.each(["auth", "profiles", "peaks", "ascents", "collections"])(
    "bff_%sPrefix_isProxiedToTheGateway",
    async (prefix) => {
      const fetchMock = vi.fn().mockResolvedValue(upstream(200));
      vi.stubGlobal("fetch", fetchMock);

      await GET(request(`http://localhost:3000/api/bff/${prefix}`), context(prefix));

      expect(callArgs(fetchMock)[0]).toBe(`http://gateway:8080/api/${prefix}`);
    },
  );

  it.each([["admin"], ["internal"], [".well-known"]])(
    "bff_unknownPrefix_%s_returns404WithoutCallingTheGateway",
    async (prefix) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const response = await GET(
        request(`http://localhost:3000/api/bff/${prefix}`),
        context(prefix),
      );

      expect(response.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

describe("reenvío al gateway", () => {
  it("bff_sessionCookiePresent_addsTheBearerHeader", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstream(200));
    vi.stubGlobal("fetch", fetchMock);

    await GET(request("http://localhost:3000/api/bff/profiles/me"), context("profiles", "me"));

    expect(callArgs(fetchMock)[1].headers.get("Authorization")).toBe(
      "Bearer access-token",
    );
  });

  it("bff_anonymousRequest_forwardsWithoutAuthorization", async () => {
    readAccessToken.mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue(upstream(200));
    vi.stubGlobal("fetch", fetchMock);

    await GET(request("http://localhost:3000/api/bff/peaks"), context("peaks"));

    expect(callArgs(fetchMock)[1].headers.has("Authorization")).toBe(false);
  });

  it("bff_clientSuppliedAuthorization_isReplacedByTheCookieToken", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstream(200));
    vi.stubGlobal("fetch", fetchMock);

    await GET(
      request("http://localhost:3000/api/bff/profiles/me", {
        headers: { Authorization: "Bearer forged" },
      }),
      context("profiles", "me"),
    );

    expect(callArgs(fetchMock)[1].headers.get("Authorization")).toBe(
      "Bearer access-token",
    );
  });

  it("bff_cookieHeader_isNeverForwardedToTheGateway", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstream(200));
    vi.stubGlobal("fetch", fetchMock);

    await GET(
      request("http://localhost:3000/api/bff/peaks", {
        headers: { cookie: "ascenda_at=secret" },
      }),
      context("peaks"),
    );

    expect(callArgs(fetchMock)[1].headers.has("cookie")).toBe(false);
  });

  it("bff_queryString_isPreserved", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstream(200));
    vi.stubGlobal("fetch", fetchMock);

    await GET(
      request("http://localhost:3000/api/bff/peaks/search?q=aneto&page=2"),
      context("peaks", "search"),
    );

    expect(callArgs(fetchMock)[0]).toBe(
      "http://gateway:8080/api/peaks/search?q=aneto&page=2",
    );
  });

  it("bff_missingCorrelationId_generatesOne", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstream(200));
    vi.stubGlobal("fetch", fetchMock);

    await GET(request("http://localhost:3000/api/bff/peaks"), context("peaks"));

    expect(callArgs(fetchMock)[1].headers.get("X-Correlation-Id")).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it("bff_incomingCorrelationId_isPropagated", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstream(200));
    vi.stubGlobal("fetch", fetchMock);

    await GET(
      request("http://localhost:3000/api/bff/peaks", {
        headers: { "X-Correlation-Id": "abc-123" },
      }),
      context("peaks"),
    );

    expect(callArgs(fetchMock)[1].headers.get("X-Correlation-Id")).toBe("abc-123");
  });

  it("bff_forwardedFor_isPropagatedSoTheGatewayCanTellVisitorsApart", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstream(200));
    vi.stubGlobal("fetch", fetchMock);

    await GET(
      request("http://localhost:3000/api/bff/peaks", {
        headers: { "X-Forwarded-For": "203.0.113.7" },
      }),
      context("peaks"),
    );

    expect(callArgs(fetchMock)[1].headers.get("X-Forwarded-For")).toBe(
      "203.0.113.7",
    );
  });

  it("bff_realIpWithoutForwardedFor_isPromotedToForwardedFor", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstream(200));
    vi.stubGlobal("fetch", fetchMock);

    await GET(
      request("http://localhost:3000/api/bff/peaks", {
        headers: { "X-Real-IP": "203.0.113.9" },
      }),
      context("peaks"),
    );

    expect(callArgs(fetchMock)[1].headers.get("X-Forwarded-For")).toBe(
      "203.0.113.9",
    );
  });
});

describe("respuesta sin transformar", () => {
  it("bff_problemDetails_reachTheClientUntouched", async () => {
    const problem = { status: 409, title: "Ascent.PhotoLimitReached" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(upstream(409, JSON.stringify(problem))),
    );

    const response = await POST(
      request("http://localhost:3000/api/bff/ascents/a1/photos", { method: "POST" }),
      context("ascents", "a1", "photos"),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(problem);
  });

  it("bff_noContent_isForwardedAs204", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream(204)));

    const response = await DELETE(
      request("http://localhost:3000/api/bff/ascents/a1", { method: "DELETE" }),
      context("ascents", "a1"),
    );

    expect(response.status).toBe(204);
  });
});

describe("rotación ante 401", () => {
  it("bff_401WithSuccessfulRotation_retriesExactlyOnce", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(upstream(401))
      .mockResolvedValueOnce(upstream(200, '{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);
    refreshSession.mockResolvedValue({
      status: "rotated",
      tokens: { accessToken: "new" },
    });

    const response = await GET(
      request("http://localhost:3000/api/bff/profiles/me"),
      context("profiles", "me"),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
  });

  it("bff_401WithFailedRotation_returnsTheOriginal401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstream(401));
    vi.stubGlobal("fetch", fetchMock);
    refreshSession.mockResolvedValue({ status: "rejected" });

    const response = await GET(
      request("http://localhost:3000/api/bff/profiles/me"),
      context("profiles", "me"),
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(response.status).toBe(401);
  });

  it("bff_retriedRequest_reusesTheSameCorrelationId", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(upstream(401))
      .mockResolvedValueOnce(upstream(200));
    vi.stubGlobal("fetch", fetchMock);
    refreshSession.mockResolvedValue({
      status: "rotated",
      tokens: { accessToken: "new" },
    });

    await GET(
      request("http://localhost:3000/api/bff/profiles/me", {
        headers: { "X-Correlation-Id": "trace-1" },
      }),
      context("profiles", "me"),
    );

    expect(callArgs(fetchMock, 1)[1].headers.get("X-Correlation-Id")).toBe(
      "trace-1",
    );
  });

  it("bff_retriedRequest_carriesTheRotatedBearerToken", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(upstream(401))
      .mockResolvedValueOnce(upstream(200));
    vi.stubGlobal("fetch", fetchMock);
    readAccessToken
      .mockResolvedValueOnce("stale-token")
      .mockResolvedValue("rotated-token");
    refreshSession.mockResolvedValue({
      status: "rotated",
      tokens: { accessToken: "rotated-token" },
    });

    await GET(
      request("http://localhost:3000/api/bff/profiles/me"),
      context("profiles", "me"),
    );

    expect(callArgs(fetchMock, 0)[1].headers.get("Authorization")).toBe(
      "Bearer stale-token",
    );
    expect(callArgs(fetchMock, 1)[1].headers.get("Authorization")).toBe(
      "Bearer rotated-token",
    );
  });

  it("bff_expiredAccessToken_isRotatedBeforeTheFirstCall", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream(200)));

    await GET(
      request("http://localhost:3000/api/bff/profiles/me"),
      context("profiles", "me"),
    );

    expect(ensureSession).toHaveBeenCalledOnce();
  });

  it("bff_nonAuthErrorStatus_doesNotTriggerRotation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream(403)));

    await GET(
      request("http://localhost:3000/api/bff/ascents/a1"),
      context("ascents", "a1"),
    );

    expect(refreshSession).not.toHaveBeenCalled();
  });
});

describe("defensa CSRF", () => {
  const crossSite = (url: string, method: string): NextRequest =>
    new NextRequest(
      new Request(url, { method, headers: { "Sec-Fetch-Site": "cross-site" } }),
    );

  it("bff_crossSiteDelete_isRejectedWithoutCallingTheGateway", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await DELETE(
      crossSite("http://localhost:3000/api/bff/auth/me", "DELETE"),
      context("auth", "me"),
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bff_crossSitePost_isRejectedWithAStableProblemCode", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const response = await POST(
      crossSite("http://localhost:3000/api/bff/ascents", "POST"),
      context("ascents"),
    );

    expect((await response.json()).title).toBe("Bff.CrossSiteRequest");
  });

  it("bff_crossSiteGet_isStillAllowedBecauseReadsAreSafe", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstream(200));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      crossSite("http://localhost:3000/api/bff/peaks", "GET"),
      context("peaks"),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("bff_clientSuppliedOriginAndSecFetchHeaders_neverReachTheGateway", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstream(200));
    vi.stubGlobal("fetch", fetchMock);

    await POST(
      request("http://localhost:3000/api/bff/ascents", {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          Referer: "https://evil.example/attack",
        },
      }),
      context("ascents"),
    );

    const headers = callArgs(fetchMock)[1].headers;

    expect(headers.get("origin")).toBeNull();
    expect(headers.get("referer")).toBeNull();
    expect(headers.get("sec-fetch-site")).toBeNull();
  });
});
