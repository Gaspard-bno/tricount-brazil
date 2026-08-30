import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://tricount-brazil.pages.dev"),
  title: "Marseille 2026 — 9 amis, 1 semaine en grand bleu",
  description: "Le plan de vacances du 9 au 16 août 2026 : Calanques, kayak, karting, plages et nuits marseillaises.",
  openGraph: {
    title: "Marseille 2026 — 9 amis, 1 semaine en grand bleu",
    description: "Le plan de vacances du 9 au 16 août 2026.",
    images: [{ url: "/og.png", width: 1680, height: 945, alt: "Marseille 2026 — 9 amis" }],
  },
  twitter: { card: "summary_large_image", title: "Marseille 2026", images: ["/og.png"] },
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
