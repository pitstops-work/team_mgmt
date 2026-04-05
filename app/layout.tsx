import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pitstop",
  description: "Async threaded team workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-stone-50 text-stone-900 antialiased">
        {children}
      </body>
    </html>
  );
}
