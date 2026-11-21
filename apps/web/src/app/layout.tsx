import type { Metadata } from "next";
import { Geist_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CarePurse",
  description: "Keep Mama's utilities on. Fund a purse for your parent in Nigeria; Mhasibu AI buys electricity, airtime and data within the limits you set.",
  openGraph: {
    title: "CarePurse",
    description: "Keep Mama's utilities on. Electricity, airtime and data for family in Nigeria, within limits you set.",
    type: "website",
  },
};

const RELOAD_TO_TOP = `try{var n=performance.getEntriesByType("navigation")[0];if(n&&n.type==="reload"&&!location.hash){history.scrollRestoration="manual";scrollTo(0,0);addEventListener("load",function(){scrollTo(0,0)})}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* A refresh starts at the top, not where she was (browsers restore the old position by
            default). Only on a real reload, and not for a #section link; back and forward still
            return to where she was. Runs before the page paints. */}
        <script dangerouslySetInnerHTML={{ __html: RELOAD_TO_TOP }} />
        {children}
      </body>
    </html>
  );
}
