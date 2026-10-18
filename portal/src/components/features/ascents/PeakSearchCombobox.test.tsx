import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";
import type { PagedResponse, PeakListItemResponse } from "@/types/api";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { PeakSearchCombobox } = await import("./PeakSearchCombobox");

const Wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={messages}>
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  </NextIntlClientProvider>
);

const item = (id: string, name: string): PeakListItemResponse => ({
  id,
  name,
  altitudeMeters: 3404,
  prominenceMeters: null,
  latitude: 42,
  longitude: 0,
  countryCode: "ES",
  region: null,
  imageUrl: null,
  imageAuthor: null,
  imageLicense: null,
});

const respondWith = (items: PeakListItemResponse[]) => {
  const page: PagedResponse<PeakListItemResponse> = {
    items,
    page: 1,
    size: 10,
    totalCount: items.length,
    totalPages: 1,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(page), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
};

const noop = () => undefined;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PeakSearchCombobox", () => {
  it("combobox_render_followsTheAriaComboboxPattern", () => {
    respondWith([]);
    render(<PeakSearchCombobox onSelect={noop} onClear={noop} />, {
      wrapper: Wrapper,
    });

    const input = screen.getByRole("combobox");

    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-controls");
  });

  it("combobox_typing_showsTheMatchesAsOptions", async () => {
    respondWith([item("p1", "Aneto"), item("p2", "Aneto Norte")]);
    render(<PeakSearchCombobox onSelect={noop} onClear={noop} />, {
      wrapper: Wrapper,
    });

    await userEvent.type(screen.getByRole("combobox"), "aneto");

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("combobox_resultCount_isAnnouncedPolitely", async () => {
    respondWith([item("p1", "Aneto")]);
    const { container } = render(
      <PeakSearchCombobox onSelect={noop} onClear={noop} />,
      { wrapper: Wrapper },
    );

    await userEvent.type(screen.getByRole("combobox"), "aneto");

    await waitFor(() =>
      expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent(
        "1 result",
      ),
    );
  });

  it("combobox_arrowKeys_moveTheActiveDescendant", async () => {
    respondWith([item("p1", "Aneto"), item("p2", "Aneto Norte")]);
    render(<PeakSearchCombobox onSelect={noop} onClear={noop} />, {
      wrapper: Wrapper,
    });

    const input = screen.getByRole("combobox");
    await userEvent.type(input, "aneto");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));

    await userEvent.keyboard("{ArrowDown}");

    expect(screen.getAllByRole("option")[1]).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("combobox_enter_selectsTheActiveOption", async () => {
    respondWith([item("p1", "Aneto")]);
    const onSelect = vi.fn();
    render(<PeakSearchCombobox onSelect={onSelect} onClear={noop} />, {
      wrapper: Wrapper,
    });

    await userEvent.type(screen.getByRole("combobox"), "aneto");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    await userEvent.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith({
      id: "p1",
      name: "Aneto",
      altitudeMeters: 3404,
    });
  });

  it("combobox_escape_closesTheList", async () => {
    respondWith([item("p1", "Aneto")]);
    render(<PeakSearchCombobox onSelect={noop} onClear={noop} />, {
      wrapper: Wrapper,
    });

    await userEvent.type(screen.getByRole("combobox"), "aneto");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("option")).toBeNull();
  });

  it("combobox_noMatches_offersTheCatalogue", async () => {
    respondWith([]);
    render(<PeakSearchCombobox onSelect={noop} onClear={noop} />, {
      wrapper: Wrapper,
    });

    await userEvent.type(screen.getByRole("combobox"), "zzz");

    await waitFor(() =>
      expect(screen.getByText('No peaks match "zzz"')).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("link", { name: "Browse the catalogue" }),
    ).toHaveAttribute("href", "/peaks");
  });

  it("combobox_selectedPeak_showsItWithAChangeButtonInsteadOfTheInput", () => {
    respondWith([]);
    render(
      <PeakSearchCombobox
        selected={{ id: "p1", name: "Aneto", altitudeMeters: 3404 }}
        onSelect={noop}
        onClear={noop}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText("Selected: Aneto")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Change peak" }),
    ).toBeInTheDocument();
  });

  it("combobox_change_clearsTheSelection", async () => {
    respondWith([]);
    const onClear = vi.fn();
    render(
      <PeakSearchCombobox
        selected={{ id: "p1", name: "Aneto", altitudeMeters: 3404 }}
        onSelect={noop}
        onClear={onClear}
      />,
      { wrapper: Wrapper },
    );

    await userEvent.click(screen.getByRole("button", { name: "Change peak" }));

    expect(onClear).toHaveBeenCalledOnce();
  });
});
