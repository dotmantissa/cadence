import Link from "next/link";
import { FileText, Download, CheckCircle, XCircle } from "lucide-react";
import { Navbar } from "@/components/Navbar";

export default function BatchGuidePage() {
  return (
    <div className="min-h-screen bg-paper">
      <Navbar />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-28 sm:px-8">
        <div className="mb-8">
          <Link
            href="/payer"
            className="inline-flex items-center gap-1.5 text-sm text-volt transition-colors hover:text-volt-bright"
          >
            ← Back to payments
          </Link>
        </div>

        <div className="flex items-start gap-4">
          <FileText size={32} className="mt-1 shrink-0 text-volt" />
          <div>
            <h1 className="text-4xl font-semibold tracking-tightest text-ink">
              Batch import format guide
            </h1>
            <p className="mt-2 text-ink/60">
              How to structure a CSV, JSON, or Excel file so Cadence can read your recipient list.
            </p>
          </div>
        </div>

        <div className="mt-10 space-y-8">
          {/* Required format */}
          <section>
            <h2 className="text-xl font-semibold text-ink">What your file must have</h2>
            <div className="mt-4 space-y-3 rounded-2xl border border-volt/20 bg-volt/[0.06] p-5">
              <div className="flex items-start gap-3">
                <CheckCircle size={18} className="mt-0.5 shrink-0 text-volt" />
                <div>
                  <p className="font-medium text-ink">
                    A <code className="rounded bg-ink/10 px-1.5 py-0.5 font-mono text-sm">recipient</code> column
                  </p>
                  <p className="mt-1 text-sm text-ink/60">
                    Each row holds one wallet address (0x…) or one @handle. One recipient per row.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle size={18} className="mt-0.5 shrink-0 text-volt" />
                <div>
                  <p className="font-medium text-ink">
                    An optional <code className="rounded bg-ink/10 px-1.5 py-0.5 font-mono text-sm">amount</code> column
                  </p>
                  <p className="mt-1 text-sm text-ink/60">
                    USDC to stream to that recipient. If your file has no amounts, you can set them in the app after import.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
              <div className="flex items-start gap-3">
                <XCircle size={18} className="mt-0.5 shrink-0 text-red-500" />
                <div>
                  <p className="font-medium text-red-500">Files with no recipient column are rejected</p>
                  <p className="mt-1 text-sm text-red-500/80">
                    The column must be named <code className="rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-xs">recipient</code>, <code className="rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-xs">address</code>, or <code className="rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-xs">wallet</code>.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <XCircle size={18} className="mt-0.5 shrink-0 text-red-500" />
                <div>
                  <p className="font-medium text-red-500">Every recipient must be a valid address or @handle</p>
                  <p className="mt-1 text-sm text-red-500/80">
                    Random text, email addresses, and names are rejected. Each cell must hold a 0x wallet address or a Cadence @username.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* CSV example */}
          <section>
            <h2 className="text-xl font-semibold text-ink">CSV example (with amounts)</h2>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-ink/10 bg-panel p-4 font-mono text-sm text-panel-foreground">
{`recipient,amount
0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb,5000
@alice_dev,3000.50
0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199,2500
@bob_streams,4200`}
            </pre>
            <p className="mt-2 text-sm text-ink/55">
              Commas separate columns. First row is the header.
            </p>
          </section>

          {/* JSON example */}
          <section>
            <h2 className="text-xl font-semibold text-ink">JSON example (no amounts)</h2>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-ink/10 bg-panel p-4 font-mono text-sm text-panel-foreground">
{`[
  { "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb" },
  { "recipient": "@alice_dev" },
  { "recipient": "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199" }
]`}
            </pre>
            <p className="mt-2 text-sm text-ink/55">
              An array of objects. Each object must have a <code className="rounded bg-ink/10 px-1 py-0.5 font-mono text-xs">recipient</code> field.
            </p>
          </section>

          {/* Excel example */}
          <section>
            <h2 className="text-xl font-semibold text-ink">Excel example (.xlsx or .xls)</h2>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-ink/10 bg-paper-warm">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-volt/[0.06]">
                    <th className="px-4 py-2.5 text-left font-medium text-ink">recipient</th>
                    <th className="px-4 py-2.5 text-left font-medium text-ink">amount</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-ink/70">
                  <tr className="border-b border-ink/5">
                    <td className="px-4 py-2.5">0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb</td>
                    <td className="px-4 py-2.5">5000</td>
                  </tr>
                  <tr className="border-b border-ink/5">
                    <td className="px-4 py-2.5">@alice_dev</td>
                    <td className="px-4 py-2.5">3000.50</td>
                  </tr>
                  <tr className="border-b border-ink/5">
                    <td className="px-4 py-2.5">0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199</td>
                    <td className="px-4 py-2.5">2500</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5">@bob_streams</td>
                    <td className="px-4 py-2.5">4200</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-sm text-ink/55">
              The first row is the header. Only the first sheet is read; others are ignored.
            </p>
          </section>

          {/* Column name aliases */}
          <section>
            <h2 className="text-xl font-semibold text-ink">Column name flexibility</h2>
            <p className="mt-2 text-ink/60">
              Cadence recognizes these column names (case-insensitive, spaces and dashes ignored):
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-ink/10 bg-paper-warm p-4">
                <p className="text-sm font-medium uppercase tracking-wide text-ink/50">For recipients</p>
                <p className="mt-2 font-mono text-sm text-ink/70">
                  recipient, address, wallet, username, handle, to
                </p>
              </div>
              <div className="rounded-2xl border border-ink/10 bg-paper-warm p-4">
                <p className="text-sm font-medium uppercase tracking-wide text-ink/50">For amounts</p>
                <p className="mt-2 font-mono text-sm text-ink/70">
                  amount, usdc, value, total
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm text-ink/55">
              Examples: <code className="rounded bg-ink/10 px-1 py-0.5 font-mono text-xs">Wallet Address</code>, <code className="rounded bg-ink/10 px-1 py-0.5 font-mono text-xs">USDC</code>, and <code className="rounded bg-ink/10 px-1 py-0.5 font-mono text-xs">recipient</code> all work.
            </p>
          </section>

          {/* Tips */}
          <section>
            <h2 className="text-xl font-semibold text-ink">Tips</h2>
            <ul className="mt-3 space-y-2 text-ink/60">
              <li className="flex gap-2">
                <span className="text-volt">•</span>
                <span>
                  Every recipient must be registered on Cadence. Addresses with no account are rejected after import.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-volt">•</span>
                <span>
                  Amounts can have dollars signs and commas (<code className="rounded bg-ink/10 px-1 py-0.5 font-mono text-xs">$5,000</code>); they are stripped.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-volt">•</span>
                <span>
                  Blank rows (trailing newlines in CSV) are skipped.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-volt">•</span>
                <span>
                  The file size limit is 5 MB and the row limit is 200 recipients.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-volt">•</span>
                <span>
                  If the format is wrong, Cadence tells you exactly which row and why rather than guessing.
                </span>
              </li>
            </ul>
          </section>

          {/* Download templates */}
          <section>
            <h2 className="text-xl font-semibold text-ink">Download a blank template</h2>
            <div className="mt-3 flex flex-wrap gap-3">
              <a
                href="data:text/csv;charset=utf-8,recipient%2Camount%0A"
                download="cadence-batch-template.csv"
                className="inline-flex items-center gap-2 rounded-full border border-volt/30 bg-volt/[0.06] px-4 py-2.5 text-sm font-medium text-volt transition-colors hover:bg-volt/10"
              >
                <Download size={15} />
                CSV template
              </a>
              <a
                href='data:application/json;charset=utf-8,%5B%7B%22recipient%22%3A%22%22%2C%22amount%22%3A%22%22%7D%5D'
                download="cadence-batch-template.json"
                className="inline-flex items-center gap-2 rounded-full border border-volt/30 bg-volt/[0.06] px-4 py-2.5 text-sm font-medium text-volt transition-colors hover:bg-volt/10"
              >
                <Download size={15} />
                JSON template
              </a>
            </div>
          </section>

          {/* Back link */}
          <div className="pt-6">
            <Link
              href="/payer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-volt transition-colors hover:text-volt-bright"
            >
              ← Back to payments
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
