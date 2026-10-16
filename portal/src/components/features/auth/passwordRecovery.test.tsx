import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntlWrapper } from "@/test/IntlWrapper";

const replace = vi.fn();
const apiFetch = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/reset-password",
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );

  return {
    ...actual,
    apiFetch: (path: string, init?: RequestInit) => apiFetch(path, init),
  };
});

const { ForgotPasswordForm } = await import("./ForgotPasswordForm");
const { ResetPasswordForm } = await import("./ResetPasswordForm");
const { ApiError } = await import("@/lib/api/client");

beforeEach(() => {
  window.history.replaceState(null, "", "/en/reset-password?token=abc");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("ForgotPasswordForm", () => {
  it("forgotPassword_validEmail_asksTheBackendAndConfirmsGenerically", async () => {
    apiFetch.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ForgotPasswordForm />, { wrapper: IntlWrapper });

    await user.type(screen.getByLabelText("Email address"), "hiker@example.com");
    await user.click(screen.getByRole("button", { name: "Send me the link" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("auth/password/forgot", {
        method: "POST",
        body: JSON.stringify({ email: "hiker@example.com" }),
      }),
    );
  });

  it("forgotPassword_afterSubmitting_neverRevealsWhetherTheAccountExists", async () => {
    apiFetch.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ForgotPasswordForm />, { wrapper: IntlWrapper });

    await user.type(screen.getByLabelText("Email address"), "hiker@example.com");
    await user.click(screen.getByRole("button", { name: "Send me the link" }));

    const confirmation = await screen.findByRole("status");

    expect(confirmation).toHaveTextContent("If that email address has an account");
  });

  it("forgotPassword_invalidEmail_saysSoInTheReadersLanguage", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />, {
      wrapper: ({ children }) => (
        <IntlWrapper locale="es">{children}</IntlWrapper>
      ),
    });

    await user.type(screen.getByLabelText("Correo electrónico"), "hiker@example");
    await user.click(screen.getByRole("button", { name: "Enviarme el enlace" }));

    expect(
      await screen.findByText("Ese correo electrónico no es válido."),
    ).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("forgotPassword_rateLimited_saysSoWithoutLeakingTheProblemDetail", async () => {
    apiFetch.mockRejectedValue(
      new ApiError({ status: 429, title: "Too many requests" }),
    );
    const user = userEvent.setup();
    render(<ForgotPasswordForm />, { wrapper: IntlWrapper });

    await user.type(screen.getByLabelText("Email address"), "hiker@example.com");
    await user.click(screen.getByRole("button", { name: "Send me the link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts.",
    );
  });
});

describe("ResetPasswordForm", () => {
  it("resetPassword_onMount_dropsTheTokenFromTheAddressBar", () => {
    render(<ResetPasswordForm token="abc" />, { wrapper: IntlWrapper });

    expect(window.location.search).toBe("");
  });

  it("resetPassword_validPassword_sendsTheTokenAndRedirectsToLogin", async () => {
    apiFetch.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ResetPasswordForm token="abc" />, { wrapper: IntlWrapper });

    await user.type(screen.getByLabelText("New password"), "brand-new-password");
    await user.click(
      screen.getByRole("button", { name: "Change my password" }),
    );

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("auth/password/reset", {
        method: "POST",
        body: JSON.stringify({
          token: "abc",
          newPassword: "brand-new-password",
        }),
      }),
    );
    expect(replace).toHaveBeenCalledWith("/login?reset=1");
  });

  it("resetPassword_shortPassword_explainsTheMinimumLength", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="abc" />, { wrapper: IntlWrapper });

    await user.type(screen.getByLabelText("New password"), "corta");
    await user.click(
      screen.getByRole("button", { name: "Change my password" }),
    );

    expect(
      await screen.findByText(
        "The password must be at least 10 characters long.",
      ),
    ).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("resetPassword_expiredToken_offersToStartOverInsteadOfARawError", async () => {
    apiFetch.mockRejectedValue(
      new ApiError({ status: 400, title: "PasswordReset.InvalidOrExpired" }),
    );
    const user = userEvent.setup();
    render(<ResetPasswordForm token="abc" />, { wrapper: IntlWrapper });

    await user.type(screen.getByLabelText("New password"), "brand-new-password");
    await user.click(
      screen.getByRole("button", { name: "Change my password" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "isn't valid, has already been used, or has expired",
    );
  });

  it("resetPassword_withoutToken_explainsItAndLinksToTheRequestScreen", () => {
    render(<ResetPasswordForm />, { wrapper: IntlWrapper });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This link has no token",
    );
    expect(
      screen.getByRole("link", { name: "Request a new link" }),
    ).toBeInTheDocument();
  });
});
