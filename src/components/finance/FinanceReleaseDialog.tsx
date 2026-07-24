import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MoneyInput } from '@/components/ui/money-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatPhp, moneyInputFromValue, toNumber } from '@/lib/money'
import { supabase } from '@/lib/supabase'
import type { Project } from '@/types'

export function FinanceReleaseDialog({
  project,
  open,
  onOpenChange,
  onReleased,
}: {
  project: Project | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onReleased?: () => void
}) {
  const [actualDate, setActualDate] = useState(new Date().toISOString().slice(0, 10))
  const [capital, setCapital] = useState('')
  const [profit, setProfit] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!project || !open) return
    setActualDate(new Date().toISOString().slice(0, 10))
    setCapital(moneyInputFromValue(project.capital_required ?? ''))
    setProfit(moneyInputFromValue(project.expected_profit ?? ''))
    setNotes('')
  }, [project, open])

  const alreadyReleased = project?.status === 'released' || project?.status === 'completed'

  async function recordRelease() {
    if (!project) return
    setBusy(true)
    const { error } = await supabase.rpc('record_project_release', {
      p_project_id: project.id,
      p_actual_date: actualDate,
      p_capital_released: toNumber(capital),
      p_profit_released: toNumber(profit),
      p_notes: notes || null,
    })
    setBusy(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Release recorded — financiers can now confirm receipt')
    onOpenChange(false)
    onReleased?.()
  }

  if (!project) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record release</DialogTitle>
          <DialogDescription>
            Release capital and profit for <span className="font-medium text-foreground">{project.name}</span>.
            Each confirmed financier will be notified to confirm they received their payout.
          </DialogDescription>
        </DialogHeader>

        {alreadyReleased ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            This finance is already marked as released. Recording again will create another release entry.
          </p>
        ) : null}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="release-date">Actual release date</Label>
            <Input
              id="release-date"
              type="date"
              value={actualDate}
              onChange={(e) => setActualDate(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="release-capital">Capital released</Label>
              <MoneyInput
                id="release-capital"
                value={capital}
                onValueChange={setCapital}
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">Required: {formatPhp(project.capital_required)}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="release-profit">Profit released</Label>
              <MoneyInput
                id="release-profit"
                value={profit}
                onValueChange={setProfit}
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">Expected: {formatPhp(project.expected_profit)}</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="release-notes">Notes (optional)</Label>
            <Textarea
              id="release-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={
              busy ||
              !actualDate ||
              !Number.isFinite(Number(capital)) ||
              !Number.isFinite(Number(profit)) ||
              toNumber(capital) <= 0
            }
            onClick={() => void recordRelease()}
          >
            {busy ? 'Recording…' : 'Record release'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
