import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import Navbar from "@/components/Navbar";
import { AuthProvider } from "@/lib/AuthContext";
import { Analytics } from "@vercel/analytics/react";
import VisitLogger from "@/components/VisitLogger";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { notFound } from "next/navigation";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const baseUrl = "https://rsl-tools.xyz";
  return {
    title: t("title"),
    description: t("description"),
    metadataBase: new URL(baseUrl),
    alternates: {
      canonical: `/${locale}`,
      languages: {
        ko: "/ko",
        en: "/en",
      },
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      url: `${baseUrl}/${locale}`,
      siteName: "RSL Tools",
      type: "website",
      locale: locale === "ko" ? "ko_KR" : "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
    },
    robots: {
      index: true,
      follow: true,
    },
    icons: {
      icon: [
        { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/favicon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [
        { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      ],
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as "ko" | "en")) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="referrer" content="no-referrer" />
        <meta name="naver-site-verification" content="df764b16751ea8d1ae2dac077d5db25d31050224" />
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7065412448100399"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <Navbar />
            <VisitLogger />
            <main className="flex-1">{children}</main>
          </AuthProvider>
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
