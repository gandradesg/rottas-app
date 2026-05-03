// Tailwind config — paleta Rottas (laranja + creme + dark navy)
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Cores semânticas (mudam com o tema, ver styles.css)
        bg: 'rgb(var(--bg) / <alpha-value>)',
        'bg-elev': 'rgb(var(--bg-elev) / <alpha-value>)',
        'bg-card': 'rgb(var(--bg-card) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        'fg-muted': 'rgb(var(--fg-muted) / <alpha-value>)',
        'fg-subtle': 'rgb(var(--fg-subtle) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        // Marca Rottas — derivado da paleta do site
        rottas: {
          50:  '#FFF4EC',
          100: '#FFE3CF',
          200: '#FFC59A',
          300: '#FFA266',
          400: '#FB8235',
          500: '#F26B22', // primária
          600: '#D5530F',
          700: '#A93E0B',
          800: '#7C2D08',
          900: '#4F1C05',
        },
        success: { DEFAULT: '#10B981', soft: '#10B98122' },
        warning: { DEFAULT: '#F59E0B', soft: '#F59E0B22' },
        danger:  { DEFAULT: '#EF4444', soft: '#EF444422' },
        info:    { DEFAULT: '#3B82F6', soft: '#3B82F622' },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl2: '1rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,21,37,0.06), 0 4px 16px rgba(15,21,37,0.04)',
        pop:  '0 8px 32px rgba(15,21,37,0.16)',
      },
      animation: {
        'fade-in': 'fadeIn .18s ease-out',
        'slide-up': 'slideUp .24s ease-out',
        'pulse-soft': 'pulseSoft 2.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from:{opacity:0}, to:{opacity:1} },
        slideUp: { from:{opacity:0, transform:'translateY(8px)'}, to:{opacity:1, transform:'translateY(0)'} },
        pulseSoft: { '0%,100%':{opacity:1}, '50%':{opacity:.6} },
      },
    },
  },
};
