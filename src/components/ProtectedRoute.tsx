import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth, homePathForRole } from '@/contexts/AuthContext'
import type { UserRole } from '@/types'
import { Skeleton } from '@/components/ui/skeleton'

interface ProtectedRouteProps {
  roles?: UserRole[]
  allowPasswordChange?: boolean
}

export function ProtectedRoute({ roles, allowPasswordChange = false }: ProtectedRouteProps) {
  const { loading, session, profile } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="w-full max-w-md space-y-3">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    )
  }

  if (!session || !profile) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />
  }

  if (profile.must_change_password && !allowPasswordChange && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  if (!profile.must_change_password && location.pathname === '/change-password' && !allowPasswordChange) {
    return <Navigate to={homePathForRole(profile.role)} replace />
  }

  if (roles && !roles.includes(profile.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <Outlet />
}
