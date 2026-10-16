"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AscentListView = "cards" | "table";

interface PreferencesState {
  ascentListView: AscentListView;
  setAscentListView: (view: AscentListView) => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      ascentListView: "cards",
      setAscentListView: (ascentListView) => set({ ascentListView }),
    }),
    { name: "ascenda-preferences" },
  ),
);
