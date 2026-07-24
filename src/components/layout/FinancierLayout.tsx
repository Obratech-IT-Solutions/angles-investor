import { useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  DollarSign,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  UserCircle,
  Wallet,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { unlockAndPlayKaChing } from '@/lib/kaChing'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { SidebarNav, type NavItem } from '@/components/layout/SidebarNav'

const finNav: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/finance', label: 'Finance', icon: FolderKanban },
  { to: '/app/budget', label: 'Budget', icon: Wallet },
  { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/app/profile', label: 'Profile', icon: UserCircle },
]

function Brand() {
  const { profile } = useAuth()
  const financierName = profile?.display_name || profile?.full_name || 'Financier'

  return (
    <Link to="/app" className="flex items-center gap-2 px-4 py-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/15 text-white">
        <DollarSign className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0">
        <div className="truncate font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-white">
          {financierName}
        </div>
        <div className="truncate text-[11px] uppercase tracking-wider text-slate-300">Angels Investor</div>
      </div>
    </Link>
  )
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex h-full flex-col bg-primary text-white">
      <Brand />
      <div className="flex-1 overflow-y-auto">
        <SidebarNav items={finNav} onNavigate={onNavigate} />
      </div>
      <div className="border-t border-white/10 p-4">
        <div className="mb-3 truncate text-sm text-slate-200">{profile?.full_name}</div>
        <Button
          variant="secondary"
          className="w-full justify-start gap-2 bg-white/10 text-white hover:bg-white/20"
          onClick={async () => {
            void unlockAndPlayKaChing()
            await signOut()
            navigate('/')
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  )
}

export function FinancierLayout() {
  const [open, setOpen] = useState(false)
  const { profile } = useAuth()

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="hidden lg:block">
        <div className="sticky top-0 h-screen">
          <SidebarBody />
        </div>
      </aside>
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur lg:px-8">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="lg:hidden">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <SidebarBody onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="truncate text-sm font-medium text-foreground lg:hidden">
            {profile?.display_name || profile?.full_name || 'My financing'}
          </div>
          <div className="hidden text-sm text-muted-foreground lg:block">My financing</div>
        </header>
        <main className="flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
