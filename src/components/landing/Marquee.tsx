"use client";

/** Infinite marquee strip. Pure CSS transform, GPU-friendly, pauses on hover. */
const words = [
  "stream salaries",
  "settle in ~350ms",
  "gas in USDC",
  "non custodial",
  "withdraw anytime",
  "live runway",
  "no payday",
  "on Arc",
];

export function Marquee() {
  const row = [...words, ...words];
  return (
    <div className="group relative flex overflow-hidden border-y border-black/10 bg-ink py-5">
      <div className="flex animate-marquee whitespace-nowrap [animation-play-state:running] group-hover:[animation-play-state:paused]">
        {row.map((w, i) => (
          <span key={i} className="mx-8 inline-flex items-center gap-8">
            <span className="text-lg font-medium tracking-tight text-paper/80">
              {w}
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-volt" />
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-ink to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-ink to-transparent" />
    </div>
  );
}
