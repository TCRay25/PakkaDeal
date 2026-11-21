"use client";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/lib/auth";
import { SocketProvider } from "@/lib/socket";
import { SettingsProvider } from "@/lib/settings";
import { I18nProvider } from "@/lib/i18n";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <AuthProvider>
        <SocketProvider>
          <SettingsProvider>
            <I18nProvider>
              {children}
            </I18nProvider>
          </SettingsProvider>
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
