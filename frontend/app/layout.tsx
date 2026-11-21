import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import Header from "@/components/Header";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "PakkaDeal | Trust & Escrow Platform for Bangladesh",
  description: "Delivery-charge and full-amount escrow for cash on delivery, rental deposits, and service deals in Bangladesh.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <body className="min-h-screen bg-white text-neutral-900 antialiased dark:bg-black dark:text-neutral-100 flex flex-col">
        <Providers>
          <Header />
          <div className="flex-1 w-full">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
