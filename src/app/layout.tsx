import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { AccentInit } from "@/components/AccentInit";

export const metadata: Metadata = {
  title: "ZEPHYR",
  description: "Социальная сеть",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="antialiased" suppressHydrationWarning>
      <head>
        <AccentInit />
      </head>
      <body className="bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
