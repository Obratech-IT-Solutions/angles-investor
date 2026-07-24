import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatPhp } from '@/lib/money'
import { cn } from '@/lib/utils'

export type FinanceBudgetSlice = {
  key: string
  name: string
  value: number
  color: string
}

type FinanceBudgetPieChartProps = {
  slices: FinanceBudgetSlice[]
  total: number
  className?: string
  title?: string
}

export function FinanceBudgetPieChart({
  slices,
  total,
  className,
  title = 'Budget split',
}: FinanceBudgetPieChartProps) {
  if (slices.length === 0 || total <= 0) return null

  return (
    <div className={cn('rounded-lg bg-muted/40 p-3', className)}>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="flex items-center gap-3">
        <ul className="min-w-0 flex-1 space-y-1 text-xs">
          {slices.map((entry) => {
            const pct = total > 0 ? (entry.value / total) * 100 : 0
            return (
              <li key={entry.key} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="truncate">{entry.name}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatPhp(entry.value)} · {pct.toFixed(1)}%
                </span>
              </li>
            )
          })}
        </ul>
        <div className="h-24 w-24 shrink-0 sm:h-28 sm:w-28">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                innerRadius="52%"
                outerRadius="88%"
                paddingAngle={slices.length > 1 ? 2 : 0}
              >
                {slices.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatPhp(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
