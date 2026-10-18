import "server-only";
import { readAccessToken } from "@/lib/auth/cookies";
import { ApiError, readProblem, readSuccessBody } from "./client";
import { gatewayUrl } from "./gateway";

export interface ServerFetchOptions {
  authenticated?: boolean;
  revalidate?: number | false;
}

const authorization = async (
  authenticated: boolean,
): Promise<Record<string, string>> => {
  if (!authenticated) {
    return {};
  }

  const token = await readAccessToken();

  return token ? { Authorization: `Bearer ${token}` } : {};
};

const cacheOptions = (revalidate: number | false | undefined): RequestInit =>
  revalidate === undefined || revalidate === false
    ? { cache: "no-store" }
    : { next: { revalidate } };

export const serverFetch = async <T>(
  path: string,
  options: ServerFetchOptions = {},
): Promise<T> => {
  const response = await fetch(`${gatewayUrl()}/api/${path}`, {
    headers: {
      Accept: "application/json",
      ...(await authorization(options.authenticated ?? false)),
    },
    ...cacheOptions(options.revalidate),
  });

  if (!response.ok) {
    throw new ApiError(await readProblem(response));
  }

  return readSuccessBody<T>(response);
};
