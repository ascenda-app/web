import { expect, test } from "@playwright/test";
import fixtures from "./fixtures.json";
import { acceptCookies } from "./consent";

const fillRegister = async (
  page: import("@playwright/test").Page,
  email: string,
) => {
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Username", { exact: true }).fill(fixtures.validUsername);
  await page.getByLabel("Password", { exact: true }).fill(fixtures.validPassword);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
};

const signIn = async (
  page: import("@playwright/test").Page,
  password: string,
) => {
  await page.getByLabel("Email or username", { exact: true }).fill(fixtures.validUsername);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
};

test.beforeEach(async ({ context }) => acceptCookies(context));

test.describe("SC-07 · registro", () => {
  test("el alta correcta no inicia sesion y lleva al login con aviso", async ({
    page,
  }) => {
    await page.goto("/en/register");
    await fillRegister(page, fixtures.validEmail);

    await expect(page).toHaveURL(/\/en\/login\?registered=1$/);
    await expect(page.getByRole("status")).toContainText(
      "If that email address is valid, we have sent you a message",
    );
    const names = (await page.context().cookies()).map((cookie) => cookie.name);
    expect(names).not.toContain("ascenda_at");
    expect(names).not.toContain("ascenda_rt");
  });

  test("un correo ya registrado es indistinguible de uno nuevo", async ({
    page,
  }) => {
    await page.goto("/en/register");
    await fillRegister(page, fixtures.registeredEmail);

    await expect(page).toHaveURL(/\/en\/login\?registered=1$/);
    await expect(page.getByRole("status")).toContainText(
      "If that email address is valid, we have sent you a message",
    );
  });

  test("no se pintan botones de login social mientras no exista el endpoint", async ({
    page,
  }) => {
    await page.goto("/en/register");

    await expect(page.getByRole("button", { name: /Google|Apple/ })).toHaveCount(
      0,
    );
  });
});

test.describe("SC-08 · inicio de sesión", () => {
  test("las credenciales correctas fijan cookies httpOnly y llevan al panel", async ({
    page,
  }) => {
    await page.goto("/en/login");
    await signIn(page, fixtures.validPassword);

    await expect(page).toHaveURL(/\/en\/dashboard$/);

    const cookies = await page.context().cookies();
    const access = cookies.find((cookie) => cookie.name === "ascenda_at");

    expect(access?.httpOnly).toBe(true);
    expect(cookies.find((cookie) => cookie.name === "ascenda_rt")?.httpOnly).toBe(
      true,
    );
  });

  test("unas credenciales malas dan un mensaje generico sin culpar a un campo", async ({
    page,
  }) => {
    await page.goto("/en/login");
    await signIn(page, "contrasena-incorrecta");

    await expect(page.locator("form").getByRole("alert")).toContainText(
      "Those credentials aren't valid.",
    );
    await expect(page.getByLabel("Email or username", { exact: true })).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page).toHaveURL(/\/en\/login$/);
  });

  test("se ofrece recuperar la contrasena", async ({ page }) => {
    await page.goto("/en/login");

    await page.getByRole("link", { name: "Forgot your password?" }).click();

    await expect(page).toHaveURL(/\/en\/forgot-password$/);
  });

  test("un next relativo se respeta", async ({ page }) => {
    await page.goto("/en/login?next=%2Fen%2Fpeaks");
    await signIn(page, fixtures.validPassword);

    await expect(page).toHaveURL(/\/en\/peaks$/);
  });

  test("un next hacia otro dominio se ignora", async ({ page }) => {
    await page.goto("/en/login?next=%2F%2Fevil.com");
    await signIn(page, fixtures.validPassword);

    await expect(page).toHaveURL(/\/en\/dashboard$/);
  });
});

test.describe("SC-09 · confirmación de correo", () => {
  test("el enlace del correo sin locale conserva el token y confirma", async ({
    page,
  }) => {
    await page.goto(`/confirm-email?token=${fixtures.validToken}`);

    await expect(page.getByText("Your email is confirmed")).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp("/(en|es|zh|fr|ar)/confirm-email$"),
    );
  });

  test("el token desaparece de la barra de direcciones", async ({ page }) => {
    await page.goto(`/en/confirm-email?token=${fixtures.validToken}`);

    await expect(page.getByText("Your email is confirmed")).toBeVisible();
    expect(new URL(page.url()).search).toBe("");
  });

  test("la pagina del token no se indexa ni filtra el referer", async ({
    page,
  }) => {
    const response = await page.goto(
      `/en/confirm-email?token=${fixtures.validToken}`,
    );

    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  });

  test("un correo ya confirmado se trata como exito", async ({ page }) => {
    await page.goto(`/en/confirm-email?token=${fixtures.confirmedToken}`);

    await expect(
      page.getByText("Your email was already confirmed"),
    ).toBeVisible();
  });

  test("un token caducado ofrece pedir uno nuevo", async ({ page }) => {
    await page.goto(`/en/confirm-email?token=${fixtures.expiredToken}`);

    await expect(
      page.getByRole("link", { name: "Request a new link" }),
    ).toBeVisible();
  });

  test("sin token no se llama a la API", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (request) => calls.push(request.url()));

    await page.goto("/en/confirm-email");

    await expect(
      page.getByText("This link has no token."),
    ).toBeVisible();
    expect(calls.filter((url) => url.includes("email/confirm"))).toHaveLength(0);
  });
});

test.describe("SC-10 · reenvío", () => {
  test("sin sesion redirige al login conservando el destino", async ({
    page,
  }) => {
    await page.goto("/en/confirm-email/pending");

    await expect(page).toHaveURL(/\/en\/login\?next=/);
  });

  test("con sesion, reenviar arranca el contador y deshabilita el boton", async ({
    page,
  }) => {
    await page.goto("/en/login");
    await signIn(page, fixtures.validPassword);
    await expect(page).toHaveURL(/\/en\/dashboard$/);

    await page.goto("/en/confirm-email/pending");
    await page.getByRole("button", { name: "Resend link" }).click();

    await expect(page.getByRole("status")).toContainText("Link sent");
    await expect(page.getByRole("button", { name: "Resend link" })).toBeDisabled();
  });
});

test.describe("SC-22 · solicitar recuperación de contraseña", () => {
  test("un correo desconocido recibe la misma confirmacion generica", async ({
    page,
  }) => {
    await page.goto("/en/forgot-password");
    await page
      .getByLabel("Email address", { exact: true })
      .fill("nobody@example.com");
    await page.getByRole("button", { name: "Send me the link" }).click();

    await expect(page.getByRole("status")).toContainText(
      "If that email address has an account",
    );
  });
});

test.describe("SC-23 · fijar la contraseña nueva", () => {
  test("el enlace del correo sin locale funciona y borra el token de la URL", async ({
    page,
  }) => {
    await page.goto(`/reset-password?token=${fixtures.validToken}`);

    await expect(page).toHaveURL(/\/(en|es|zh|fr|ar)\/reset-password$/);
    await expect(
      page.getByRole("heading", { name: "Choose a new password" }),
    ).toBeVisible();
  });

  test("una contrasena valida lleva al login con el aviso", async ({ page }) => {
    await page.goto(`/en/reset-password?token=${fixtures.validToken}`);
    await page.getByLabel("New password", { exact: true }).fill(fixtures.validPassword);
    await page.getByRole("button", { name: "Change my password" }).click();

    await expect(page).toHaveURL(/\/en\/login\?reset=1$/);
    await expect(page.getByRole("status")).toContainText(
      "Your password has been changed",
    );
  });

  test("un token caducado se explica y ofrece empezar de nuevo", async ({
    page,
  }) => {
    await page.goto(`/en/reset-password?token=${fixtures.expiredToken}`);
    await page.getByLabel("New password", { exact: true }).fill(fixtures.validPassword);
    await page.getByRole("button", { name: "Change my password" }).click();

    await expect(page.getByRole("alert").first()).toContainText(
      "isn't valid, has already been used, or has expired",
    );
  });

  test("sin token se explica y se enlaza la pantalla de solicitud", async ({
    page,
  }) => {
    await page.goto("/en/reset-password");

    await expect(page.getByRole("alert").first()).toContainText(
      "This link has no token",
    );
    await page.getByRole("link", { name: "Request a new link" }).click();

    await expect(page).toHaveURL(/\/en\/forgot-password$/);
  });
});

test.describe("Guard de sesión", () => {
  test("el panel sin sesion sigue redirigiendo al login", async ({ page }) => {
    await page.goto("/en/dashboard");

    await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Fdashboard$/);
  });
});
