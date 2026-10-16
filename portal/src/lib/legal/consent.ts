export const consentCookieName = "ascenda_cc";

const maxAgeSeconds = 60 * 60 * 24 * 182;

export interface CookieConsent {
  maps: boolean;
  decidedAtUtc: string;
}

export const parseConsent = (raw: string | undefined): CookieConsent | undefined => {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<CookieConsent>;

    return typeof parsed.maps === "boolean" &&
      typeof parsed.decidedAtUtc === "string"
      ? { maps: parsed.maps, decidedAtUtc: parsed.decidedAtUtc }
      : undefined;
  } catch {
    return undefined;
  }
};

const readCookie = (name: string): string | undefined =>
  document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);

export const readConsent = (): CookieConsent | undefined =>
  typeof document === "undefined"
    ? undefined
    : parseConsent(readCookie(consentCookieName));

export const writeConsent = (maps: boolean): CookieConsent => {
  const consent: CookieConsent = {
    maps,
    decidedAtUtc: new Date().toISOString(),
  };

  const value = encodeURIComponent(JSON.stringify(consent));
  const secure = window.location.protocol === "https:" ? "; Secure" : "";

  document.cookie = `${consentCookieName}=${value}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;

  return consent;
};
