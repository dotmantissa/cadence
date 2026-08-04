"use client";

import { Waves, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: "streams" | "requests";
  onChange: (v: "streams" | "requests") => void;
  streamCount: number;
  /** Number of *open* (actionable) requests — surfaced as a volt dot. */
  requestCount: number;
  className?: string;
}

/**
 * Page-level switch between the streams grid and the requests grid. The request
 * tab carries a small count of open items so a payer/payee notices something is
 * waiting on them without opening it.
 */
export function ViewTabs({ value, onChange, streamCount, requestCount, className }: Props) {
  const tabs = [
    { key: "streams" as const, label: "Streams", icon: Waves, badge: streamCount },
    { key: "requests" as const, label: "Requests", icon: Inbox, badge: requestCount },
  ];
  return (
    <div className={cn("inline-flex rounded-full border border-ink/10 bg-paper-warm p-0.5 text-sm font-medium", className)}>
      {tabs.map((t) => {
        const active = value === t.key;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              "relative inline-flex items-center gap-2 rounded-full px-4 py-2 transition-colors",
              active ? "bg-volt text-white" : "text-ink/55 hover:text-ink"
            )}
          >
            <Icon size={15} />
            {t.label}
            {t.badge > 0 && (
              <span
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[11px]",
                  active ? "bg-white/25 text-white" : "bg-volt text-white"
                )}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
