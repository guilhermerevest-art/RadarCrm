import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand colors from BRIEFING_LOGO.md
        primary: {
          DEFAULT: '#D9541F', // laranja-queimado
          50: '#FEF0EC',
          100: '#FCDAD0',
          200: '#F9B5A1',
          300: '#F59071',
          400: '#E86B41',
          500: '#D9541F',
          600: '#C24518',
          700: '#9E3714',
          800: '#7A2A10',
          900: '#561D0D',
        },
        secondary: {
          DEFAULT: '#2E6F8E', // azul-cimento
          50: '#EBF4F7',
          100: '#D7E9EF',
          200: '#AFD3DF',
          300: '#87BDCF',
          400: '#5FA7BF',
          500: '#2E6F8E',
          600: '#265C7A',
          700: '#1E4566',
          800: '#162E52',
          900: '#0E173E',
        },
        dark: {
          DEFAULT: '#0F1B24', // tinta escura
          50: '#E8EDF0',
          100: '#D1DBE1',
          200: '#A3B7C3',
          300: '#7593A5',
          400: '#476F87',
          500: '#0F1B24',
          600: '#0A1116',
          700: '#060B0E',
          800: '#030506',
          900: '#000000',
        },
        // shadcn/ui CSS variable colors
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        // Legacy/alias
        paper: '#FFFFFF',
        line: '#A9B4BA',
      },
      borderRadius: {
        lg: '0.5rem',
        md: '0.375rem',
        sm: '0.25rem',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
