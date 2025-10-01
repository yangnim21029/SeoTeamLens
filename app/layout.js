import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "./components/AppShell";
import { RankDataProvider } from "./context/rank-data";
import { AuthProvider } from "./context/auth-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "RankLens – Keyword Ranking Tracker",
  description:
    "30-day keyword and URL ranking trends with filters and CSV export.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <RankDataProvider>
            <AppShell>{children}</AppShell>
          </RankDataProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
