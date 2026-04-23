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
            Cadence streams USDC straight to your workers as they earn it. No waiting until payday.
            No bank delays. Runs on Arc's fast, low-cost network.
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
              title: "Settles in milliseconds",
              desc: "Arc settles in 350ms. Your money arrives before the message telling them about it.",
            },
            {
              icon: "$",
              title: "No fee surprises",
              desc: "Arc uses USDC for gas too, so you always know what you're spending. No ETH price swings.",
            },
            {
              icon: "🧾",
              title: "Built-in record keeping",
              desc: "Attach an invoice number or reference to every stream. Makes tax time a lot easier.",
            },
            {
              icon: "🔓",
              title: "Get paid whenever you want",
              desc: "Employees withdraw what they've earned at any point. No more waiting until the end of the month.",
            },
            {
              icon: "📊",
              title: "Know your runway",
              desc: "Your dashboard shows exactly how long each stream can run. When funds run out it stops automatically.",
            },
            {
              icon: "🌐",
              title: "Your money, your keys",
              desc: "Cadence is a smart contract. No company or middleman holds your funds. It's all on-chain.",
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
              { n: "01", text: "The employer approves Cadence to spend their USDC and makes an initial deposit." },
              { n: "02", text: "Set up a stream with the employee's wallet address, the total amount, how long it runs, and an optional invoice reference." },
              { n: "03", text: "USDC starts flowing to the employee in real time, visible live on their dashboard." },
              { n: "04", text: "The employee clicks Withdraw whenever they want. Funds land in about 350ms." },
              { n: "05", text: "Employers can add more funds, or cancel a stream at any time." },
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
