/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      fontWeight: {
        normal: '400',
        medium: '500',
      },
      colors: {
        brand: {
          DEFAULT: '#0E6B55',
          dark: '#0A4F3E',
          light: '#E6F5F1',
        },
        bg: {
          light: '#F7F5F0',
          dark: '#1A1F2E',
        },
        surface: {
          light: '#FFFFFF',
          dark: '#252B3B',
        },
        category: {
          alimentacion: { light: '#F4A261', dark: '#FF6B2B' },
          transporte:   { light: '#81B1D4', dark: '#00AAFF' },
          ocio:         { light: '#A8D5A2', dark: '#00E676' },
          hogar:        { light: '#C9A8D4', dark: '#E040FB' },
          salud:        { light: '#F2A0AC', dark: '#FF4081' },
          otros:        { light: '#B5C4B1', dark: '#69F0AE' },
        },
      },
      fontSize: {
        'h1':      ['28px', { fontWeight: '500' }],
        'h2':      ['20px', { fontWeight: '500' }],
        'body':    ['15px', { fontWeight: '400' }],
        'caption': ['12px', { fontWeight: '400' }],
        'xl-data': ['36px', { fontWeight: '500' }],
        'nav-label': ['11px', { fontWeight: '400' }],
      },
      borderRadius: {
        card:   '12px',
        btn:    '10px',
        input:  '8px',
        badge:  '20px',
      },
      transitionDuration: {
        '150': '150ms',
        '200': '200ms',
      },
    },
  },
  plugins: [],
}
