/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#F5F3EE',
        muted: '#9C9A94',
        dim: '#6E6B64',
        accent: '#FFD84D',
        accent2: '#FFB020',
        gold: '#FF9F1C',
        line: 'rgba(255,255,255,0.09)',
        panel: 'rgba(255,255,255,0.04)',
      },
      fontFamily: {
        sans: ['Inter', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        num: ['Inter', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255,216,77,.14), 0 30px 80px -40px rgba(255,176,32,.35)',
      },
    },
  },
  plugins: [],
}
