import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import fixtures from "./fixtures.json";
import { acceptCookies } from "./consent";

const signIn = async (page: Page) => {
  await page.goto("/en/login");
  await page.getByLabel("Email or username", { exact: true }).fill(fixtures.validUsername);
  await page.getByLabel("Password", { exact: true }).fill(fixtures.validPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
};

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test.beforeEach(async ({ context }) => acceptCookies(context));

test.describe("SC-11 · panel", () => {
  test("el panel compone saludo, cifras y ultimas ascensiones", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { level: 1, name: `Hello, ${fixtures.climberName}` }),
    ).toBeVisible();
    await expect(page.getByText("Your figures")).toBeVisible();
    await expect(page.getByText("Latest ascents")).toBeVisible();
  });

  test("las cifras advierten de la consistencia eventual", async ({ page }) => {
    await expect(page.getByText("Updated in a few seconds.")).toBeVisible();
  });

  test("el panel no se indexa", async ({ page }) => {
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });
});

test.describe("SC-12 · listado", () => {
  test("el listado muestra la visibilidad y no ofrece ordenacion", async ({
    page,
  }) => {
    await page.goto("/en/dashboard/ascents");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "My ascents",
    );
    await expect(page.getByText("Public").first()).toBeVisible();
    await expect(page.getByRole("searchbox")).toHaveCount(0);
  });

  test("la vista de tabla declara su orden fijo por fecha", async ({
    page,
    isMobile,
  }) => {
    test.skip(Boolean(isMobile), "El alternador no existe en movil (SC-12.6)");

    await page.goto("/en/dashboard/ascents");
    await page.getByRole("button", { name: "Table" }).click();

    await expect(
      page.getByRole("columnheader", { name: "Date" }),
    ).toHaveAttribute("aria-sort", "descending");
  });

  test("en movil no se ofrece la tabla porque no cabe", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Solo aplica al viewport movil");

    await page.goto("/en/dashboard/ascents");

    await expect(page.getByRole("button", { name: "Table" })).toBeHidden();
    await expect(page.getByRole("table")).toHaveCount(0);
  });
});

test.describe("SC-13 · registrar cumbre", () => {
  test("el pico preseleccionado llega elegido desde la ficha", async ({
    page,
  }) => {
    await page.goto(`/en/dashboard/ascents/new?peakId=${fixtures.peakId}`);

    await expect(
      page.getByText(`Selected: ${fixtures.peakName}`),
    ).toBeVisible();
  });

  test("registrar una cumbre lleva a su detalle", async ({ page }) => {
    await page.goto(`/en/dashboard/ascents/new?peakId=${fixtures.peakId}`);
    await page.getByLabel("Companions").fill("Ana, Luis");
    await page.getByRole("button", { name: "Save ascent" }).click();

    await expect(page).toHaveURL(
      new RegExp(`/en/dashboard/ascents/${fixtures.ascentId}$`),
    );
  });

  test("la fecha no admite valores futuros", async ({ page }) => {
    await page.goto(`/en/dashboard/ascents/new?peakId=${fixtures.peakId}`);

    const today = new Date().toISOString().slice(0, 10);
    await expect(page.getByLabel("Ascent date")).toHaveAttribute("max", today);
    await expect(page.getByLabel("Ascent date")).toHaveAttribute(
      "min",
      "1900-01-01",
    );
  });

  test("la visibilidad por defecto es publica", async ({ page }) => {
    await page.goto(`/en/dashboard/ascents/new?peakId=${fixtures.peakId}`);

    await expect(page.getByRole("radio", { name: /Public/ })).toBeChecked();
  });
});

test.describe("SC-14 · detalle propio", () => {
  test("el detalle permite gestionar fotos y editar", async ({ page }) => {
    await page.goto(`/en/dashboard/ascents/${fixtures.ascentId}`);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      fixtures.peakName,
    );
    await expect(page.getByRole("heading", { name: "Photos" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/en/dashboard/ascents/${fixtures.ascentId}/edit`,
    );
  });

  test("el detalle lleva a la ficha del pico", async ({ page }) => {
    await page.goto(`/en/dashboard/ascents/${fixtures.ascentId}`);

    await expect(
      page.getByRole("link", { name: `See the page for ${fixtures.peakName}` }),
    ).toHaveAttribute("href", `/en/peaks/${fixtures.peakId}`);
    await expect(page.getByText("See the peak page")).toBeVisible();
  });

  test("el aviso de fotos pendientes aparece al volver de registrar", async ({
    page,
  }) => {
    await page.goto(
      `/en/dashboard/ascents/${fixtures.ascentId}?photosFailed=2`,
    );

    await expect(page.getByRole("status")).toContainText(
      "2 photos couldn't be uploaded",
    );
    await expect(page.getByRole("status")).toContainText(
      "The ascent was saved.",
    );
  });
});

test.describe("SC-15 · editar y borrar", () => {
  test("el pico se muestra en solo lectura con su explicacion", async ({
    page,
  }) => {
    await page.goto(`/en/dashboard/ascents/${fixtures.ascentId}/edit`);

    await expect(page.getByText("The peak can't be changed")).toBeVisible();
    await expect(
      page.getByText("To correct the peak, delete this ascent and log it again."),
    ).toBeVisible();
  });

  test("guardar vuelve al detalle", async ({ page }) => {
    await page.goto(`/en/dashboard/ascents/${fixtures.ascentId}/edit`);
    await page.getByRole("button", { name: "Save ascent" }).click();

    await expect(page).toHaveURL(
      new RegExp(`/en/dashboard/ascents/${fixtures.ascentId}$`),
    );
  });

  test("borrar pide confirmacion y vuelve al listado", async ({ page }) => {
    await page.goto(`/en/dashboard/ascents/${fixtures.ascentId}/edit`);
    await page.getByRole("button", { name: "Delete ascent" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("This can't be undone.");

    await dialog.getByRole("button", { name: "Delete ascent" }).click();

    await expect(page).toHaveURL(/\/en\/dashboard\/ascents$/);
  });
});

test.describe("SC-11 · renovacion de la sesion", () => {
  const expireAccessToken = async (context: BrowserContext) => {
    const payload = Buffer.from(
      JSON.stringify({
        sub: fixtures.userId,
        email: fixtures.validEmail,
        exp: Math.floor(Date.now() / 1000) - 60,
      }),
    ).toString("base64url");

    await context.addCookies([
      {
        name: "ascenda_at",
        value: `header.${payload}.signature`,
        domain: "localhost",
        path: "/",
        httpOnly: true,
      },
    ]);
  };

  test("la cookie de refresco viaja por todo el sitio", async ({ context }) => {
    const refresh = (await context.cookies()).find(
      (cookie) => cookie.name === "ascenda_rt",
    );

    expect(refresh?.path).toBe("/");
    expect(refresh?.sameSite).toBe("Lax");
  });

  test("un access token caducado se renueva sin volver a pedir login", async ({
    page,
    context,
  }) => {
    await expireAccessToken(context);

    await page.goto("/en/dashboard");

    await expect(page).toHaveURL(/\/en\/dashboard$/);
    await expect(
      page.getByRole("heading", { level: 1, name: `Hello, ${fixtures.climberName}` }),
    ).toBeVisible();
    expect(
      (await context.cookies()).find((cookie) => cookie.name === "ascenda_rt")
        ?.value,
    ).toBe("rotated-refresh-token");
  });

  test("sin cookie de refresco el panel rebota al login", async ({
    page,
    context,
  }) => {
    await expireAccessToken(context);
    await context.clearCookies({ name: "ascenda_rt" });

    await page.goto("/en/dashboard");

    await expect(page).toHaveURL(/\/en\/login\?next=/);
  });
});
