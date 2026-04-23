import { Navbar } from "@/components/Navbar";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 pt-20 pb-24">
        {/* Hero */}
        <div className="text-center space-y-6 mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-arc-blue/30 bg-arc-blue/10 text-arc-blue text-xs font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-arc-blue animate-pulse" />
            Live on Arc Testnet
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold text-white tracking-tight leading-tight">
            Payroll that pays
            <br />
            <span className="text-arc-blue">every second.</span>
          </h1>

          <p className="text-lg text-gray-400 max-w-xl mx-auto">
            Cadence streams USDC directly to workers in real time. No waiting for payday.
            No wire delays. Powered by Arc's sub-second finality and stable gas fees.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link
              href="/employer"
              className="px-6 py-3 rounded-xl bg-arc-blue hover:bg-blue-600 text-white font-medium transition-colors"
            >
              Start Paying Employees
            </Link>
            <Link
              href="/employee"
              className="px-6 py-3 rounded-xl border border-arc-border hover:border-gray-500 text-gray-300 hover:text-white font-medium transition-colors"
            >
              View My Earnings
            </Link>
          </div>
        </div>

        {/* Feature grid */}
        <div className="grid sm:grid-cols-3 gap-4 mb-16">
          {[
            {
              icon: "⚡",
              title: "Sub-second settlement",
              desc: "Arc's Malachite BFT consensus gives 350ms deterministic finality — your money moves as fast as a message.",
            },
            {
              icon: "$",
              title: "Stable gas costs",
              desc: "Arc uses USDC as its native gas token. Employers always know exactly what payroll infrastructure costs.",
            },
            {
              icon: "🧾",
              title: "Invoice metadata",
              desc: "Every stream carries an on-chain invoice reference — making payroll audits and tax reporting trivial.",
            },
            {
              icon: "🔓",
              title: "Withdraw any time",
              desc: "Workers claim their accrued USDC whenever they want. No waiting for the 1st of the month.",
            },
            {
              icon: "📊",
              title: "Predictable runway",
              desc: "Employers see live runway in their dashboard. Stream pauses automatically when deposit is depleted.",
            },
            {
              icon: "🌐",
              title: "Non-custodial",
              desc: "Cadence is a pure smart contract. No intermediary holds funds — all logic is on-chain.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-arc-border bg-arc-card p-5 space-y-2">
              <div className="text-2xl">{f.icon}</div>
              <h3 className="font-semibold text-white">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="rounded-2xl border border-arc-border bg-arc-card p-8">
          <h2 className="text-xl font-semibold text-white mb-6">How it works</h2>
          <ol className="space-y-4">
            {[
              { n: "01", text: "Employer approves USDC spend and deposits a treasury into Cadence." },
              { n: "02", text: "A stream is created with the employee address, daily rate, and an optional invoice reference." },
              { n: "03", text: "USDC accrues per second, visible live in the employee dashboard." },
              { n: "04", text: "Employee clicks Withdraw at any time — funds arrive in ~350ms on Arc." },
              { n: "05", text: "Employer can top up, adjust, or cancel streams at any time." },
            ].map((step) => (
              <li key={step.n} className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-arc-blue/10 border border-arc-blue/30 text-arc-blue text-xs font-mono font-bold flex items-center justify-center">
                  {step.n}
                </span>
                <p className="text-gray-400 text-sm leading-relaxed pt-1">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </main>
    </div>
  );
}
