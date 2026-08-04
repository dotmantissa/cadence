"use client";

import { motion } from "framer-motion";
import { Wallet, Waves, ArrowUpRight, RefreshCw } from "lucide-react";
import { Reveal } from "../motion/Reveal";

const steps = [
  {
    n: "01",
    icon: Wallet,
    title: "Fund it once",
    body: "Approve USDC, drop in a lump sum, and set a rate for each person. That is the entire setup. No spreadsheets harmed.",
  },
  {
    n: "02",
    icon: Waves,
    title: "Let it stream",
    body: "The contract pays out every second, live. Your team watches their balance tick up in real time instead of refreshing a bank app.",
  },
  {
    n: "03",
    icon: ArrowUpRight,
    title: "Withdraw whenever",
    body: "Earned it, want it, take it. Rent is due on the 3rd but payday is the 30th? Not your problem anymore.",
  },
  {
    n: "04",
    icon: RefreshCw,
    title: "Top up or pull the plug",
    body: "Add more runway anytime, or cancel and claw back everything that has not streamed yet. You are always in the driver seat.",
  },
];

export function HowItFlows() {
  return (
    <div>
      <Reveal className="mb-14 max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-widest text-volt">
          the whole flow
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tightest text-ink sm:text-4xl">
          Four steps. Zero of them involve a bank.
        </h2>
      </Reveal>

      <div className="relative grid gap-5 md:grid-cols-2">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="group relative overflow-hidden rounded-4xl border border-ink/10 bg-paper p-8 transition-colors hover:border-ink/20"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-volt-wash text-volt transition-transform duration-500 ease-springy group-hover:scale-110">
                  <Icon size={24} />
                </div>
                <span className="font-mono text-5xl font-bold text-black/[0.06] transition-colors group-hover:text-volt/10">
                  {s.n}
                </span>
              </div>
              <h3 className="mt-6 text-2xl font-semibold tracking-tight text-ink">
                {s.title}
              </h3>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-ink/55">
                {s.body}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
