import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const intlHandled = vi.fn();
const rotateTokens = vi.fn();

vi.mock("next-intl/middleware", () => ({
  default: () => (incoming: NextRequest) => {
    const headers = new Headers(incoming.headers);
    intlHandled(headers.get("cookie"));

    return NextResponse.next({ request: { headers } });
  },
}));

vi.mock("@/lib/auth/rotate", () => ({
  rotateTokens: (refreshToken: string) => rotateTokens(refreshToken),
}));

const { config, proxy } = await import("./proxy");

interface RequestOptions {
  cookies?: Record<string, string>;
  acceptLanguage?: string;
}

const encode = (payload: Record<string, unknown>): string =>
  `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

const usableToken = (): string =>
  encode({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 900 });

const expiredToken = (): string =>
  encode({ sub: "u1", exp: Math.floor(Date.now() / 1000) - 1 });

const rotatedTokens = {
  accessToken: usableToken(),
  refreshToken: "rotated-rt",
  expiresInSeconds: 900,
  tokenType: "Bearer",
};

const request = (path: string, options: RequestOptions = {}): NextRequest => {
  const headers = new Headers();

  if (options.acceptLanguage) {
    headers.set("accept-language", options.acceptLanguage);
  }

  const cookiePairs = Object.entries(options.cookies ?? {});

  if (cookiePairs.length > 0) {
    headers.set(
      "cookie",
      cookiePairs.map(([name, value]) => `${name}=${value}`).join("; "),
    );
  }

  return new NextRequest(new Request(`http://localhost:3000${path}`, { headers }));
};

const expiredSession = (): RequestOptions => ({
  cookies: { ascenda_at: expiredToken(), ascenda_rt: "current-rt" },
});

const location = (response: NextResponse): URL =>
  new URL(response.headers.get("location") ?? "", "http://localhost:3000");

const setCookies = (response: NextResponse): string =>
  response.headers.get("set-cookie") ??
  response.headers.get("x-middleware-set-cookie") ??
  "";

beforeEach(() => {
  rotateTokens.mockResolvedValue({ status: "rotated", tokens: rotatedTokens });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("rutas sin prefijo de locale", () => {
  it("proxy_confirmEmailWithoutLocale_redirectsWith308", async () => {
    const response = await proxy(request("/confirm-email?token=abc123"));

    expect(response.status).toBe(308);
  });

  it("proxy_confirmEmailWithoutLocale_preservesTheOneShotToken", async () => {
    const response = await proxy(request("/confirm-email?token=abc123"));

    expect(location(response).search).toBe("?token=abc123");
  });

  it("proxy_confirmEmailWithLocaleCookie_usesTheStoredLocale", async () => {
    const response = await proxy(
      request("/confirm-email?token=t", { cookies: { NEXT_LOCALE: "fr" } }),
    );

    expect(location(response).pathname).toBe("/fr/confirm-email");
  });

  it("proxy_confirmEmailWithAcceptLanguage_negotiatesByQuality", async () => {
    const response = await proxy(
      request("/confirm-email?token=t", {
        acceptLanguage: "de;q=0.9, ar;q=0.95, en;q=0.5",
      }),
    );

    expect(location(response).pathname).toBe("/ar/confirm-email");
  });

  it("proxy_confirmEmailWithUnsupportedLanguages_fallsBackToDefault", async () => {
    const response = await proxy(
      request("/confirm-email?token=t", { acceptLanguage: "de-DE, pt;q=0.8" }),
    );

    expect(location(response).pathname).toBe("/en/confirm-email");
  });

  it("proxy_confirmEmailWithRegionalTag_matchesTheBaseLanguage", async () => {
    const response = await proxy(
      request("/confirm-email?token=t", { acceptLanguage: "es-AR,es;q=0.9" }),
    );

    expect(location(response).pathname).toBe("/es/confirm-email");
  });

  it("proxy_invalidLocaleCookie_isIgnored", async () => {
    const response = await proxy(
      request("/confirm-email?token=t", { cookies: { NEXT_LOCALE: "de" } }),
    );

    expect(location(response).pathname).toBe("/en/confirm-email");
  });

  it("proxy_confirmEmailAlreadyPrefixed_isNotRedirectedAgain", async () => {
    await proxy(request("/es/confirm-email?token=t"));

    expect(intlHandled).toHaveBeenCalledOnce();
  });
});

describe("guard de rutas privadas", () => {
  it("proxy_dashboardWithoutSession_redirectsToLogin", async () => {
    const response = await proxy(request("/en/dashboard"));

    expect(location(response).pathname).toBe("/en/login");
  });

  it("proxy_dashboardWithoutSession_carriesTheOriginalDestination", async () => {
    const response = await proxy(request("/es/dashboard/ascents/new?peakId=p1"));

    expect(location(response).searchParams.get("next")).toBe(
      "/es/dashboard/ascents/new?peakId=p1",
    );
  });

  it("proxy_dashboardWithUsableToken_isLetThrough", async () => {
    await proxy(
      request("/en/dashboard", { cookies: { ascenda_at: usableToken() } }),
    );

    expect(intlHandled).toHaveBeenCalledOnce();
  });

  it("proxy_publicRouteWithoutSession_isLetThrough", async () => {
    await proxy(request("/en/peaks"));

    expect(intlHandled).toHaveBeenCalledOnce();
  });

  it("proxy_routeNamedLikeTheDashboard_isNotConfusedWithIt", async () => {
    await proxy(request("/en/dashboards"));

    expect(intlHandled).toHaveBeenCalledOnce();
  });
});

describe("rotacion de la sesion caducada", () => {
  it("proxy_dashboardWithExpiredToken_rotatesInsteadOfRedirecting", async () => {
    const response = await proxy(request("/en/dashboard", expiredSession()));

    expect(rotateTokens).toHaveBeenCalledWith("current-rt");
    expect(response.headers.get("location")).toBeNull();
  });

  it("proxy_dashboardWithExpiredToken_exposesTheRotatedTokenToTheRender", async () => {
    await proxy(request("/en/dashboard", expiredSession()));

    expect(intlHandled).toHaveBeenCalledWith(
      expect.stringContaining(rotatedTokens.accessToken),
    );
  });

  it("proxy_dashboardWithExpiredToken_writesBothRotatedCookies", async () => {
    const response = await proxy(request("/en/dashboard", expiredSession()));
    const written = setCookies(response);

    expect(written).toContain(rotatedTokens.accessToken);
    expect(written).toContain("rotated-rt");
  });

  it("proxy_rotatedCookies_areScopedToTheWholeSiteAsLax", async () => {
    const response = await proxy(request("/en/dashboard", expiredSession()));
    const written = setCookies(response);

    expect(written).toContain("Path=/");
    expect(written.toLowerCase()).toContain("samesite=lax");
  });

  it("proxy_rejectedRefresh_redirectsToLoginAndClearsTheCookies", async () => {
    rotateTokens.mockResolvedValue({ status: "rejected" });

    const response = await proxy(request("/en/dashboard", expiredSession()));

    expect(location(response).pathname).toBe("/en/login");
    expect(setCookies(response)).toContain("Max-Age=0");
  });

  it("proxy_unreachableGateway_redirectsToLoginWithoutClearingTheSession", async () => {
    rotateTokens.mockResolvedValue({ status: "unreachable" });

    const response = await proxy(request("/en/dashboard", expiredSession()));

    expect(location(response).pathname).toBe("/en/login");
    expect(setCookies(response)).not.toContain("Max-Age=0");
  });

  it("proxy_dashboardWithoutRefreshCookie_neverCallsTheGateway", async () => {
    const response = await proxy(
      request("/en/dashboard", { cookies: { ascenda_at: expiredToken() } }),
    );

    expect(rotateTokens).not.toHaveBeenCalled();
    expect(location(response).pathname).toBe("/en/login");
  });

  it("proxy_publicRoute_neverRotates", async () => {
    await proxy(request("/en/peaks", expiredSession()));

    expect(rotateTokens).not.toHaveBeenCalled();
  });
});

describe("matcher", () => {
  it("config_matcher_excludesApiRoutesAndStaticAssets", () => {
    expect(config.matcher).toEqual(["/((?!api|_next|_vercel|.*\\..*).*)"]);
  });
});
