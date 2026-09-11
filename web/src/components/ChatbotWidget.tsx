"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { TouristGuideChat } from "@/components/TouristGuideChat";
import { ChatIcon, CloseIcon, SparkleIcon } from "@/components/icons";

/**
 * Site-wide floating chat entry point — reuses the exact same real
 * question-answering logic as the full `/ai/guide` page (`TouristGuideChat`),
 * just in a compact popover so a traveler can ask a real, grounded
 * question from anywhere without navigating away from what they're doing.
 */
export function ChatbotWidget() {
  const { token, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Redundant on the full chat page itself, and pointless on auth screens
  // where there's nothing to be a "tourist" about yet.
  if (loading || pathname?.startsWith("/ai/guide") || pathname === "/login" || pathname === "/register") {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close AI Tourist Guide chat" : "Open AI Tourist Guide chat"}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:opacity-90"
      >
        {open ? <CloseIcon width={22} height={22} /> : <ChatIcon width={22} height={22} />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-50 flex h-[30rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border bg-surface-muted px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <SparkleIcon width={14} height={14} className="text-accent" />
              AI Tourist Guide
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-foreground/50 hover:text-foreground"
            >
              <CloseIcon width={16} height={16} />
            </button>
          </div>
          <div className="flex-1 overflow-hidden p-3">
            {token ? (
              <TouristGuideChat compact />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-foreground/60">Log in to ask the AI Tourist Guide a real question.</p>
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  Log in
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
