import { useMemo } from 'react'

type Drop = {
  id: number
  left: string
  delay: string
  duration: string
  size: string
  opacity: number
  symbol: string
  sway: string
}

const SYMBOLS = ['$', '$', '$', '₱', '💵', '💰']

export function MoneyRain({ count = 36 }: { count?: number }) {
  const drops = useMemo<Drop[]>(
    () =>
      Array.from({ length: count }, (_, id) => ({
        id,
        left: `${(id * 37) % 100}%`,
        delay: `${-((id * 0.47) % 8).toFixed(2)}s`,
        duration: `${(7 + (id % 6) * 1.1).toFixed(1)}s`,
        size: `${1 + (id % 5) * 0.35}rem`,
        opacity: 0.25 + (id % 5) * 0.1,
        symbol: SYMBOLS[id % SYMBOLS.length],
        sway: `${(id % 2 === 0 ? 1 : -1) * (12 + (id % 4) * 6)}px`,
      })),
    [count],
  )

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {drops.map((d) => (
        <span
          key={d.id}
          className="money-drop absolute top-[-10%] select-none font-bold text-emerald-300/90"
          style={{
            left: d.left,
            fontSize: d.size,
            opacity: d.opacity,
            animationDelay: d.delay,
            animationDuration: d.duration,
            ['--sway' as string]: d.sway,
          }}
        >
          {d.symbol}
        </span>
      ))}
    </div>
  )
}
