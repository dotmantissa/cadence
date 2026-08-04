"use client";

import { motion } from "framer-motion";
import { ArrowRight, Building2, User } from "lucide-react";
import Link from "next/link";

const sides = [
  {
    href: "/employer",
    tag: "for the ones paying",
    icon: Building2,
    title: "Run payroll that never clocks out",
    body: "Fund a stream, set the rate, watch your runway. Top up when you are flush, cancel when you are not. Your treasury, your rules.",
    cta: "Start paying",
    tone: "ink" as const,
  },
  {
    href: "/employee",
    tag: "for the ones earning",
    icon: User,
    title: "Watch your bag grow in real time",
    body: "Your salary shows up by the second, not by the month. Withdraw whenever the mood strikes and skip the wait entirely.",
    cta: "See my earnings",
    tone: "volt" as const,
  },
];

export function AudienceSplit() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {sides.map((s, i) => {
        const Icon = s.icon;
        const dark = s.tone === "ink";
        return (
          <motion.div
            key={s.href}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: i * 0.12, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <Link href={s.href} className="group block h-full">
              <div
                className={`relative flex h-full flex-col overflow-hidden rounded-none p-9 transition-all duration-500 ease-liquid sm:p-11 ${
                  dark
                    ? "bg-panel text-panel-foreground"
                    : "bg-volt text-panel-foreground"
                }`}
              >
                {/* moving glow */}
                <div
                  className={`pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full blur-3xl transition-transform duration-700 ease-liquid group-hover:scale-125 ${
                    dark ? "bg-volt/30" : "bg-white/20"
                  }`}
                />
                <div className="relative flex items-center gap-3">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                      dark ? "bg-white/10 text-volt-bright" : "bg-white/15 text-white"
                    }`}
                  >
                    <Icon size={20} />
                  </div>
                  <span className="font-mono text-xs uppercase tracking-widest opacity-70">
                    {s.tag}
                  </span>
                </div>

                <h3 className="relative mt-8 max-w-sm text-3xl font-semibold tracking-tightest sm:text-4xl">
                  {s.title}
                </h3>
                <p className="relative mt-4 max-w-md text-sm leading-relaxed opacity-70">
                  {s.body}
                </p>

                <div className="relative mt-auto pt-10">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    {s.cta}
                    <ArrowRight
                      size={17}
                      className="transition-transform duration-300 ease-springy group-hover:translate-x-1.5"
                    />
                  </span>
                </div>
              </div>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
