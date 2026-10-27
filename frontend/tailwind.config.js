/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Trading-desk telemetry palette.
        base: "#0a0e17",
        panel: "#111827",
        panel2: "#161f31",
        edge: "#1f2b3e",
        actual: "#2b95d6",
        forecast: "#cf7f1f",
        errneg: "#2f9e6f",
        errpos: "#c75563",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
