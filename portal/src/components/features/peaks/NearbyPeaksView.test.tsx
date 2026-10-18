import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";
import type { NearbyPeakResponse, PagedResponse } from "@/types/api";

vi.mock("./PeakMap", () => ({
  PeakMap: ({ points }: { points: readonly { id: string }[] }) => (
    <div data-testid="map">{points.length}</div>
  ),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { NearbyPeaksView } = await import("./NearbyPeaksView");

const Wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={messages}>
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  </NextIntlClientProvider>
);

const nearby = (items: NearbyPeakResponse[]): PagedResponse<NearbyPeakResponse> => ({
  items,
  page: 1,
  size: 20,
  totalCount: items.length,
  totalPages: 1,
});

const aneto: NearbyPeakResponse = {
  id: "peak-1",
  name: "Aneto",
  altitudeMeters: 3404,
  latitude: 42.63,
  longitude: 0.65,
  countryCode: "ES",
  region: null,
  imageUrl: null,
  imageAuthor: null,
  imageLicense: null,
  distanceMeters: 4200,
};

const respondWith = (body: unknown, status = 200) =>
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      ),
  );

const setOrigin = async () => {
  await userEvent.type(screen.getByLabelText("Latitude"), "42.6");
  await userEvent.type(screen.getByLabelText("Longitude"), "0.6");
  await userEvent.click(screen.getByRole("button", { name: "Search here" }));
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NearbyPeaksView", () => {
  it("nearbyPeaksView_beforePickingAnOrigin_invitesInsteadOfShowingAnError", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<NearbyPeaksView />, { wrapper: Wrapper });

    expect(
      screen.getByText("Pick a starting point to see the peaks around it."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("nearbyPeaksView_originChosen_listsThePeaksWithTheirDistance", async () => {
    respondWith(nearby([aneto]));
    render(<NearbyPeaksView />, { wrapper: Wrapper });

    await setOrigin();

    await waitFor(() =>
      expect(screen.getByText("4.2 km away")).toBeInTheDocument(),
    );
  });

  it("nearbyPeaksView_noPeaksInRadius_offersToWidenIt", async () => {
    respondWith(nearby([]));
    render(<NearbyPeaksView />, { wrapper: Wrapper });

    await setOrigin();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Widen the radius" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("nearbyPeaksView_domainRejection_showsTheTranslatedErrorNotARetryLoop", async () => {
    respondWith({ title: "Peak.RadiusOutOfRange" }, 400);
    render(<NearbyPeaksView />, { wrapper: Wrapper });

    await setOrigin();

    await waitFor(() =>
      expect(
        screen.getByText("The radius must be between 1 and 50 km."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("nearbyPeaksView_radiusSlider_announcesAReadableValueNotTheRawNumber", () => {
    respondWith(nearby([]));
    const { container } = render(<NearbyPeaksView />, { wrapper: Wrapper });

    const slider = container.querySelector('[role="slider"]');

    expect(slider).toHaveAttribute("aria-label", "Search radius");
    expect(slider).toHaveAttribute("aria-valuetext", "25 km");
    expect(slider).toHaveAttribute("aria-valuenow", "25000");
  });

  it("nearbyPeaksView_radiusTypedInKilometres_movesTheSlider", async () => {
    respondWith(nearby([]));
    const { container } = render(<NearbyPeaksView />, { wrapper: Wrapper });

    const input = screen.getByLabelText("Radius in kilometres");
    await userEvent.clear(input);
    await userEvent.type(input, "40");
    await userEvent.tab();

    expect(container.querySelector('[role="slider"]')).toHaveAttribute(
      "aria-valuenow",
      "40000",
    );
  });

  it("nearbyPeaksView_radiusTypedOverTheMaximum_isClampedInBothControls", async () => {
    respondWith(nearby([]));
    const { container } = render(<NearbyPeaksView />, { wrapper: Wrapper });

    const input = screen.getByLabelText("Radius in kilometres");
    await userEvent.clear(input);
    await userEvent.type(input, "9999");
    await userEvent.tab();

    expect(input).toHaveValue(50);
    expect(container.querySelector('[role="slider"]')).toHaveAttribute(
      "aria-valuenow",
      "50000",
    );
  });

  it("nearbyPeaksView_wideningTheRadius_keepsTheNumericInputInSync", async () => {
    respondWith(nearby([]));
    render(<NearbyPeaksView />, { wrapper: Wrapper });

    await setOrigin();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Widen the radius" }),
      ).toBeInTheDocument(),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Widen the radius" }),
    );

    expect(screen.getByLabelText("Radius in kilometres")).toHaveValue(50);
  });

  it("nearbyPeaksView_map_receivesTheSameResultsAsTheList", async () => {
    respondWith(nearby([aneto]));
    render(<NearbyPeaksView />, { wrapper: Wrapper });

    await setOrigin();

    await waitFor(() =>
      expect(screen.getByTestId("map")).toHaveTextContent("1"),
    );
  });
});
