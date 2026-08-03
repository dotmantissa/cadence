"use client";

import { useEffect, useRef } from "react";

interface Props {
  /** how strongly blobs chase the pointer, 0..1 */
  pull?: number;
  /** base opacity of the field */
  intensity?: number;
  /** "light" paints volt on paper, "ink" paints volt glow on near-black */
  tone?: "light" | "ink";
  className?: string;
}

interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hueShift: number;
}

/**
 * Cursor-reactive liquid field on a single canvas.
 * Performance guardrails:
 *  - device pixel ratio capped at 1.5
 *  - blob count scales down on small / touch screens
 *  - pauses entirely when tab hidden or element scrolled out of view
 *  - respects prefers-reduced-motion (renders one static frame)
 *  - pure GPU-friendly radial fills, no per-pixel work
 */
export function LiquidBackground({
  pull = 0.06,
  intensity = 1,
  tone = "light",
  className = "",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const small = window.innerWidth < 768;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    let w = 0;
    let h = 0;
    const count = small ? 4 : 6;

    const volt = { r: 43, g: 68, b: 231 };
    const bright = { r: 66, g: 88, b: 255 };

    const blobs: Blob[] = [];
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    function seed() {
      blobs.length = 0;
      for (let i = 0; i < count; i++) {
        blobs.push({
          x: rand(0, w),
          y: rand(0, h),
          vx: rand(-0.15, 0.15),
          vy: rand(-0.15, 0.15),
          r: rand(w * 0.16, w * 0.34),
          hueShift: Math.random(),
        });
      }
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (blobs.length === 0) seed();
    }

    const pointer = { x: 0, y: 0, active: false };
    const target = { x: 0, y: 0 };

    function onMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      target.x = e.clientX - rect.left;
      target.y = e.clientY - rect.top;
      pointer.active = true;
    }
    function onLeave() {
      pointer.active = false;
    }

    function paint() {
      ctx!.clearRect(0, 0, w, h);
      ctx!.globalCompositeOperation = "lighter";

      pointer.x += (target.x - pointer.x) * 0.08;
      pointer.y += (target.y - pointer.y) * 0.08;

      for (const b of blobs) {
        // drift
        b.x += b.vx;
        b.y += b.vy;

        // gentle pull toward pointer
        if (pointer.active) {
          b.x += (pointer.x - b.x) * pull * 0.12;
          b.y += (pointer.y - b.y) * pull * 0.12;
        }

        // wrap softly
        if (b.x < -b.r) b.x = w + b.r;
        if (b.x > w + b.r) b.x = -b.r;
        if (b.y < -b.r) b.y = h + b.r;
        if (b.y > h + b.r) b.y = -b.r;

        const c = b.hueShift > 0.5 ? bright : volt;
        const g = ctx!.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        const a = (tone === "ink" ? 0.5 : 0.32) * intensity;
        g.addColorStop(0, `rgba(${c.r},${c.g},${c.b},${a})`);
        g.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
        ctx!.fillStyle = g;
        ctx!.beginPath();
        ctx!.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalCompositeOperation = "source-over";
    }

    let raf = 0;
    let running = false;

    function loop() {
      paint();
      raf = requestAnimationFrame(loop);
    }
    function start() {
      if (running || reduce) return;
      running = true;
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    resize();
    paint(); // one static frame regardless

    // Only animate while visible
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

    function onVisibility() {
      if (document.hidden) stop();
      else if (!reduce) start();
    }

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      io.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pull, intensity, tone]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
