import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geist = Geist({ subsets: ["latin", "vietnamese"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: {
    default: "NAAI ERP",
    template: "%s | NAAI ERP",
  },
  description: "Management accounting for NAAI Studio",
  applicationName: "NAAI ERP",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png", sizes: "256x256" }],
    apple: [{ url: "/naai-mark-gpt-256.png", type: "image/png", sizes: "256x256" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning className={geist.variable}>
      <body suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
