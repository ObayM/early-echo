export const int = (n: number) => n.toLocaleString('en')

export const pct = (fraction: number) => `${+(fraction * 100).toFixed(1)}%`

export const atm = (p: number) => `${p.toFixed(2)} atm`

export const seconds = (s: number) => `${+s.toFixed(1)} s`

export const signed = (v: number, digits = 2) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`

export const GAS: Record<string, string> = { N2: 'nitrogen', CO2: 'carbon dioxide', He: 'helium' }
