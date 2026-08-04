"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Landmark } from "lucide-react";
import { useLiveCounter } from "@/hooks/useLiveCounter";

/**
 * The signature. Money doesn't sit in a card here — it physically travels.
 * USDC motes stream along curved rails from the company treasury out to each
 * worker wallet, in real time, while every balance ticks. The treasury drains
 * at exactly the rate the workers fill. This is the product, drawn.
 *
 * Canvas handles the flowing value (one layer, pre-rendered glow sprite, DPR
 * capped, pauses offscreen/hidden, static frame under reduced-motion). The
 * nodes are crisp DOM so labels stay sharp; both read positions from the same
 * fractional layout so the rails always meet the wallets.
 */

const WORKERS = [
  { handle: "kaito.eth", role: "contracts", start: 3421.18, rate: 0.013889 }, // ~$1,200/day
  { handle: "mara.lens", role: "design", start: 2108.55, rate: 0.010417 }, //   ~$900/day
  { handle: "0xjune", role: "growth", start: 1289.04, rate: 0.006944 }, //      ~$600/day
];
const TREASURY_START = 148204.77;
const TREASURY_RATE = WORKERS.reduce((s, w) => s + w.rate, 0);
const MAX_RATE = Math.max(...WORKERS.map((w) => w.rate));

type Pt = { x: number; y: number };

function layout(horizontal: boolean) {
  if (horizontal) {
    return {
      treasury: { x: 0.22, y: 0.5 },
      workers: WORKERS.map((_, i) => ({ x: 0.82, y: [0.21, 0.5, 0.79][i] })),
    };
  }
  return {
    treasury: { x: 0.5, y: 0.13 },
    workers: WORKERS.map((_, i) => ({ x: [0.2, 0.5, 0.8][i], y: 0.85 })),
  };
}

function controls(a: Pt, b: Pt, horizontal: boolean): [Pt, Pt, Pt, Pt] {
  if (horizontal) {
    const cx = (a.x + b.x) / 2;
    return [a, { x: cx, y: a.y }, { x: cx, y: b.y }, b];
  }
  const cy = (a.y + b.y) / 2;
  return [a, { x: a.x, y: cy }, { x: b.x, y: cy }, b];
}

function cubic(p: [Pt, Pt, Pt, Pt], t: number): Pt {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p[0].x + b * p[1].x + c * p[2].x + d * p[3].x,
    y: a * p[0].y + b * p[1].y + c * p[2].y + d * p[3].y,
  };
}

interface Mote {
  path: number;
  t: number;
  speed: number;
  size: number;
}

export function ValueFlow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [horizontal, setHorizontal] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setHorizontal(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const L = layout(horizontal);

    let w = 0;
    let h = 0;

    // glow sprite
    const S = 26;
    const sprite = document.createElement("canvas");
    sprite.width = S;
    sprite.height = S;
    const sctx = sprite.getContext("2d")!;
    const g = sctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, "rgba(200,210,255,1)");
    g.addColorStop(0.35, "rgba(66,88,255,0.75)");
    g.addColorStop(1, "rgba(43,68,231,0)");
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, S, S);

    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    // more motes on the higher-paid rails; value density = pay rate
    const motes: Mote[] = [];
    WORKERS.forEach((wk, i) => {
      const n = 3 + Math.round(7 * (wk.rate / MAX_RATE));
      for (let k = 0; k < n; k++) {
        motes.push({
          path: i,
          t: (k / n) % 1,
          speed: rand(0.1, 0.16),
          size: rand(4.5, 8),
        });
      }
    });

    function nodesPx(): { treasury: Pt; workers: Pt[] } {
      return {
        treasury: { x: L.treasury.x * w, y: L.treasury.y * h },
        workers: L.workers.map((p) => ({ x: p.x * w, y: p.y * h })),
      };
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function paths(): [Pt, Pt, Pt, Pt][] {
      const n = nodesPx();
      return n.workers.map((wp) => controls(n.treasury, wp, horizontal));
    }

    function drawRails(ps: [Pt, Pt, Pt, Pt][]) {
      for (const p of ps) {
        ctx!.beginPath();
        ctx!.moveTo(p[0].x, p[0].y);
        ctx!.bezierCurveTo(p[1].x, p[1].y, p[2].x, p[2].y, p[3].x, p[3].y);
        ctx!.strokeStyle = "rgba(66,88,255,0.16)";
        ctx!.lineWidth = 1.5;
        ctx!.stroke();
      }
    }

    function drawMote(pt: Pt, size: number, alpha: number) {
      ctx!.globalAlpha = alpha;
      ctx!.drawImage(sprite, pt.x - size / 2, pt.y - size / 2, size, size);
    }

    function frame(dt: number) {
      ctx!.clearRect(0, 0, w, h);
      const ps = paths();
      drawRails(ps);
      ctx!.globalCompositeOperation = "lighter";
      for (const m of motes) {
        m.t += m.speed * dt;
        if (m.t > 1) m.t -= 1;
        const pt = cubic(ps[m.path], m.t);
        // fade in at the treasury, fade out as it lands
        const edge = Math.min(m.t, 1 - m.t) * 6;
        const alpha = Math.max(0.15, Math.min(1, edge));
        drawMote(pt, m.size, alpha);
      }
      ctx!.globalAlpha = 1;
      ctx!.globalCompositeOperation = "source-over";
    }

    function staticFrame() {
      ctx!.clearRect(0, 0, w, h);
      const ps = paths();
      drawRails(ps);
      ctx!.globalCompositeOperation = "lighter";
      for (const m of motes) {
        drawMote(cubic(ps[m.path], m.t), m.size, 0.7);
      }
      ctx!.globalAlpha = 1;
      ctx!.globalCompositeOperation = "source-over";
    }

    let raf = 0;
    let last = 0;
    let running = false;

    function loop(now: number) {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      frame(dt);
      raf = requestAnimationFrame(loop);
    }
    function start() {
      if (running || reduce) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    resize();
    if (reduce) staticFrame();
    else staticFrame();

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) start();
          else stop();
        }
      },
      { threshold: 0.01 }
    );
    io.observe(canvas);

    function onVis() {
      if (document.hidden) stop();
      else if (!reduce) start();
    }
    function onResize() {
      resize();
      if (!running) staticFrame();
    }

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stop();
      io.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [horizontal]);

  const L = layout(horizontal);

  return (
    <div className="relative h-[460px] w-full overflow-hidden rounded-4xl border border-white/10 bg-panel sm:h-[520px] lg:h-[560px]">
      {/* depth glows (CSS, not canvas) */}
      <div className="pointer-events-none absolute -left-10 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-volt/25 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-56 w-56 rounded-full bg-volt-bright/10 blur-3xl" />

      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />

      {/* Treasury node */}
      <NodeWrapper x={L.treasury.x} y={L.treasury.y}>
        <TreasuryNode />
      </NodeWrapper>

      {/* Worker nodes */}
      {WORKERS.map((wk, i) => (
        <NodeWrapper key={wk.handle} x={L.workers[i].x} y={L.workers[i].y}>
          <WorkerNode worker={wk} delay={0.15 + i * 0.1} />
        </NodeWrapper>
      ))}
    </div>
  );
}

function NodeWrapper({
  x,
  y,
  children,
}: {
  x: number;
  y: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    >
      {children}
    </div>
  );
}

function TreasuryNode() {
  const value = useLiveCounter(TREASURY_START, -TREASURY_RATE);
  const whole = Math.floor(value).toLocaleString();
  const frac = String(Math.floor((value % 1) * 100)).padStart(2, "0");

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="w-[172px] rounded-3xl border border-white/15 bg-white/[0.06] p-4 backdrop-blur-md sm:w-[200px]"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-volt text-white">
          <Landmark size={15} />
        </span>
        <div className="leading-tight">
          <p className="text-xs font-semibold text-panel-foreground">Treasury</p>
          <p className="text-[10px] text-panel-foreground/45">paying 3 wallets</p>
        </div>
      </div>
      <div className="mt-3 font-mono tabular-nums">
        <span className="text-lg font-semibold text-panel-foreground sm:text-xl">
          ${whole}
        </span>
        <span className="text-sm text-panel-foreground/40">.{frac}</span>
      </div>
    </motion.div>
  );
}

function WorkerNode({
  worker,
  delay,
}: {
  worker: (typeof WORKERS)[number];
  delay: number;
}) {
  const value = useLiveCounter(worker.start, worker.rate);
  const whole = Math.floor(value).toLocaleString();
  const frac = String(Math.floor((value % 1) * 100)).padStart(2, "0");

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="w-[128px] rounded-2xl border border-white/12 bg-panel/70 p-3 backdrop-blur-md sm:w-[148px]"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-medium text-panel-foreground sm:text-xs">
          {worker.handle}
        </span>
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-volt/60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-volt-bright" />
        </span>
      </div>
      <p className="mt-0.5 text-[9px] uppercase tracking-wider text-panel-foreground/35">
        {worker.role}
      </p>
      <div className="mt-2 font-mono tabular-nums leading-none">
        <span className="text-sm font-semibold text-volt-bright sm:text-base">
          ${whole}
        </span>
        <span className="text-[10px] text-panel-foreground/40">.{frac}</span>
      </div>
    </motion.div>
  );
}
