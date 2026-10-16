import { afterEach, describe, expect, it, vi } from "vitest";

const store = { get: vi.fn(), set: vi.fn() };

vi.mock("next/headers", () => ({ cookies: async () => store }));

const { clearSessionCookies, readAccessToken, readRefreshToken, writeSessionCookies } =
  await import("./cookies");

const tokens = {
  accessToken: "at",
  refreshToken: "rt",
  expiresInSeconds: 900,
  tokenType: "Bearer",
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const secureOf = (name: string): boolean | undefined =>
  store.set.mock.calls.find(([cookie]) => cookie === name)?.[2]?.secure;

describe("secure flag", () => {
  it("writeSessionCookies_explicitlyDisabled_dropsSecureSoHttpLocalhostKeepsTheSession", async () => {
    vi.stubEnv("AUTH_COOKIE_SECURE", "false");

    await writeSessionCookies(tokens);

    expect(secureOf("ascenda_at")).toBe(false);
    expect(secureOf("ascenda_rt")).toBe(false);
  });

  it("writeSessionCookies_explicitlyEnabled_setsSecureEvenOutsideProduction", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_COOKIE_SECURE", "true");

    await writeSessionCookies(tokens);

    expect(secureOf("ascenda_at")).toBe(true);
  });

  it("writeSessionCookies_unset_fallsBackToProductionMeaningSecure", async () => {
    vi.stubEnv("AUTH_COOKIE_SECURE", "");
    vi.stubEnv("NODE_ENV", "production");

    await writeSessionCookies(tokens);

    expect(secureOf("ascenda_at")).toBe(true);
  });

  it("writeSessionCookies_unsetOutsideProduction_leavesSecureOff", async () => {
    vi.stubEnv("AUTH_COOKIE_SECURE", "");
    vi.stubEnv("NODE_ENV", "development");

    await writeSessionCookies(tokens);

    expect(secureOf("ascenda_at")).toBe(false);
  });

  it("clearSessionCookies_repeatsTheSecureFlagItWasWrittenWith", async () => {
    vi.stubEnv("AUTH_COOKIE_SECURE", "false");

    await clearSessionCookies();

    expect(secureOf("ascenda_at")).toBe(false);
    expect(secureOf("ascenda_rt")).toBe(false);
  });
});

describe("readAccessToken", () => {
  it("readAccessToken_cookiePresent_returnsItsValue", async () => {
    store.get.mockReturnValue({ value: "at" });

    await expect(readAccessToken()).resolves.toBe("at");
    expect(store.get).toHaveBeenCalledWith("ascenda_at");
  });

  it("readAccessToken_cookieAbsent_returnsUndefined", async () => {
    store.get.mockReturnValue(undefined);

    await expect(readAccessToken()).resolves.toBeUndefined();
  });
});

describe("readRefreshToken", () => {
  it("readRefreshToken_cookiePresent_returnsItsValue", async () => {
    store.get.mockReturnValue({ value: "rt" });

    await expect(readRefreshToken()).resolves.toBe("rt");
    expect(store.get).toHaveBeenCalledWith("ascenda_rt");
  });
});

describe("writeSessionCookies", () => {
  it("writeSessionCookies_accessToken_isHttpOnlyAndScopedToTheWholeSite", async () => {
    await writeSessionCookies(tokens);

    expect(store.set).toHaveBeenCalledWith(
      "ascenda_at",
      "at",
      expect.objectContaining({ httpOnly: true, path: "/", maxAge: 900 }),
    );
  });

  it("writeSessionCookies_refreshToken_isScopedToTheWholeSiteSoEveryRouteCanRotate", async () => {
    await writeSessionCookies(tokens);

    expect(store.set).toHaveBeenCalledWith(
      "ascenda_rt",
      "rt",
      expect.objectContaining({
        httpOnly: true,
        path: "/",
        sameSite: "lax",
      }),
    );
  });

  it("writeSessionCookies_accessToken_staysLaxSoExternalLinksKeepTheSession", async () => {
    await writeSessionCookies(tokens);

    expect(store.set).toHaveBeenCalledWith(
      "ascenda_at",
      "at",
      expect.objectContaining({ path: "/", sameSite: "lax" }),
    );
  });

  it("writeSessionCookies_refreshToken_livesForThirtyDays", async () => {
    await writeSessionCookies(tokens);

    const call = store.set.mock.calls.find(([name]) => name === "ascenda_rt");

    expect(call?.[2]).toMatchObject({ maxAge: 60 * 60 * 24 * 30 });
  });
});

describe("clearSessionCookies", () => {
  it("clearSessionCookies_bothCookies_areExpiredOnTheSharedPath", async () => {
    await clearSessionCookies();

    expect(store.set).toHaveBeenCalledWith(
      "ascenda_at",
      "",
      expect.objectContaining({ maxAge: 0, path: "/" }),
    );
    expect(store.set).toHaveBeenCalledWith(
      "ascenda_rt",
      "",
      expect.objectContaining({ maxAge: 0, path: "/" }),
    );
  });

  it("clearSessionCookies_refreshToken_repeatsTheSameSiteItWasWrittenWith", async () => {
    await clearSessionCookies();

    expect(store.set).toHaveBeenCalledWith(
      "ascenda_rt",
      "",
      expect.objectContaining({ sameSite: "lax" }),
    );
  });
});
