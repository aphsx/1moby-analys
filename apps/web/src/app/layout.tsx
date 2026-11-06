import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";
import Shell from "@/components/shell";

// next/font downloads the font at build time and self-hosts it; users never call Google.
const plex = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-plex",
});

export const metadata: Metadata = {
  title: "1Moby Intelligence",
  description: "Customer Predictive Intelligence Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={plex.variable}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
