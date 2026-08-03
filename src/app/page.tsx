"use client";

import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/Button";
import { LiquidBackground } from "@/components/motion/LiquidBackground";
import { Reveal } from "@/components/motion/Reveal";
import { LiveMoneyCard } from "@/components/landing/LiveMoneyCard";
import { Marquee } from "@/components/landing/Marquee";
import { FeatureCarousel } from "@/components/landing/FeatureCarousel";
import { HowItFlows } from "@/components/landing/HowItFlows";
import { AudienceSplit } from "@/components/landing/AudienceSplit";
import { Footer } from "@/components/landing/Footer";

export default function Home() {
  return (
    <main className="relative min-h-screen bg-paper">
      <Navbar />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <LiquidBackground pull={0.08} intensity={1} tone="light" />
        {/* soft paper wash so text stays crisp over the canvas */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-paper/40 via-paper/10 to-paper" />

        <div className="relative mx-auto max-w-7xl px-5 pb-24 pt-32 sm:px-8 sm:pt-40 lg:pb-32">
          <div className="grid items-center gap-16 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/60 px-3.5 py-1.5 text-xs font-medium text-ink/70 backdrop-blur"
              >
                <Sparkles size={13} className="text-volt" />
                live payroll on Arc Testnet
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="mt-6 text-5xl font-semibold leading-[0.98] tracking-tightest text-ink sm:text-6xl lg:text-7xl"
              >
                Your salary,
                <br />
                streaming{" "}
                <span className="volt-text font-display italic">
                  every second
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="mt-6 max-w-lg text-lg leading-relaxed text-ink/60"
              >
                Payday is a relic. Cadence pays your team by the second in USDC,
                settles in about 350ms, and lets everyone cash out whenever they
                feel like it. No batch jobs, no waiting, no custodian.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.24, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
              >
                <Button href="/employer" variant="volt">
                  Start streaming pay
                  <ArrowRight size={16} />
                </Button>
                <Button href="/employee" variant="ghost">
                  I&apos;m here to get paid
                </Button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.8 }}
                className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-ink/45"
              >
                <span className="font-mono">~350ms finality</span>
                <span className="font-mono">gas paid in USDC</span>
                <span className="font-mono">non custodial</span>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              className="flex justify-center lg:justify-end"
            >
              <LiveMoneyCard />
            </motion.div>
          </div>
        </div>
      </section>

      <Marquee />

      {/* FEATURES */}
      <section className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
        <FeatureCarousel />
      </section>

      {/* HOW IT FLOWS */}
      <section className="relative bg-paper-warm">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
          <HowItFlows />
        </div>
      </section>

      {/* NUMBERS */}
      <section className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-28">
        <div className="grid gap-8 rounded-5xl border border-black/10 bg-paper p-10 sm:grid-cols-3 sm:p-14">
          {[
            { k: "350ms", v: "average settlement on Arc, wallet to wallet" },
            { k: "1s", v: "how often a stream pushes fresh USDC to your team" },
            { k: "0", v: "payday tickets, batch runs, or awkward reminders" },
          ].map((s, i) => (
            <Reveal key={s.k} delay={i * 0.1} className="text-center sm:text-left">
              <p className="volt-text text-5xl font-semibold tracking-tightest sm:text-6xl">
                {s.k}
              </p>
              <p className="mx-auto mt-3 max-w-[16rem] text-sm leading-relaxed text-ink/55 sm:mx-0">
                {s.v}
              </p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* AUDIENCE SPLIT */}
      <section className="relative mx-auto max-w-7xl px-5 pb-24 sm:px-8 lg:pb-32">
        <Reveal className="mb-12 max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-widest text-volt">
            pick your side
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tightest text-ink sm:text-4xl">
            Two doors. Same stream.
          </h2>
        </Reveal>
        <AudienceSplit />
      </section>

      {/* CLOSING CTA */}
      <section className="relative overflow-hidden bg-ink">
        <LiquidBackground pull={0.1} intensity={1} tone="ink" />
        <div className="relative mx-auto max-w-4xl px-5 py-28 text-center sm:px-8 lg:py-36">
          <Reveal>
            <h2 className="text-4xl font-semibold tracking-tightest text-paper sm:text-6xl">
              Stop waiting on the 30th.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-paper/60">
              Spin up a stream in a couple of clicks and let the money move on
              its own. Your team will wonder how they ever did it the old way.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button href="/employer" variant="volt">
                Launch a stream
                <ArrowRight size={16} />
              </Button>
              <Button href="/employee" variant="paper">
                Check my earnings
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </main>
  );
}
