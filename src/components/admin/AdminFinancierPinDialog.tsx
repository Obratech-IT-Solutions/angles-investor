import { useState } from 'react'
import { toast } from 'sonner'
import { PinPad } from '@/components/PinPad'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

export async function invokeAdminSetPin(profileId: string, pin: string) {
  const { data, error } = await supabase.functions.invoke('admin-reset-pin', {
    body: { profile_id: profileId, pin },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
  return data as { profile: Profile; pin: string }
}

type AdminFinancierPinDialogProps = {
  profile: Profile | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function AdminFinancierSetPinDialog({ profile, open, onOpenChange, onSuccess }: AdminFinancierPinDialogProps) {
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinBusy, setPinBusy] = useState(false)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setNewPin('')
      setConfirmPin('')
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Set PIN for {profile?.full_name ?? 'financier'}</DialogTitle>
          <DialogDescription>Enter the new 4-digit PIN twice to confirm.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>New PIN</Label>
            <Input
              inputMode="numeric"
              maxLength={4}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
            />
          </div>
          <div className="space-y-2">
            <Label>Confirm PIN</Label>
            <Input
              inputMode="numeric"
              maxLength={4}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
            />
          </div>
          <PinPad value={newPin} onChange={setNewPin} disabled={pinBusy} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pinBusy}>
            Cancel
          </Button>
          <Button
            disabled={pinBusy || !profile || newPin.length !== 4 || newPin !== confirmPin}
            onClick={async () => {
              if (!profile) return
              setPinBusy(true)
              try {
                await invokeAdminSetPin(profile.id, newPin)
                handleOpenChange(false)
                toast.success(`PIN updated for ${profile.full_name}`)
                onSuccess?.()
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Failed to set PIN')
              } finally {
                setPinBusy(false)
              }
            }}
          >
            {pinBusy ? 'Saving…' : 'Save PIN'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type AdminFinancierPinResetDialogProps = {
  profile: Profile | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function AdminFinancierPinResetDialog({
  profile,
  open,
  onOpenChange,
  onSuccess,
}: AdminFinancierPinResetDialogProps) {
  const [busy, setBusy] = useState(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset PIN to 0000?</DialogTitle>
          <DialogDescription>
            This sets {profile?.full_name ?? 'this financier'}&apos;s PIN back to the default 0000.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !profile}
            onClick={async () => {
              if (!profile) return
              setBusy(true)
              try {
                await invokeAdminSetPin(profile.id, '0000')
                onOpenChange(false)
                toast.success(`PIN reset to 0000 for ${profile.full_name}`)
                onSuccess?.()
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Reset failed')
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? 'Resetting…' : 'Reset to 0000'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
