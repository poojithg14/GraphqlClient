/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
        "./src/**/*.{js,jsx,ts,tsx}",
        "./public/index.html"
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                mono: ['Fira Code', 'Menlo', 'Monaco', 'monospace'],
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)'
            },
            colors: {
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                card: {
                    DEFAULT: 'hsl(var(--card))',
                    foreground: 'hsl(var(--card-foreground))'
                },
                popover: {
                    DEFAULT: 'hsl(var(--popover))',
                    foreground: 'hsl(var(--popover-foreground))'
                },
                primary: {
                    DEFAULT: 'hsl(var(--primary))',
                    foreground: 'hsl(var(--primary-foreground))'
                },
                secondary: {
                    DEFAULT: 'hsl(var(--secondary))',
                    foreground: 'hsl(var(--secondary-foreground))'
                },
                muted: {
                    DEFAULT: 'hsl(var(--muted))',
                    foreground: 'hsl(var(--muted-foreground))'
                },
                accent: {
                    DEFAULT: 'hsl(var(--accent))',
                    foreground: 'hsl(var(--accent-foreground))'
                },
                success: {
                    DEFAULT: 'hsl(var(--success))',
                    foreground: 'hsl(var(--success-foreground))'
                },
                warning: {
                    DEFAULT: 'hsl(var(--warning))',
                    foreground: 'hsl(var(--warning-foreground))'
                },
                destructive: {
                    DEFAULT: 'hsl(var(--destructive))',
                    foreground: 'hsl(var(--destructive-foreground))'
                },
                border: 'hsl(var(--border))',
                input: 'hsl(var(--input))',
                ring: 'hsl(var(--ring))',
                // VS Code specific
                vscode: {
                    sidebar: 'hsl(var(--vscode-sidebar))',
                    editor: 'hsl(var(--vscode-editor))',
                    panel: 'hsl(var(--vscode-panel))',
                    activitybar: 'hsl(var(--vscode-activitybar))',
                    statusbar: 'hsl(var(--vscode-statusbar))',
                    border: 'hsl(var(--vscode-border))',
                    titlebar: 'hsl(var(--vscode-titlebar))',
                },
                // Syntax colors
                syntax: {
                    keyword: 'hsl(var(--syntax-keyword))',
                    type: 'hsl(var(--syntax-type))',
                    string: 'hsl(var(--syntax-string))',
                    variable: 'hsl(var(--syntax-variable))',
                    comment: 'hsl(var(--syntax-comment))',
                    function: 'hsl(var(--syntax-function))',
                    number: 'hsl(var(--syntax-number))',
                },
                chart: {
                    '1': 'hsl(var(--chart-1))',
                    '2': 'hsl(var(--chart-2))',
                    '3': 'hsl(var(--chart-3))',
                    '4': 'hsl(var(--chart-4))',
                    '5': 'hsl(var(--chart-5))'
                }
            },
            keyframes: {
                'accordion-down': {
                    from: { height: '0' },
                    to: { height: 'var(--radix-accordion-content-height)' }
                },
                'accordion-up': {
                    from: { height: 'var(--radix-accordion-content-height)' },
                    to: { height: '0' }
                },
                'slide-in-left': {
                    from: { opacity: '0', transform: 'translateX(-10px)' },
                    to: { opacity: '1', transform: 'translateX(0)' }
                },
                'fade-in': {
                    from: { opacity: '0' },
                    to: { opacity: '1' }
                },
                'pulse-glow': {
                    '0%, 100%': { boxShadow: '0 0 0 0 hsl(var(--primary) / 0.4)' },
                    '50%': { boxShadow: '0 0 0 8px hsl(var(--primary) / 0)' }
                },
                'spin': {
                    to: { transform: 'rotate(360deg)' }
                }
            },
            animation: {
                'accordion-down': 'accordion-down 0.2s ease-out',
                'accordion-up': 'accordion-up 0.2s ease-out',
                'slide-in-left': 'slide-in-left 0.3s ease-out',
                'fade-in': 'fade-in 0.2s ease-out',
                'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
                'spin': 'spin 0.8s linear infinite'
            },
            boxShadow: {
                'vscode': '0 0 8px 0 hsl(0 0% 0% / 0.2)',
                'panel': '0 -1px 4px 0 hsl(0 0% 0% / 0.1)',
                'dropdown': '0 4px 12px 0 hsl(0 0% 0% / 0.15)',
            }
        }
    },
    plugins: [require("tailwindcss-animate")],
};
