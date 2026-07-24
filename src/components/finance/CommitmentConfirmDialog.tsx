import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatPhp } from '@/lib/money'

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
