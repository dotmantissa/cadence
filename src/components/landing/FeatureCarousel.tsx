"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { motion } from "framer-motion";
import {
  Zap,
  CircleDollarSign,
  Receipt,
  Lock,
  Gauge,
  Waves,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { TiltCard } from "../motion/primitives";
import { cn } from "@/lib/utils";

const items = [
  {
    icon: Waves,
    title: "Money that never sits still",
    body: "The second a stream starts, USDC moves. No pay periods, no cutoff times, no waiting for some batch job to run on Friday.",
  },
  {
    icon: Zap,
    title: "Settles before you blink",
    body: "Arc finalizes in roughly 350ms. You hit withdraw, the funds are already in your wallet. Faster than the confirmation text.",
  },
  {
    icon: CircleDollarSign,
    title: "Gas paid in USDC",
    body: "No separate gas token to babysit, no chart to refresh. You spend dollars, you know the cost, you move on with your life.",
  },
  {
    icon: Lock,
    title: "Nobody holds the bag but you",
    body: "It is a contract, not a company. No custodian, no honor system, no praying the balance is really there. Just code and your keys.",
  },
  {
    icon: Gauge,
    title: "Runway you can actually see",
    body: "Every stream shows exactly how long it survives at the current rate. When the tank hits empty it stops itself. No overdraft, no drama.",
  },
  {
    icon: Receipt,
    title: "Receipts for the taxman",
    body: "Tag any stream with an invoice or reference. When accounting season rolls around you have a clean on-chain trail instead of a shoebox.",
  },
];

export function FeatureCarousel() {
  const [emblaRef, embla] = useEmblaCarousel({
    align: "start",
    loop: false,
    dragFree: true,
    containScroll: "trimSnaps",
  });
  const [prev, setPrev] = useState(false);
  const [next, setNext] = useState(true);

  const update = useCallback(() => {
    if (!embla) return;
    setPrev(embla.canScrollPrev());
    setNext(embla.canScrollNext());
  }, [embla]);

  useEffect(() => {
    if (!embla) return;
    update();
    embla.on("select", update);
    embla.on("reInit", update);
  }, [embla, update]);

  return (
    <div className="relative">
      <div className="mb-8 flex items-end justify-between gap-4 px-1">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-volt">
            why bother
          </p>
          <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tightest text-ink sm:text-4xl">
            Payroll grew up. This is what it looks like now.
          </h2>
        </div>
        <div className="hidden gap-2 sm:flex">
          <button
            onClick={() => embla?.scrollPrev()}
            disabled={!prev}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full border border-black/10 transition-all",
              prev ? "text-ink hover:bg-black/5" : "text-ink/25"
            )}
            aria-label="Previous"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => embla?.scrollNext()}
            disabled={!next}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full border border-black/10 transition-all",
              next ? "text-ink hover:bg-black/5" : "text-ink/25"
            )}
            aria-label="Next"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-5 pl-1">
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="min-w-0 shrink-0 basis-[85%] sm:basis-[46%] lg:basis-[31%]"
              >
                <TiltCard max={6} className="h-full">
                  <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ delay: (i % 3) * 0.08, duration: 0.5 }}
                    className="group h-full rounded-4xl border border-black/10 bg-paper-warm p-7 transition-colors hover:border-volt/30"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink text-volt-bright transition-transform duration-500 ease-springy group-hover:-rotate-6 group-hover:scale-110">
                      <Icon size={22} />
                    </div>
                    <h3 className="mt-6 text-xl font-semibold tracking-tight text-ink">
                      {item.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-ink/55">
                      {item.body}
                    </p>
                  </motion.div>
                </TiltCard>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
