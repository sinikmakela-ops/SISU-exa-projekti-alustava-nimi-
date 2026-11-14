import type { Metadata } from "next";
import "./styles.css";
import "./mobile.css";

export const metadata: Metadata = {
  title: "APPLYOS — Your next opportunity starts here",
  description: "One profile. Every opportunity. Zero research.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
