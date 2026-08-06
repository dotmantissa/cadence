"use client";

import { useEffect, useRef } from "react";

/**
 * Site-wide ambient backdrop: the Cadence brand wave, tiled into diagonal
 * streamlines that flow continuously across the whole viewport with an
 * occasional liquid "glitch" displacement. It reads as value in perpetual
 * motion under the entire product — the same wave that's on the logo and the
 * receipt, now animating behind everything.
 *
 * Mounted once (in the root layout) as a `fixed`, pointer-events-none overlay at
 * low opacity, exactly like the `.grain` layer — it paints over section
 * backgrounds without intercepting input or hurting text contrast.
 *
 * Performance guardrails, so it "flows without affecting site performance":
 *   - DPR capped at 1.5; canvas sized to the viewport, not the document.
 *   - One offscreen tile is baked once and re-blitted along each lane, so a
 *     frame is a handful of drawImage calls, not thousands of path segments.
 *   - Pauses on tab-hidden; renders a single static frame for reduced-motion.
 *   - The glitch is a cheap per-lane x-offset that decays, not a shader.
 */
export function AmbientWave() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    // One period of the brand wave, baked to an offscreen tile we scroll.
    const TILE_W = 220;
    const TILE_H = 64;
    const tile = document.createElement("canvas");

    function bakeTile(stroke: string) {
      tile.width = Math.floor(TILE_W * dpr);
      tile.height = Math.floor(TILE_H * dpr);
      const tctx = tile.getContext("2d")!;
      tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      tctx.clearRect(0, 0, TILE_W, TILE_H);
      tctx.strokeStyle = stroke;
      tctx.lineWidth = 1.4;
      tctx.lineCap = "round";
      tctx.lineJoin = "round";
      // Two periods so a horizontal scroll of one TILE_W wraps seamlessly.
      const mid = TILE_H / 2;
      const amp = 13;
      tctx.beginPath();
      for (let x = 0; x <= TILE_W; x += 4) {
        const y = mid - Math.sin((x / TILE_W) * Math.PI * 2) * amp;
        if (x === 0) tctx.moveTo(x, y);
        else tctx.lineTo(x, y);
      }
      tctx.stroke();
    }

    // Volt, tuned per theme so it stays a whisper over both papers.
    function themeStroke() {
      const dark = document.documentElement.classList.contains("dark");
      return dark ? "rgba(96,120,255,0.85)" : "rgba(43,68,231,0.7)";
    }

    let w = 0;
    let h = 0;
    const ANGLE = (-18 * Math.PI) / 180; // diagonal tilt of the whole field
    const LANE_GAP = 46; // vertical spacing between streamlines

    interface Lane {
      y: number;
      speed: number; // px/sec, varied so lanes shear past each other (liquid)
      phase: number; // current scroll offset
      glitch: number; // active x-displacement, decays to 0
    }
    let lanes: Lane[] = [];

    function seed() {
      // Cover the rotated field: extend beyond the viewport on every side so the
      // tilt never reveals a bare corner.
      const span = Math.hypot(w, h);
      const n = Math.ceil(span / LANE_GAP) + 4;
      lanes = Array.from({ length: n }, (_, i) => ({
        y: (i - 2) * LANE_GAP,
        speed: 10 + Math.random() * 22,
        phase: Math.random() * TILE_W,
        glitch: 0,
      }));
    }

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      bakeTile(themeStroke());
      seed();
    }

    // Deterministic-ish glitch scheduler: every frame a small chance a random
    // lane kicks sideways, then eases back. No Math.random ban here (client only).
    function maybeGlitch() {
      if (Math.random() < 0.04 && lanes.length) {
        const lane = lanes[Math.floor(Math.random() * lanes.length)];
        lane.glitch = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 22);
      }
    }

    function draw(dt: number) {
      ctx!.clearRect(0, 0, w, h);
      ctx!.save();
      // Rotate about the viewport centre so the streamlines run diagonally.
      ctx!.translate(w / 2, h / 2);
      ctx!.rotate(ANGLE);
      ctx!.translate(-w / 2, -h / 2);

      const span = Math.hypot(w, h);
      const startX = (w - span) / 2;
      const endX = (w + span) / 2;

      for (const lane of lanes) {
        lane.phase = (lane.phase + lane.speed * dt) % TILE_W;
        // Ease any active glitch back toward zero — the "settling liquid" feel.
        if (lane.glitch !== 0) {
          lane.glitch *= Math.exp(-dt * 6);
          if (Math.abs(lane.glitch) < 0.3) lane.glitch = 0;
        }
        const offset = -lane.phase + lane.glitch;
        for (let x = startX - TILE_W; x < endX + TILE_W; x += TILE_W) {
          ctx!.drawImage(tile, x + offset, lane.y - TILE_H / 2, TILE_W, TILE_H);
        }
      }
      ctx!.restore();
    }

    let raf = 0;
    let last = 0;
    let running = false;

    function loop(now: number) {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      maybeGlitch();
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
    draw(0); // one static frame always, so reduced-motion still shows the wave

    function onVis() {
      if (document.hidden) stop();
      else if (!reduce) start();
    }

    // Re-bake the stroke colour when the theme toggles.
    const themeObserver = new MutationObserver(() => bakeTile(themeStroke()));
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVis);
    start();

    return () => {
      stop();
      themeObserver.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[1] h-full w-full opacity-[0.07] dark:opacity-[0.09]"
    />
  );
}
