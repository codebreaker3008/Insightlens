import React from "react";
import { useLocation } from "wouter";

export function Layout({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-14 flex items-center">
          <div 
            className="flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-80"
            onClick={() => setLocation("/")}
          >
            <div className="size-6 bg-primary rounded-sm flex items-center justify-center">
              <div className="size-2 bg-background rounded-full" />
            </div>
            <span className="font-bold tracking-tight text-lg">SignalOS</span>
          </div>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
