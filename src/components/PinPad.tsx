import { useEffect, useState } from 'react'
import { Delete, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PinPadProps {
  value: string
  onChange: (next: string) => void
  onComplete?: (pin: string) => void
  disabled?: boolean
  title?: string
  className?: string
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const

export function PinPad({ value, onChange, onComplete, disabled, title, className }: PinPadProps) {
  const [local, setLocal] = useState(value)

  useEffect(() => {
    setLocal(value)
  }, [value])

  function press(key: string) {
    if (disabled) return
    let next = local
    if (key === 'del') next = local.slice(0, -1)
    else if (key === '' || local.length >= 4) return
    else next = local + key
    setLocal(next)
    onChange(next)
    if (next.length === 4) onComplete?.(next)
  }

  return (
    <div className={cn('mx-auto w-full max-w-xs', className)}>
      {title ? <p className="mb-4 text-center text-sm text-muted-foreground">{title}</p> : null}
      <div className="mb-6 flex justify-center gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-3.5 w-3.5 rounded-full border-2 border-primary/40',
              i < local.length ? 'bg-primary border-primary' : 'bg-transparent',
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((key, idx) => {
          if (key === '') return <div key={`empty-${idx}`} />
          if (key === 'del') {
            return (
              <Button
                key="del"
                type="button"
                variant="secondary"
                className="h-14 text-lg"
                disabled={disabled || local.length === 0}
                onClick={() => press('del')}
              >
                <Delete className="h-5 w-5" />
              </Button>
            )
          }
          return (
            <Button
              key={key}
              type="button"
              variant="outline"
              className="h-14 text-xl font-semibold"
              disabled={disabled}
              onClick={() => press(key)}
            >
              {key}
            </Button>
          )
        })}
      </div>
      {local.length === 4 ? (
        <p className="mt-3 flex items-center justify-center gap-1 text-xs text-emerald-700">
          <Check className="h-3.5 w-3.5" /> PIN entered
        </p>
      ) : null}
    </div>
  )
}
