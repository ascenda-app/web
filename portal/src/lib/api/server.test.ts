import { afterEach, describe, expect, it, vi } from "vitest";

const readAccessToken = vi.fn();

vi.mock("@/lib/auth/cookies", () => ({
  readAccessToken: () => readAccessToken(),
}));

vi.mock("./gateway", () => ({
  gatewayUrl: () => "http://gateway:8080",
  correlationHeader: "X-Correlation-Id",
}));

const { serverFetch } = await import("./server");

const ok = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const lastInit = (mock: ReturnType<typeof vi.fn>): RequestInit =>
  (mock.mock.calls[0] as [string, RequestInit])[1];

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("serverFetch", () => {
  it("serverFetch_anonymousCall_doesNotSendAuthorization", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ id: "p1" }));
    vi.stubGlobal("fetch", fetchMock);

    await serverFetch("peaks/p1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://gateway:8080/api/peaks/p1",
      expect.anything(),
    );
    expect(lastInit(fetchMock).headers).not.toHaveProperty("Authorization");
    expect(readAccessToken).not.toHaveBeenCalled();
  });

  it("serverFetch_authenticatedCall_sendsTheBearerFromTheCookie", async () => {
    readAccessToken.mockResolvedValue("at");
    const fetchMock = vi.fn().mockResolvedValue(ok({}));
    vi.stubGlobal("fetch", fetchMock);

    await serverFetch("profiles/me", { authenticated: true });

    expect(lastInit(fetchMock).headers).toMatchObject({
      Authorization: "Bearer at",
    });
  });

  it("serverFetch_authenticatedWithoutCookie_omitsTheHeader", async () => {
    readAccessToken.mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue(ok({}));
    vi.stubGlobal("fetch", fetchMock);

    await serverFetch("profiles/me", { authenticated: true });

    expect(lastInit(fetchMock).headers).not.toHaveProperty("Authorization");
  });

  it("serverFetch_sessionDependentCall_disablesTheCache", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({}));
    vi.stubGlobal("fetch", fetchMock);

    await serverFetch("ascents");

    expect(lastInit(fetchMock)).toMatchObject({ cache: "no-store" });
  });

  it("serverFetch_withRevalidate_usesIncrementalRegeneration", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({}));
    vi.stubGlobal("fetch", fetchMock);

    await serverFetch("peaks/p1", { revalidate: 86400 });

    expect(lastInit(fetchMock)).toMatchObject({ next: { revalidate: 86400 } });
  });

  it("serverFetch_errorResponse_throwsApiErrorWithTheProblem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ title: "Peak.NotFound" }),
      } as Response),
    );

    await expect(serverFetch("peaks/missing")).rejects.toMatchObject({
      problem: { status: 404, title: "Peak.NotFound" },
    });
  });

  it("serverFetch_noContentResponse_resolvesUndefined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 204 } as Response),
    );

    await expect(serverFetch("ascents/a1")).resolves.toBeUndefined();
  });

  it("serverFetch_acceptedWithNoBody_resolvesUndefined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 202 })),
    );

    await expect(serverFetch("auth/register")).resolves.toBeUndefined();
  });

  it("serverFetch_okWithANonJsonBody_throwsApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>proxy</html>", { status: 200 })),
    );

    await expect(serverFetch("peaks")).rejects.toMatchObject({
      problem: { status: 200, title: "Respuesta inesperada del servidor" },
    });
  });
});
