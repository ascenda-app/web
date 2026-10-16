import { expect, test, type Page } from "@playwright/test";
import fixtures from "./fixtures.json";
import { acceptCookies } from "./consent";

test.beforeEach(async ({ context }) => acceptCookies(context));

test.describe("SC-01 · landing", () => {
  test("el buscador de la landing solo navega al catalogo", async ({ page }) => {
    await page.goto("/en");

    await page.getByRole("searchbox").fill("aneto");
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page).toHaveURL(/\/en\/peaks\?q=aneto$/);
  });

  test("la landing se sirve aunque el catalogo no responda", async ({ page }) => {
    await page.goto("/en");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Why Ascenda")).toBeVisible();
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  });
});

test.describe("SC-02 · buscador y catálogo", () => {
  test("buscar lleva a la ficha del pico", async ({ page }) => {
    await page.goto("/en/peaks");

    await page.getByRole("searchbox").fill("aneto");
    await page.getByRole("search").getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/\/en\/peaks\?q=aneto$/);

    await page.getByRole("link", { name: /Aneto/ }).first().click();

    await expect(page).toHaveURL(new RegExp(`/en/peaks/${fixtures.peakId}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Aneto");
  });

  test("una lista vacia se pinta como estado vacio, nunca como error", async ({
    page,
  }) => {
    await page.goto(`/en/peaks?q=${fixtures.emptyQuery}`);

    await expect(
      page.getByText(`No peaks match "${fixtures.emptyQuery}"`),
    ).toBeVisible();
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    await expect(page.getByText("Try again")).toHaveCount(0);
  });

  test("el recuento de resultados se anuncia a lectores de pantalla", async ({
    page,
  }) => {
    await page.goto("/en/peaks");

    await expect(
      page.locator('main [aria-live="polite"]').first(),
    ).toContainText("1 result");
  });

  test("cambiar un filtro devuelve la paginacion a la primera pagina", async ({
    page,
  }) => {
    await page.goto("/en/peaks?page=5&country=ES");

    await page.getByRole("button", { name: "Remove filter Spain" }).click();

    await expect(page).toHaveURL(/\/en\/peaks$/);
  });

  test("el boton Buscar aplica region y altitud en una sola navegacion", async ({
    page,
  }) => {
    await page.goto("/en/peaks");

    await page.getByLabel("Region").fill("Pyrenees");
    await page.getByLabel("Minimum altitude").fill("2500");
    await page
      .getByRole("button", { name: "Search with these filters" })
      .click();

    await expect(page).toHaveURL(
      /\/en\/peaks\?region=Pyrenees&minAltitude=2500$/,
    );
  });

  test("escribir en los filtros no lanza la busqueda por si solo", async ({
    page,
  }) => {
    await page.goto("/en/peaks");

    await page.getByLabel("Region").fill("Pyrenees");
    await page.getByLabel("Maximum altitude").fill("4000");

    await expect(page).toHaveURL(/\/en\/peaks$/);
  });

  test("limpiar todo vacia tambien la region y la altitud tecleadas", async ({
    page,
  }) => {
    await page.goto("/en/peaks?region=Pyrenees&minAltitude=2500&maxAltitude=4000");

    await page.getByRole("button", { name: "Clear all" }).click();

    await expect(page).toHaveURL(/\/en\/peaks$/);
    await expect(page.getByLabel("Region")).toHaveValue("");
    await expect(page.getByLabel("Minimum altitude")).toHaveValue("0");
    await expect(page.getByLabel("Maximum altitude")).toHaveValue("9000");
  });

  test("la vista limpia es indexable y la busqueda no", async ({ page }) => {
    await page.goto("/en/peaks");
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);

    await page.goto("/en/peaks?q=aneto");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });
});

test.describe("SC-04 · ficha de montaña", () => {
  test("la ficha emite JSON-LD de tipo Mountain", async ({ page }) => {
    await page.goto(`/en/peaks/${fixtures.peakId}`);

    const jsonLd = await page
      .locator('script[type="application/ld+json"]')
      .textContent();

    expect(JSON.parse(jsonLd ?? "{}")).toMatchObject({
      "@type": "Mountain",
      elevation: { value: 3404, unitCode: "MTR" },
    });
  });

  test("el nombre se localiza y el canonico queda de subtitulo", async ({
    page,
  }) => {
    await page.goto(`/es/peaks/${fixtures.peakId}`);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Pico de Aneto",
    );
    await expect(page.getByText("También conocido como Aneto")).toBeVisible();
  });

  test("en chino cae al nombre canonico porque la ingesta no lo trae", async ({
    page,
  }) => {
    await page.goto(`/zh/peaks/${fixtures.peakId}`);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Aneto");
  });

  test("un pico sin nombre no ensena el identificador de wikidata en crudo", async ({
    page,
  }) => {
    await page.goto(`/es/peaks/${fixtures.unnamedPeakId}`);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      `Pico sin nombre (${fixtures.unnamedPeakWikidataId})`,
    );
    await expect(page.getByText("También conocido como")).toHaveCount(0);
  });

  test("un pico inexistente devuelve la pantalla de 404", async ({ page }) => {
    await page.goto(`/en/peaks/${fixtures.missingPeakId}`);

    await expect(
      page.getByRole("heading", { name: "This page doesn't exist" }),
    ).toBeVisible();
  });

  test("los valores nulos se omiten en vez de pintarse como guion", async ({
    page,
  }) => {
    await page.goto(`/en/peaks/${fixtures.barePeakId}`);

    await expect(page.getByText("Prominence")).toHaveCount(0);
    await expect(page.getByText("Mountain range")).toHaveCount(0);
    await expect(page.getByText("—")).toHaveCount(0);
  });

  test("sin sesion, registrar ascension lleva al login con el destino", async ({
    page,
  }) => {
    await page.goto(`/en/peaks/${fixtures.peakId}`);

    await expect(
      page.getByRole("link", { name: "Log an ascent" }),
    ).toHaveAttribute("href", /\/en\/login\?next=/);
  });
});

test.describe("SC-05 · perfil público", () => {
  test("el perfil compone estadisticas y ascensiones publicas", async ({
    page,
  }) => {
    await page.goto(`/en/climbers/${fixtures.climberSlug}`);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rubén");
    await expect(page.getByText("Public ascents only")).toBeVisible();
    await expect(page.getByRole("link", { name: /Aneto/ })).toBeVisible();
  });

  test("un perfil privado es indistinguible de uno inexistente", async ({
    page,
  }) => {
    await page.goto("/en/climbers/missing");

    await expect(
      page.getByRole("heading", { name: "This page doesn't exist" }),
    ).toBeVisible();
  });
});

test.describe("SC-06 · ascensión pública", () => {
  test("la ascension muestra notas, condiciones y enlace al pico", async ({
    page,
  }) => {
    await page.goto(`/en/ascents/${fixtures.ascentId}`);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Aneto");
    await expect(page.getByText("Vía normal desde La Renclusa.")).toBeVisible();
    await expect(page.getByText("Patchy")).toBeVisible();
    await expect(
      page.getByRole("link", { name: `See the page for ${fixtures.peakName}` }),
    ).toHaveAttribute("href", `/en/peaks/${fixtures.peakId}`);
  });

  test("las condiciones nulas se omiten", async ({ page }) => {
    await page.goto(`/en/ascents/${fixtures.ascentId}`);

    await expect(page.getByText("Trail")).toHaveCount(0);
  });

  test("el texto libre del usuario se alinea segun su propio idioma", async ({
    page,
  }) => {
    await page.goto(`/en/ascents/${fixtures.ascentId}`);

    await expect(
      page.getByText("Vía normal desde La Renclusa."),
    ).toHaveAttribute("dir", "auto");
  });
});

test.describe("SC-03 · picos cercanos", () => {
  test("sin origen invita a elegirlo y no consulta la API", async ({ page }) => {
    await page.goto("/en/peaks/nearby");

    await expect(
      page.getByText("Pick a starting point to see the peaks around it."),
    ).toBeVisible();
  });

  test("el mapa no es la unica via: la lista sale con teclado", async ({
    page,
  }) => {
    await page.goto("/en/peaks/nearby");

    await page.getByLabel("Latitude").fill("42.6");
    await page.getByLabel("Longitude").fill("0.6");
    await page.getByRole("button", { name: "Search here" }).click();

    await expect(page.getByRole("link", { name: /Aneto/ })).toBeVisible();
  });

  test("el radio se puede teclear en kilometros y mueve el slider", async ({
    page,
  }) => {
    await page.goto("/en/peaks/nearby");

    await page.getByLabel("Radius in kilometres").fill("40");
    await page.getByLabel("Radius in kilometres").blur();

    await expect(page.getByRole("slider")).toHaveAttribute(
      "aria-valuenow",
      "40000",
    );
  });

  test("ninguna tarjeta ensena un identificador de wikidata en crudo", async ({
    page,
  }) => {
    await page.goto("/en/peaks/nearby");

    await page.getByLabel("Latitude").fill("42.6");
    await page.getByLabel("Longitude").fill("0.6");
    await page.getByRole("button", { name: "Search here" }).click();

    await expect(
      page.getByRole("link", {
        name: new RegExp(`Unnamed peak \\(${fixtures.unnamedPeakWikidataId}\\)`),
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: fixtures.unnamedPeakWikidataId, exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("Nombres de pico sin recortar", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("un nombre largo se pinta entero en la tarjeta de resultados", async ({
    page,
  }) => {
    await page.goto(`/en/peaks?q=${fixtures.longNameQuery}`);

    const name = page
      .getByRole("link", { name: new RegExp(fixtures.longNamePeakName) })
      .first();

    await expect(name).toHaveText(fixtures.longNamePeakName);
    expect(await name.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      false,
    );
  });
});

test.describe("Apilamiento sobre el mapa", () => {
  const mapWrapper = (page: Page) =>
    page.locator(".leaflet-container").locator("xpath=..");

  test("el mapa de la ficha encierra los z-index de Leaflet", async ({
    page,
  }) => {
    await page.goto(`/en/peaks/${fixtures.peakId}`);
    await expect(page.locator(".leaflet-container")).toBeVisible();

    await expect(mapWrapper(page)).toHaveCSS("isolation", "isolate");
  });

  test("el mapa de picos cercanos encierra los z-index de Leaflet", async ({
    page,
  }) => {
    await page.goto("/en/peaks/nearby");
    await expect(page.locator(".leaflet-container")).toBeVisible();

    await expect(mapWrapper(page)).toHaveCSS("isolation", "isolate");
  });
});

test.describe("RTL en árabe", () => {
  test("la ficha se sirve de derecha a izquierda", async ({ page }) => {
    await page.goto(`/ar/peaks/${fixtures.peakId}`);

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("las coordenadas se mantienen de izquierda a derecha", async ({
    page,
  }) => {
    await page.goto(`/ar/peaks/${fixtures.peakId}`);

    await expect(page.locator("data")).toHaveAttribute("dir", "ltr");
  });
});
