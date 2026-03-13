import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { ScanProvider } from "@/components/scan-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "StackWise",
  description: "Claude Stack Intelligence System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <ScanProvider>
            {children}
          </ScanProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
