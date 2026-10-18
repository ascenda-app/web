import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IntlWrapper } from "@/test/IntlWrapper";

const replace = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { RegisterForm } = await import("./RegisterForm");

const termsRequired =
  "You must confirm that you are at least 14 years old and accept the Terms of use and the Privacy policy.";

const respondWith = (status: number, body?: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      body === undefined
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
          }),
    ),
  );

const fillAndSubmit = async (overrides: Partial<Record<string, string>> = {}) => {
  await userEvent.type(
    screen.getByLabelText("Email address"),
    overrides.email ?? "ruben@correo.es",
  );
  await userEvent.type(
    screen.getByLabelText("Username"),
    overrides.username ?? "ruben",
  );
  await userEvent.type(
    screen.getByLabelText("Password"),
    overrides.password ?? "montana2026segura",
  );
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("RegisterForm", () => {
  it("registerForm_success_normalisesTheEmailAndTrimsTheUsername", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<RegisterForm />, { wrapper: IntlWrapper });

    await fillAndSubmit({ email: "Ruben@Correo.ES" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      email: "ruben@correo.es",
      username: "ruben",
      acceptedTerms: true,
    });
  });

  it("registerForm_termsCheckbox_isNeitherPrecheckedNorOptional", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<RegisterForm />, { wrapper: IntlWrapper });

    expect(screen.getByRole("checkbox")).not.toBeChecked();

    await userEvent.type(screen.getByLabelText("Email address"), "ruben@correo.es");
    await userEvent.type(screen.getByLabelText("Username"), "ruben");
    await userEvent.type(screen.getByLabelText("Password"), "montana2026segura");
    await userEvent.click(
      screen.getByRole("button", { name: "Create account" }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("registerForm_unacceptedTerms_explainsWhyTheFormDidNotSubmit", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<RegisterForm />, { wrapper: IntlWrapper });

    await userEvent.type(screen.getByLabelText("Email address"), "ruben@correo.es");
    await userEvent.type(screen.getByLabelText("Username"), "ruben");
    await userEvent.type(screen.getByLabelText("Password"), "montana2026segura");
    await userEvent.click(
      screen.getByRole("button", { name: "Create account" }),
    );

    const message = await screen.findByText(termsRequired);
    const checkbox = screen.getByRole("checkbox");

    expect(checkbox).toHaveAttribute("aria-invalid", "true");
    expect(checkbox).toHaveAttribute("aria-describedby", message.id);
  });

  it("registerForm_acceptedTermsAfterFailing_clearsTheMessage", async () => {
    respondWith(202);
    render(<RegisterForm />, { wrapper: IntlWrapper });

    await userEvent.type(screen.getByLabelText("Email address"), "ruben@correo.es");
    await userEvent.type(screen.getByLabelText("Username"), "ruben");
    await userEvent.type(screen.getByLabelText("Password"), "montana2026segura");
    await userEvent.click(
      screen.getByRole("button", { name: "Create account" }),
    );
    await screen.findByText(termsRequired);

    await userEvent.click(screen.getByRole("checkbox"));

    await waitFor(() =>
      expect(screen.queryByText(termsRequired)).toBeNull(),
    );
  });

  it("registerForm_success_doesNotSignInAndSendsToLogin", async () => {
    respondWith(202);
    render(<RegisterForm />, { wrapper: IntlWrapper });

    await fillAndSubmit();

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/login?registered=1"),
    );
  });

  it("registerForm_invalidEmail_isRejectedBeforeCallingTheApi", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<RegisterForm />, { wrapper: IntlWrapper });

    await fillAndSubmit({ email: "ruben@correo" });

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
    expect(
      await screen.findByText("That email address isn't valid."),
    ).toBeInTheDocument();
  });

  it("registerForm_usernameWithTwoSeparators_isRejectedBeforeCallingTheApi", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<RegisterForm />, { wrapper: IntlWrapper });

    await fillAndSubmit({ username: "ruben..val" });

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it("registerForm_shortPassword_isRejectedBeforeCallingTheApi", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<RegisterForm />, { wrapper: IntlWrapper });

    await fillAndSubmit({ password: "corta" });

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
    expect(
      await screen.findByText(
        "The password must be at least 10 characters long.",
      ),
    ).toBeInTheDocument();
  });

  it("registerForm_emptyFields_reportEachOneAsRequired", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<RegisterForm />, { wrapper: IntlWrapper });

    await userEvent.click(
      screen.getByRole("button", { name: "Create account" }),
    );

    await waitFor(() =>
      expect(screen.getAllByText("This field is required.")).toHaveLength(3),
    );
  });

  it("registerForm_spanishLocale_translatesTheValidationMessages", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<RegisterForm />, {
      wrapper: ({ children }) => (
        <IntlWrapper locale="es">{children}</IntlWrapper>
      ),
    });

    await userEvent.type(
      screen.getByLabelText("Correo electrónico"),
      "ruben@correo",
    );
    await userEvent.type(screen.getByLabelText("Nombre de usuario"), "ruben");
    await userEvent.type(screen.getByLabelText("Contraseña"), "corta");
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(
      await screen.findByText("Ese correo electrónico no es válido."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("La contraseña debe tener al menos 10 caracteres."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Too small|Invalid input/)).toBeNull();
  });

  it("registerForm_takenEmail_marksTheFieldAndOffersToSignIn", async () => {
    respondWith(409, { title: "User.EmailAlreadyRegistered" });
    render(<RegisterForm />, { wrapper: IntlWrapper });

    await fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByLabelText("Email address")).toHaveAttribute(
        "aria-invalid",
        "true",
      ),
    );
    expect(
      screen.getByRole("link", { name: "Sign in instead" }),
    ).toBeInTheDocument();
  });

  it("registerForm_takenUsername_marksTheUsernameField", async () => {
    respondWith(409, { title: "User.UsernameAlreadyRegistered" });
    render(<RegisterForm />, { wrapper: IntlWrapper });

    await fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByLabelText("Username")).toHaveAttribute(
        "aria-invalid",
        "true",
      ),
    );
  });

  it("registerForm_breachedPassword_marksThePasswordField", async () => {
    respondWith(400, { title: "User.PasswordBreached" });
    render(<RegisterForm />, { wrapper: IntlWrapper });

    await fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByLabelText("Password")).toHaveAttribute(
        "aria-invalid",
        "true",
      ),
    );
  });

  it("registerForm_rateLimited_showsItsOwnMessage", async () => {
    respondWith(429);
    render(<RegisterForm />, { wrapper: IntlWrapper });

    await fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Too many attempts. Wait a few minutes before trying again.",
      ),
    );
  });

  it("registerForm_socialButtons_areNotRenderedWhileTheEndpointDoesNotExist", () => {
    render(<RegisterForm />, { wrapper: IntlWrapper });

    expect(screen.queryByRole("button", { name: /Google|Apple/ })).toBeNull();
  });

  it("registerForm_passwordStrength_isShownButNeverBlocks", async () => {
    respondWith(202);
    render(<RegisterForm />, { wrapper: IntlWrapper });

    await userEvent.type(screen.getByLabelText("Password"), "aaaaaaaaaa");

    await waitFor(() =>
      expect(screen.getByText("Password strength: Weak")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).toBeEnabled();
  });
});
