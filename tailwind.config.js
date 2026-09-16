/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eefbf7",
          100: "#d6f5ec",
          200: "#b0ebdb",
          300: "#7ddbc4",
          400: "#47c2a8",
          500: "#27a78f",
          600: "#178570",
          700: "#146b5c",
          800: "#135649",
          900: "#11473d",
          950: "#0b2f2a",
        },
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      boxShadow: {
        premium: "0 24px 70px rgba(15,23,42,0.14)",
      },
    },
  },
  plugins: [],
};
