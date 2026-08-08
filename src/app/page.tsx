"use client";

import { motion } from "framer-motion";
import { ArrowRight, Radio } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/Button";
import { ValueFlow } from "@/components/landing/ValueFlow";
import { Reveal } from "@/components/motion/Reveal";
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
                Fund a stream once and your team earns by the second. They watch
                the balance climb and cash out whenever they want, no pay run and
                no one holding the money but the contract.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.24, duration: 0.7, ease }}
                className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
              >
                <Button href="/payer" variant="volt">
                  Start paying your team
                  <ArrowRight size={16} />
                </Button>
                <Button href="/payee" variant="ghost">
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

      {/* HOW IT FLOWS */}
      <section className="relative bg-paper-warm">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
          <HowItFlows />
        </div>
      </section>

      {/* AUDIENCE SPLIT */}
      <section className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
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

      <Footer />
    </main>
  );
}
