import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono, Inter, Outfit } from "next/font/google";
import "./globals.css";
import Preloader from "@/components/Preloader";
import { UIProvider } from "@/context/UIContext";
import { TelegramProvider } from "@/context/TelegramContext";
import { ToastProvider } from "@/components/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tonpixo",
  description: "AI-powered analysis for TON Blockchain",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const runtimeBackendConfig = {
    apiUrl: process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || "",
    streamUrl:
      process.env.BACKEND_STREAM_URL ||
      process.env.NEXT_PUBLIC_STREAM_URL ||
      process.env.BACKEND_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "",
    assetsBaseUrl:
      process.env.ASSETS_BASE_URL ||
      process.env.NEXT_PUBLIC_ASSETS_BASE_URL ||
      "",
  };

  const runtimeBackendConfigScript = `window.__TONPIXO_BACKEND_CONFIG__=${JSON.stringify(runtimeBackendConfig).replace(/</g, "\\u003c")};`;

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${outfit.variable} antialiased relative`}
      >
        {/* Persistent Background to prevent black blinks */}
        <div className="fixed inset-0 bg-gradient-to-br from-[#4FC3F7] to-[#29B6F6] -z-10" />
        <script dangerouslySetInnerHTML={{ __html: runtimeBackendConfigScript }} />
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <TelegramProvider>
          <UIProvider>
            <ToastProvider>
              <Preloader />
              {children}
            </ToastProvider>
          </UIProvider>
        </TelegramProvider>
      </body>
    </html>
  );
}