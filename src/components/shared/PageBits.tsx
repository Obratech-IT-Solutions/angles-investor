import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  description,
  actions,
  centered,
}: {
  title: string
  description?: string
  actions?: ReactNode
  centered?: boolean
}) {
  return (
    <div
      className={cn(
        'mb-6 flex flex-col gap-3',
        centered ? 'text-center' : 'sm:flex-row sm:items-end sm:justify-between',
      )}
    >
      <div className={cn(centered && actions && 'mx-auto')}>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-primary md:text-3xl">
          {title}
        </h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? (
        <div className={cn('flex flex-wrap gap-2', centered && 'justify-center')}>{actions}</div>
      ) : null}
    </div>
  )
}

export function KpiCard({
  label,
  value,
  hint,
  className,
}: {
  label: string
  value: string
  hint?: string
  className?: string
}) {
  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="tabular-nums text-2xl text-primary">{value}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      ) : null}
    </Card>
  )
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
      <p className="font-medium text-foreground">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  )
}
