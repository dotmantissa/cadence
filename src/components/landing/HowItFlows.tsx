"use client";

import { motion } from "framer-motion";
import { Wallet, Waves, ArrowUpRight, RefreshCw } from "lucide-react";
import { Reveal } from "../motion/Reveal";

const steps = [
  {
    n: "01",
    icon: Wallet,
    title: "Fund it once",
    body: "Approve USDC, drop in a lump sum, and set a rate for each person. Done. The stream takes it from there.",
  },
  {
    n: "02",
    icon: Waves,
    title: "Let it stream",
    body: "The contract pays out every second, live. Whoever you pay watches their balance tick up in real time instead of refreshing a bank app.",
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
          // In the 2x2 grid, round only the corner that faces the center where
          // the four cards meet: 0=top-left→br, 1=top-right→bl, 2=bottom-left→tr,
          // 3=bottom-right→tl. Square everywhere else, and fully square below md
          // where the grid collapses to one column.
          const meetingCorner = [
            "md:rounded-br-4xl",
            "md:rounded-bl-4xl",
            "md:rounded-tr-4xl",
            "md:rounded-tl-4xl",
          ][i];
          return (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ delay: i * 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -8, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }}
              className={`group relative overflow-hidden rounded-none border border-ink/10 bg-paper p-8 transition-[border-color,box-shadow] duration-500 hover:border-volt/30 hover:shadow-[0_30px_80px_-40px_rgba(43,68,231,0.5)] ${meetingCorner}`}
            >
              {/* glow that blooms from the corner on hover */}
              <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-volt/10 opacity-0 blur-3xl transition-all duration-700 ease-liquid group-hover:scale-125 group-hover:opacity-100" />
              {/* diagonal sheen that sweeps across on hover */}
              <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-volt/[0.07] to-transparent transition-transform duration-1000 ease-liquid group-hover:translate-x-full" />

              <div className="relative flex items-start justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-volt-wash text-volt transition-transform duration-500 ease-springy group-hover:-rotate-6 group-hover:scale-110">
                  <Icon size={24} />
                </div>
                <span className="font-mono text-5xl font-bold text-black/[0.06] transition-all duration-500 ease-springy group-hover:scale-110 group-hover:text-volt/15">
                  {s.n}
                </span>
              </div>
              <h3 className="relative mt-6 text-2xl font-semibold tracking-tight text-ink">
                {s.title}
              </h3>
              <p className="relative mt-3 max-w-md text-sm leading-relaxed text-ink/55">
                {s.body}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
