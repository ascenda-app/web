import type { ProblemDetails } from "./problem";

export class ApiError extends Error {
  constructor(readonly problem: ProblemDetails) {
    super(problem.title ?? `HTTP ${problem.status}`);
    this.name = "ApiError";
  }
}

export const readProblem = async (
  response: Response,
): Promise<ProblemDetails> => {
  try {
    return { status: response.status, ...(await response.json()) };
  } catch {
    return { status: response.status };
  }
};

const jsonHeaders = (init?: RequestInit): HeadersInit => ({
  "Content-Type": "application/json",
  ...init?.headers,
});

export const readSuccessBody = async <T>(response: Response): Promise<T> => {
  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const body = await response.text();

  // Un 2xx sin cuerpo es una respuesta de éxito válida (202 Accepted, por
  // ejemplo): el contrato no incluye representación. Un cuerpo no vacío que no
  // sea JSON sí es inesperado y no debe silenciarse.
  if (body.trim() === "") {
    return undefined as T;
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new ApiError({
      status: response.status,
      title: "Respuesta inesperada del servidor",
      detail: `Se esperaba un cuerpo JSON y se recibió: ${body.slice(0, 80)}`,
    });
  }
};

export const apiFetch = async <T>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(`/api/bff/${path}`, {
    ...init,
    headers: jsonHeaders(init),
  });

  if (!response.ok) {
    throw new ApiError(await readProblem(response));
  }

  return readSuccessBody<T>(response);
};

export const apiUpload = async <T>(
  path: string,
  body: FormData,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(`/api/bff/${path}`, {
    ...init,
    method: init?.method ?? "POST",
    body,
  });

  if (!response.ok) {
    throw new ApiError(await readProblem(response));
  }

  return readSuccessBody<T>(response);
};

export const buildQuery = (
  params: Record<string, string | number | undefined | null>,
): string => {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }

  const query = search.toString();

  return query ? `?${query}` : "";
};
