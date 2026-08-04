import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Rebrand palette. `ink` and `paper` resolve through CSS variables so a
        // `.dark` class can swap the whole main surface at once; the RGB-channel
        // form keeps every `/opacity` modifier working via <alpha-value>.
        ink: {
          DEFAULT: "rgb(var(--c-ink) / <alpha-value>)",
          soft: "rgb(var(--c-ink-soft) / <alpha-value>)",
          softer: "rgb(var(--c-ink-softer) / <alpha-value>)",
          line: "rgb(var(--c-ink-line) / <alpha-value>)",
        },
        paper: {
          DEFAULT: "rgb(var(--c-paper) / <alpha-value>)",
          warm: "rgb(var(--c-paper-warm) / <alpha-value>)",
          dim: "rgb(var(--c-paper-dim) / <alpha-value>)",
        },
        // Fixed, theme-independent surface for intentionally-dark panels
        // (footer, onboarding modals, balance strips). These never flip.
        panel: {
          DEFAULT: "#171618",
          foreground: "#f7f6f4",
          line: "rgb(255 255 255 / <alpha-value>)",
        },
        volt: {
          DEFAULT: "#2b44e7",
          bright: "#4258ff",
          deep: "#1c2fb0",
          wash: "#eef0fe",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.045em",
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.75rem",
      },
      transitionTimingFunction: {
        liquid: "cubic-bezier(0.22, 1, 0.36, 1)",
        springy: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      keyframes: {
        drift: {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)" },
          "33%": { transform: "translate3d(3%,-4%,0) scale(1.06)" },
          "66%": { transform: "translate3d(-3%,3%,0) scale(0.96)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        floaty: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "70%": { transform: "scale(1.6)", opacity: "0" },
          "100%": { opacity: "0" },
        },
      },
      animation: {
        drift: "drift 18s ease-in-out infinite",
        "drift-slow": "drift 28s ease-in-out infinite",
        shimmer: "shimmer 2.4s linear infinite",
        floaty: "floaty 6s ease-in-out infinite",
        "pulse-ring": "pulse-ring 2.4s cubic-bezier(0.4,0,0.6,1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
