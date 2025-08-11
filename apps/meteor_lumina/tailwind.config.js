/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/**/*.{ts,tsx}', './imports/**/*.{ts,tsx}'],
  plugins: [require('tailwindcss-animate')],
}
