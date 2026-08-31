module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}'],

  darkMode: 'class',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      fontFamily: {
        mono: [
          'JetBrains Mono Variable',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'Courier New',
          'monospace'
        ]
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },

        'surface-shell': 'hsl(var(--surface-shell))',
        'surface-chrome': 'hsl(var(--surface-chrome))',
        'surface-panel': 'hsl(var(--surface-panel))',
        'surface-control': 'hsl(var(--surface-control))',
        'surface-editor': 'hsl(var(--surface-editor))',
        hairline: 'hsl(var(--hairline))',
        'border-control': 'hsl(var(--border-control))',
        'border-bar': 'hsl(var(--border-bar))',
        'nav-active': 'hsl(var(--nav-active))',
        'row-hover': 'hsl(var(--row-hover))',
        'accent-indigo': 'hsl(var(--accent-indigo))',
        'accent-indigo-bright': 'hsl(var(--accent-indigo-bright))',
        'mono-keyword': 'hsl(var(--mono-keyword))',
        success: 'hsl(var(--success))',
        'success-muted': 'hsl(var(--success-muted))',
        'status-connected': 'hsl(var(--status-connected))',
        'type-barcode': 'hsl(var(--type-barcode))',
        'type-speech': 'hsl(var(--type-speech))',
        stale: 'hsl(var(--stale))',
        'glyph-dim': 'hsl(var(--glyph-dim))',
        'glyph-dimmer': 'hsl(var(--glyph-dimmer))',
        'text-dim': 'hsl(var(--text-dim))'
      },
      borderRadius: {
        lg: `var(--radius)`,
        md: `calc(var(--radius) - 2px)`,
        sm: 'calc(var(--radius) - 4px)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
