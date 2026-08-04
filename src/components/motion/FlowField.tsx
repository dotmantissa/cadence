"use client";

import { useEffect, useRef } from "react";

interface Props {
  /** "ink" paints volt on dark. Only dark surfaces use this today. */
  tone?: "ink";
  /** scales particle count, 0..1+ */
  density?: number;
  className?: string;
}

interface P {
  x: number;
  y: number;
  lane: number;
  speed: number;
  r: number;
  a: number;
}

/**
 * Directional value field: USDC-colored motes drifting left to right along
 * gentle lanes. Not decoration for its own sake — it reads as money always
 * moving through the account. No pointer coupling (that cliche is retired).
 *
 * Guardrails: DPR capped at 1.5, count scales with area + density, pauses when
 * offscreen or tab-hidden, renders one static frame for prefers-reduced-motion.
 */
export function FlowField({ tone = "ink", density = 1, className = "" }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    void tone;

    let w = 0;
    let h = 0;
    let particles: P[] = [];

    // Pre-render a soft glow sprite once — cheaper than per-particle shadowBlur.
    const S = 28;
    const sprite = document.createElement("canvas");
    sprite.width = S;
    sprite.height = S;
    const sctx = sprite.getContext("2d")!;
    const grad = sctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, "rgba(120,140,255,0.9)");
    grad.addColorStop(0.4, "rgba(66,88,255,0.5)");
    grad.addColorStop(1, "rgba(43,68,231,0)");
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, S, S);

    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    function seed() {
      const area = w * h;
      const count = Math.max(10, Math.min(70, Math.floor((area / 22000) * density)));
      const lanes = Math.max(3, Math.round(h / 42));
      particles = Array.from({ length: count }, () => {
        const lane = Math.floor(rand(0, lanes));
        return {
          x: rand(0, w),
          y: ((lane + 0.5) / lanes) * h + rand(-6, 6),
          lane,
          speed: rand(14, 42), // px/sec
          r: rand(1.1, 2.6),
          a: rand(0.35, 0.9),
        };
      });
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function draw(dt: number) {
      ctx!.clearRect(0, 0, w, h);
      ctx!.globalCompositeOperation = "lighter";
      for (const p of particles) {
        p.x += p.speed * dt;
        if (p.x - p.r > w) {
          p.x = -p.r;
          p.a = rand(0.35, 0.9);
        }
        const size = p.r * 6;
        ctx!.globalAlpha = p.a;
        ctx!.drawImage(sprite, p.x - size / 2, p.y - size / 2, size, size);
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
      draw(dt);
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
    draw(0); // static frame regardless

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

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stop();
      io.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [tone, density]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
