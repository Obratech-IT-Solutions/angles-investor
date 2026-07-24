import * as React from 'react'
import { Input } from '@/components/ui/input'
import { formatMoneyInputWithCaret } from '@/lib/money'
import { cn } from '@/lib/utils'

type MoneyInputProps = Omit<React.ComponentProps<'input'>, 'type' | 'value' | 'onChange'> & {
  value: string
  onValueChange: (formatted: string) => void
}

/** Text money field that auto-inserts thousand commas while typing (caret stays put). */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  function MoneyInput({ value, onValueChange, className, onBlur, onSelect, ...props }, ref) {
    const inputRef = React.useRef<HTMLInputElement | null>(null)
    const caretRef = React.useRef<number | null>(null)

    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      },
      [ref],
    )

    React.useLayoutEffect(() => {
      const el = inputRef.current
      const caret = caretRef.current
      if (!el || caret === null) return
      if (document.activeElement !== el) {
        caretRef.current = null
        return
      }
      const next = Math.max(0, Math.min(caret, el.value.length))
      el.setSelectionRange(next, next)
      caretRef.current = null
    }, [value])

    return (
      <Input
        {...props}
        ref={setRefs}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          const el = e.target
          const { formatted, caret } = formatMoneyInputWithCaret(el.value, el.selectionStart)
          caretRef.current = caret
          onValueChange(formatted)
        }}
        onSelect={onSelect}
        onBlur={onBlur}
        className={cn('tabular-nums', className)}
      />
    )
  },
)
MoneyInput.displayName = 'MoneyInput'
