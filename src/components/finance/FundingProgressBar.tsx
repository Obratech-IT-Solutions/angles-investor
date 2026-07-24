import { formatPhp, fundingProgress, toNumber } from '@/lib/money'

export type FundingSegment = {
  id: string
  label: string
  amount: number
  color: string
}

export function FundingProgressBar({
  capital,
  segments,
}: {
  capital: number | string
  segments: FundingSegment[]
}) {
  const cap = toNumber(capital)
  if (cap <= 0) return null

  const total = segments.reduce((sum, seg) => sum + seg.amount, 0)

  return (
    <div
      className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={fundingProgress(total, cap)}
    >
      <div className="flex h-full w-full">
        {segments.map((seg) => {
          const width = (seg.amount / cap) * 100
          if (width <= 0) return null
          return (
            <div
              key={seg.id}
              className="h-full shrink-0 transition-all"
              style={{ width: `${width}%`, backgroundColor: seg.color }}
              title={`${seg.label}: ${formatPhp(seg.amount)}`}
            />
          )
        })}
      </div>
    </div>
  )
}

export function FundingProgressLegend({ segments }: { segments: FundingSegment[] }) {
  if (segments.length === 0) return null

  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {segments.map((seg) => (
        <span key={seg.id} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} aria-hidden />
          <span className="font-medium text-foreground">{seg.label}</span>
          <span className="tabular-nums">{formatPhp(seg.amount)}</span>
        </span>
      ))}
    </div>
  )
}

export function FinancierColorDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className ?? ''}`}
      style={{ backgroundColor: color }}
      aria-hidden
    />
  )
}
