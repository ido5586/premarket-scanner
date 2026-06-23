import "./globals.css";

export const metadata = {
  title: "Pre-Market Momentum Scanner",
  description: "Scan and alert for US pre-market gainers above 90 percent",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
