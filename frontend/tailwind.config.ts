import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    // Insert an `xs` breakpoint at 420px — Tailwind's default starts
    // at `sm: 640px`, which leaves a dead zone on narrow phones
    // (iPhone SE, small Androids). Used for layout tweaks that need
    // to change between pocket-sized and standard mobile.
    screens: {
      xs: "420px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      colors: {
        black: "#000000",
        dark: "#0a0a0a",
        "dark-card": "#111111",
        "dark-surface": "#1a1a1a",
        gold: "#FFD700",
        "gold-dark": "#B8960C",
        "gold-light": "#FFF4B0",
        silver: "#C0C0C0",
        cyan: "#00E5FF",
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', "monospace"],
        body: ['"Inter"', "sans-serif"],
      },
      animation: {
        "card-flip": "card-flip 0.6s ease-in-out",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "slide-up": "slide-up 0.5s ease-out",
        "fade-in": "fade-in 0.4s ease-out",
        "pixel-float": "pixel-float 3s ease-in-out infinite",
        "pixel-blink": "pixel-blink 1s step-end infinite",
      },
      keyframes: {
        "card-flip": {
          "0%": { transform: "rotateY(0deg)" },
          "50%": { transform: "rotateY(90deg)" },
          "100%": { transform: "rotateY(0deg)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 5px currentColor" },
          "50%": { boxShadow: "0 0 20px currentColor, 0 0 40px currentColor" },
        },
        "slide-up": {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "pixel-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "pixel-blink": {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
