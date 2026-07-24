import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatPercent, formatPhp } from '@/lib/money'

export type CommitmentSplitPreview = {
  projectName: string
  confirmedAmount: number
  weightRatio: number
  expectedProfitShare: number
}

export function CommitmentConfirmDialog({
  open,
  onOpenChange,
  financeName,
  amount,
  stillNeeded,
  suggested,
  capitalRequired,
  fundedAfter,
  isUpdate,
  previousAmount,
  busy,
  onConfirm,
  splits,
  expectedProfitTotal,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  financeName: string
  amount: number
  stillNeeded?: number
  suggested?: number
  capitalRequired?: number
  fundedAfter?: number
  isUpdate?: boolean
  previousAmount?: number
  busy?: boolean
  onConfirm: () => void
  splits?: CommitmentSplitPreview[]
  expectedProfitTotal?: number
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-5">
        <DialogHeader className="text-center">
          <DialogTitle>{isUpdate ? 'Update commitment?' : 'Confirm your commitment'}</DialogTitle>
          <DialogDescription>
            Review the details for <span className="font-medium text-foreground">{financeName}</span> before you
            continue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-xl border border-border/40 bg-muted/15 p-4">
          <div className="text-center">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">You will commit</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{formatPhp(amount)}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            {stillNeeded != null ? (
              <div className="rounded-lg bg-background/70 px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Still needed</p>
                <p className="mt-0.5 font-semibold tabular-nums">{formatPhp(stillNeeded)}</p>
              </div>
            ) : null}
            {suggested != null ? (
              <div className="rounded-lg bg-background/70 px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Suggested</p>
                <p className="mt-0.5 font-semibold tabular-nums">{formatPhp(suggested)}</p>
              </div>
            ) : null}
          </div>

          {capitalRequired != null && fundedAfter != null ? (
            <p className="text-center text-xs text-muted-foreground">
              After this, {formatPhp(fundedAfter)} of {formatPhp(capitalRequired)} will be funded.
            </p>
          ) : null}

          {isUpdate && previousAmount != null && previousAmount > 0 ? (
            <p className="text-center text-xs text-muted-foreground">
              Current commitment: <span className="font-medium text-foreground">{formatPhp(previousAmount)}</span>
            </p>
          ) : null}

          {splits && splits.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-border/40 bg-background/70 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Split by budget weight
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-1 font-medium">Finance</th>
                    <th className="pb-1 text-right font-medium">Share</th>
                    <th className="pb-1 text-right font-medium">Amount</th>
                    <th className="pb-1 text-right font-medium">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {splits.map((s) => (
                    <tr key={s.projectName} className="border-t border-border/40">
                      <td className="py-1.5 font-medium">{s.projectName}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                        {formatPercent(s.weightRatio * 100)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{formatPhp(s.confirmedAmount)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatPhp(s.expectedProfitShare)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {expectedProfitTotal != null ? (
                <div className="flex justify-between border-t pt-2 text-sm font-semibold">
                  <span>Your expected profit</span>
                  <span className="tabular-nums text-primary">{formatPhp(expectedProfitTotal)}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Go back
          </Button>
          <Button type="button" disabled={busy} onClick={() => onConfirm()}>
            {busy ? 'Saving…' : isUpdate ? 'Yes, update' : 'Yes, confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
