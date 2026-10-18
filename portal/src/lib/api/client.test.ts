import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, apiUpload, buildQuery, readProblem } from "./client";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildQuery", () => {
  it("buildQuery_populatedValues_buildsQueryString", () => {
    expect(buildQuery({ page: 2, size: 24, q: "aneto" })).toBe(
      "?page=2&size=24&q=aneto",
    );
  });

  it("buildQuery_emptyNullAndUndefined_areOmitted", () => {
    expect(buildQuery({ q: "", country: null, region: undefined, page: 1 })).toBe(
      "?page=1",
    );
  });

  it("buildQuery_noValues_returnsEmptyString", () => {
    expect(buildQuery({})).toBe("");
  });

  it("buildQuery_zeroValue_isKept", () => {
    expect(buildQuery({ minAltitude: 0 })).toBe("?minAltitude=0");
  });
});

describe("readProblem", () => {
  it("readProblem_problemDetailsBody_mergesTheStatus", async () => {
    const response = jsonResponse({ title: "Ascent.NotFound" }, 404);

    await expect(readProblem(response)).resolves.toEqual({
      status: 404,
      title: "Ascent.NotFound",
    });
  });

  it("readProblem_emptyBody_returnsOnlyTheStatus", async () => {
    const response = {
      status: 503,
      json: async () => {
        throw new Error("no body");
      },
    } as unknown as Response;

    await expect(readProblem(response)).resolves.toEqual({ status: 503 });
  });
});

describe("apiFetch", () => {
  it("apiFetch_successfulRequest_targetsTheBffAndReturnsTheBody", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "a1" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch<{ id: string }>("ascents/a1")).resolves.toEqual({
      id: "a1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/ascents/a1",
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });

  it("apiFetch_noContentResponse_resolvesUndefined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 204 } as Response),
    );

    await expect(apiFetch("ascents/a1")).resolves.toBeUndefined();
  });

  it("apiFetch_acceptedWithNoBody_resolvesUndefined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 202 })),
    );

    await expect(apiFetch("auth/register", { method: "POST" })).resolves.toBeUndefined();
  });

  it("apiFetch_okWithANonJsonBody_throwsApiErrorInsteadOfHidingIt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>proxy</html>", { status: 200 })),
    );

    await expect(apiFetch("peaks")).rejects.toMatchObject({
      name: "ApiError",
      problem: { status: 200, title: "Respuesta inesperada del servidor" },
    });
  });

  it("apiFetch_errorResponse_throwsApiErrorCarryingTheProblem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ title: "Ascent.NotOwned" }, 403)),
    );

    await expect(apiFetch("ascents/a1")).rejects.toMatchObject({
      problem: { status: 403, title: "Ascent.NotOwned" },
    });
  });

  it("apiFetch_errorWithoutTitle_usesTheStatusAsMessage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({}, 500)),
    );

    await expect(apiFetch("ascents")).rejects.toThrow("HTTP 500");
  });
});

describe("apiUpload", () => {
  it("apiUpload_multipartBody_sendsItWithoutContentTypeHeader", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "p1" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const body = new FormData();

    await apiUpload("ascents/a1/photos", body);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(body);
    expect(init.headers).toBeUndefined();
  });

  it("apiUpload_errorResponse_throwsApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ title: "Ascent.PhotoTooLarge" }, 400)),
    );

    await expect(apiUpload("ascents/a1/photos", new FormData())).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it("apiUpload_noContentResponse_resolvesUndefined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 204 } as Response),
    );

    await expect(
      apiUpload("profiles/me/avatar", new FormData(), { method: "DELETE" }),
    ).resolves.toBeUndefined();
  });
});
