"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface EmailConfirmationState {
  unconfirmed: boolean;
  markUnconfirmed: () => void;
  clear: () => void;
}

export const useEmailConfirmation = create<EmailConfirmationState>()(
  persist(
    (set) => ({
      unconfirmed: false,
      markUnconfirmed: () => set({ unconfirmed: true }),
      clear: () => set({ unconfirmed: false }),
    }),
    { name: "ascenda-email-confirmation" },
  ),
);
