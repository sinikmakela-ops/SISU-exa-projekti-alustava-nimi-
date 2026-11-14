import type { Metadata } from "next";
import "./styles.css";
import "./mobile.css";
import "./opportunity-details.css";

export const metadata: Metadata = {
  title: "Pave.OS — Your next opportunity starts here",
  description: "Pave.OS helps students discover and prepare for real opportunities.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
