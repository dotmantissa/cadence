"use client";

import { motion } from "framer-motion";
import { ArrowRight, Radio } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/Button";
import { ValueFlow } from "@/components/landing/ValueFlow";
import { FlowField } from "@/components/motion/FlowField";
import { Reveal } from "@/components/motion/Reveal";
import { FeatureCarousel } from "@/components/landing/FeatureCarousel";
import { HowItFlows } from "@/components/landing/HowItFlows";
import { AudienceSplit } from "@/components/landing/AudienceSplit";
import { Footer } from "@/components/landing/Footer";

const ease = [0.22, 1, 0.36, 1] as const;

export default function Home() {
  return (
    <main className="relative min-h-screen bg-paper">
      <Navbar />

      {/* HERO */}
      <section className="relative overflow-hidden pt-28 sm:pt-32">
        <div className="mx-auto max-w-7xl px-5 pb-16 sm:px-8 lg:pb-24">
          <div className="grid items-center gap-12 lg:grid-cols-[0.92fr_1.08fr]">
            <div>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease }}
                className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-paper/60 px-3.5 py-1.5 text-xs font-medium text-ink/70 backdrop-blur"
              >
                <Radio size={13} className="text-volt" />
                live on Arc Testnet
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.7, ease }}
                className="mt-6 text-5xl font-semibold leading-[0.95] tracking-tightest text-ink sm:text-6xl lg:text-[4.5rem]"
              >
                Payroll that moves{" "}
                <span className="volt-text font-display italic">
                  while you read this
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16, duration: 0.7, ease }}
                className="mt-6 max-w-md text-lg leading-relaxed text-ink/60"
              >
                Fund a stream once and your team earns by the second, not by the
                month. They watch the balance climb and pull it whenever they
                want. No pay run, no waiting, nobody holding the funds but the
                contract.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.24, duration: 0.7, ease }}
                className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
              >
                <Button href="/employer" variant="volt">
                  Start paying your team
                  <ArrowRight size={16} />
                </Button>
                <Button href="/employee" variant="ghost">
                  Show me my money
                </Button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.8 }}
                className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-2 font-mono text-sm text-ink/40"
              >
                <span>gas paid in USDC</span>
                <span className="h-1 w-1 rounded-full bg-ink/20" />
                <span>withdraw anytime</span>
                <span className="h-1 w-1 rounded-full bg-ink/20" />
                <span>keys stay yours</span>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.9, ease }}
            >
              <ValueFlow />
            </motion.div>
          </div>
        </div>
      </section>

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
        <div className="grid gap-8 rounded-none border border-ink/10 bg-paper p-10 sm:grid-cols-3 sm:p-14">
          {[
            { k: "350ms", v: "from hitting withdraw to the money being in your wallet" },
            { k: "every 1s", v: "the contract pushes a fresh slice of pay to your team" },
            { k: "zero", v: "pay runs, batch jobs, or reminders in the group chat" },
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
            two sides of the same stream
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tightest text-ink sm:text-4xl">
            Sign the checks, or cash them.
          </h2>
        </Reveal>
        <AudienceSplit />
      </section>

      {/* CLOSING CTA */}
      <section className="relative overflow-hidden bg-panel">
        <FlowField tone="ink" density={1.1} />
        <div className="relative mx-auto max-w-4xl px-5 py-28 text-center sm:px-8 lg:py-36">
          <Reveal>
            <h2 className="text-4xl font-semibold tracking-tightest text-panel-foreground sm:text-6xl">
              Nobody misses the 30th.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-panel-foreground/60">
              Open a stream in about a minute and let the money handle itself.
              Once your team feels their balance move in real time, going back to
              a monthly batch is going to feel prehistoric.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button href="/employer" variant="volt">
                Open a stream
                <ArrowRight size={16} />
              </Button>
              <Button href="/employee" variant="paper">
                Check what you have earned
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </main>
  );
}
