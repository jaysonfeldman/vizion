import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { TRPCProvider } from "@/lib/trpc";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Visibility",
  description:
    "See whether AI search mentions your brand on real buyer questions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://api.fontshare.com/v2/css?f[]=inter-display@500,600,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.variable} ${inter.className} antialiased`}>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
