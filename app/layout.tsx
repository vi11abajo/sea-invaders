import type { Metadata, Viewport } from "next";
import { Inter, Source_Code_Pro } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const ROOT_URL = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";

const site = {
  name: "sea invaders",
  description: "Defend the reef: destroy crab waves, defeat bosses, and climb the leaderboard.",
  ogTitle: "Sea Invaders — arcade shooter",
  ogDescription: "Destroy crab waves, defeat bosses, and compete on the leaderboard!",
  tagline: "Play classic arcade action",
  iconUrl: `${ROOT_URL}/metadata/icon.png`,
  ogImageUrl: `${ROOT_URL}/metadata/cover.png`,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f0f4f8' },
    { media: '(prefers-color-scheme: dark)', color: '#001122' }
  ],
};

export const metadata: Metadata = {
  title: site.name,
  description: site.description,
  applicationName: site.name,
  manifest: '/manifest.json',

  openGraph: {
    type: 'website',
    url: ROOT_URL,
    title: site.ogTitle,
    description: site.ogDescription,
    siteName: site.name,
    images: [
      {
        url: site.ogImageUrl,
        width: 1200,
        height: 630,
        alt: `${site.name} - ${site.tagline}`,
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: site.ogTitle,
    description: site.ogDescription,
    images: [site.ogImageUrl],
  },

  icons: {
    icon: site.iconUrl,
    apple: site.iconUrl,
  },
};

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sourceCodePro = Source_Code_Pro({
  variable: "--font-source-code-pro",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${sourceCodePro.variable}`}>
        {/* Load game dependencies sequentially to avoid dependency errors */}
        <Script src="/game-loader.js" strategy="beforeInteractive" />

        {children}
      </body>
    </html>
  );
}
