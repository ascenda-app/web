import { Noto_Sans, Noto_Sans_Arabic, Noto_Sans_SC } from "next/font/google";
import type { Locale } from "@/i18n/config";

const latin = Noto_Sans({
  variable: "--font-ascenda-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const arabic = Noto_Sans_Arabic({
  variable: "--font-ascenda-sans",
  subsets: ["arabic"],
  display: "swap",
  preload: true,
});

const simplifiedChinese = Noto_Sans_SC({
  variable: "--font-ascenda-sans",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const fontClassName = (locale: Locale): string => {
  if (locale === "ar") {
    return arabic.variable;
  }

  return locale === "zh" ? simplifiedChinese.variable : latin.variable;
};

export const leadingClassName = (locale: Locale): string =>
  locale === "ar" || locale === "zh" ? "leading-relaxed" : "";
