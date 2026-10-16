import { expect, test, type Page } from "@playwright/test";
import fixtures from "./fixtures.json";
import { acceptCookies } from "./consent";

const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const signIn = async (page: Page) => {
  await page.goto("/en/login");
  await page.getByLabel("Email or username", { exact: true }).fill(fixtures.validUsername);
  await page.getByLabel("Password", { exact: true }).fill(fixtures.validPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
};

const recordBffCalls = (page: Page) => {
  const calls: string[] = [];

  page.on("request", (request) => {
    const { pathname } = new URL(request.url());

    if (pathname.startsWith("/api/bff/")) {
      calls.push(`${request.method()} ${pathname.replace("/api/bff/", "")}`);
    }
  });

  return calls;
};

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test.beforeEach(async ({ context }) => acceptCookies(context));

test.describe("SC-16 · ajustes de perfil", () => {
  test("las tres tarjetas son formularios independientes", async ({ page }) => {
    await page.goto("/en/dashboard/settings/profile");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Profile");
    await expect(page.getByRole("button", { name: "Save details" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save address" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Change photo" })).toBeVisible();
  });

  test("guardar los datos solo llama a su endpoint y avisa con un toast", async ({
    page,
  }) => {
    const calls = recordBffCalls(page);
    await page.goto("/en/dashboard/settings/profile");

    await page.getByLabel("Bio", { exact: true }).fill("Pirineos y Alpes.");
    await page.getByRole("button", { name: "Save details" }).click();

    await expect(page.getByText("Details saved.")).toBeVisible();
    expect(calls.filter((call) => call.startsWith("PUT"))).toEqual([
      "PUT profiles/me",
    ]);
  });

  test("la ayuda avisa de que el nombre de usuario no se cambia", async ({
    page,
  }) => {
    await page.goto("/en/dashboard/settings/profile");

    await expect(
      page.getByText(/it isn't your username: that one can't be changed/),
    ).toBeVisible();
  });

  test("el slug ocupado se muestra en linea y no como toast", async ({ page }) => {
    await page.goto("/en/dashboard/settings/profile");

    await page.getByLabel("Your address", { exact: true }).fill(fixtures.takenSlug);
    await page.getByRole("button", { name: "Save address" }).click();

    await expect(page.getByText("That address is already taken.")).toBeVisible();
    await expect(page.getByText("Address saved.")).toHaveCount(0);
  });

  test("guardar la direccion no toca los datos del perfil", async ({ page }) => {
    const calls = recordBffCalls(page);
    await page.goto("/en/dashboard/settings/profile");

    await page.getByRole("button", { name: "Save address" }).click();

    await expect(page.getByText("Address saved.")).toBeVisible();
    expect(calls.filter((call) => call.startsWith("PUT"))).toEqual([
      "PUT profiles/me/slug",
    ]);
  });

  test("un slug invalido se rechaza sin llamar al gateway", async ({ page }) => {
    const calls = recordBffCalls(page);
    await page.goto("/en/dashboard/settings/profile");

    await page.getByLabel("Your address", { exact: true }).fill("Ruben Val");
    await page.getByRole("button", { name: "Save address" }).click();

    await expect(
      page.getByText(
        "Use lowercase letters, digits and hyphens, up to 80 characters.",
      ),
    ).toBeVisible();
    expect(calls.filter((call) => call.includes("slug"))).toEqual([]);
  });

  test("pasar el perfil a privado pide confirmacion antes de guardar", async ({
    page,
  }) => {
    const calls = recordBffCalls(page);
    await page.goto("/en/dashboard/settings/profile");

    await page.getByLabel("Profile visibility", { exact: true }).click();
    await page.getByRole("option", { name: "Private" }).click();
    await page.getByRole("button", { name: "Save details" }).click();

    await expect(page.getByRole("alertdialog")).toContainText(
      "your public ascents will stop being visible",
    );
    expect(calls.filter((call) => call.startsWith("PUT"))).toEqual([]);

    await page.getByRole("button", { name: "Make it private" }).click();
    await expect(page.getByText("Details saved.")).toBeVisible();
  });

  test("sin foto no se ofrece quitarla", async ({ page }) => {
    await page.goto("/en/dashboard/settings/profile");

    await expect(page.getByText("No photo yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove photo" })).toHaveCount(0);
  });

  test("una imagen valida se sube y se confirma", async ({ page }) => {
    await page.goto("/en/dashboard/settings/profile");

    await page.locator('input[type="file"]').setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: pngBytes,
    });

    await expect(page.getByText("Photo updated.")).toBeVisible();
  });

  test("una imagen de mas de 5 MB se rechaza sin subirla", async ({ page }) => {
    const calls = recordBffCalls(page);
    await page.goto("/en/dashboard/settings/profile");

    await page.locator('input[type="file"]').setInputFiles({
      name: "grande.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    });

    await expect(
      page.getByText("The image can't be larger than 5 MB."),
    ).toBeVisible();
    expect(calls.filter((call) => call.includes("avatar"))).toEqual([]);
  });

  test("la pantalla no se indexa", async ({ page }) => {
    await page.goto("/en/dashboard/settings/profile");

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });

  test("en arabe la vista previa de la direccion sigue de izquierda a derecha", async ({
    page,
  }) => {
    await page.goto("/ar/dashboard/settings/profile");

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(
      page.locator('p[dir="ltr"]', { hasText: fixtures.climberSlug }),
    ).toHaveAttribute("dir", "ltr");
  });
});

test.describe("SC-17 · ajustes de cuenta", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/dashboard/settings/account");
  });

  test("la tarjeta de sesion advierte de los quince minutos del token", async ({
    page,
  }) => {
    await expect(
      page.getByText(/the access token stays valid for up to 15 minutes/),
    ).toBeVisible();
  });

  test("las preferencias solo ofrecen metros", async ({ page }) => {
    await expect(page.getByText("Units: Metres")).toBeVisible();
    await expect(page.getByText("Feet aren't available yet.")).toBeVisible();
  });

  test("el diálogo de baja enumera que el correo no se libera", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Close my account" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("listitem")).toHaveCount(4);
    await expect(dialog).toContainText(
      "Your email address and username will NOT be freed",
    );
  });

  test("el boton destructivo sigue bloqueado hasta que el texto coincide", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Close my account" }).click();

    const dialog = page.getByRole("alertdialog");
    const confirm = dialog.getByRole("button", { name: "Close my account" });

    await expect(confirm).toBeDisabled();

    await dialog.getByLabel("Confirmation").fill("ruben");
    await expect(confirm).toBeDisabled();

    await dialog.getByLabel("Confirmation").fill(fixtures.climberName);
    await expect(confirm).toBeDisabled();

    await dialog
      .getByLabel("Enter your password to confirm.")
      .fill(fixtures.validPassword);
    await expect(confirm).toBeEnabled();
  });

  test("darse de baja borra las cookies y despide en la portada", async ({
    page,
    context,
  }) => {
    await page.getByRole("button", { name: "Close my account" }).click();

    const dialog = page.getByRole("alertdialog");
    await dialog.getByLabel("Confirmation").fill(fixtures.climberName);
    await dialog
      .getByLabel("Enter your password to confirm.")
      .fill(fixtures.validPassword);
    await dialog.getByRole("button", { name: "Close my account" }).click();

    await expect(page).toHaveURL(/\/en\?deleted=1$/);
    await expect(page.getByText("Your account has been closed")).toBeVisible();

    const names = (await context.cookies()).map((cookie) => cookie.name);
    expect(names).not.toContain("ascenda_at");
    expect(names).not.toContain("ascenda_rt");
  });

  test("tras la baja el panel deja de ser accesible", async ({ page }) => {
    await page.getByRole("button", { name: "Close my account" }).click();

    const dialog = page.getByRole("alertdialog");
    await dialog.getByLabel("Confirmation").fill(fixtures.climberName);
    await dialog
      .getByLabel("Enter your password to confirm.")
      .fill(fixtures.validPassword);
    await dialog.getByRole("button", { name: "Close my account" }).click();
    await expect(page).toHaveURL(/\/en\?deleted=1$/);

    await page.goto("/en/dashboard");

    await expect(page).toHaveURL(/\/en\/login/);
  });

  test("cerrar sesion lleva a la portada sin mensaje de despedida", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/en$/);
    await expect(page.getByText("Your account has been closed")).toHaveCount(0);
  });
});
