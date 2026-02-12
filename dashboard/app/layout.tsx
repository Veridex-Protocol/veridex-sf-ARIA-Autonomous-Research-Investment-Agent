import type { Metadata } from 'next';
import { Activity, Wallet, BarChart3 } from 'lucide-react';
import './globals.css';

export const metadata: Metadata = {
  title: 'ARIA — Autonomous Research & Investment Agent',
  description: 'Real-time monitoring dashboard for the ARIA autonomous AI agent powered by Veridex Protocol',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-6">
              <a href="/" className="flex items-center gap-2 text-foreground no-underline">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                  <BarChart3 className="h-4 w-4 text-primary" />
                </div>
                <span className="text-base font-bold tracking-tight">ARIA</span>
              </a>
              <div className="hidden sm:flex items-center gap-1">
                <a href="/" className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground no-underline">
                  <Activity className="h-3.5 w-3.5" />
                  Monitor
                </a>
                <a href="/setup" className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground no-underline">
                  <Wallet className="h-3.5 w-3.5" />
                  Wallet
                </a>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                Powered by Veridex
              </span>
            </div>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
