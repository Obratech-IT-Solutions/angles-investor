import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { FinancierLayout } from '@/components/layout/FinancierLayout'
import { AuthProvider } from '@/contexts/AuthContext'
import {
  ChangePasswordPage,
  ForgotPasswordPage,
  LandingPage,
  LoginPage,
  NotFoundPage,
  UnauthorizedPage,
} from '@/pages/auth/PublicPages'
import { AdminDashboardPage } from '@/pages/admin/DashboardPage'
import {
  AdminFundingPage,
  AdminProjectDetailPage,
  AdminProjectEditPage,
  AdminProjectsPage,
} from '@/pages/admin/ProjectsPages'
import {
  AdminFinanceGroupCreatePage,
  AdminFinanceGroupDetailPage,
} from '@/pages/admin/FinanceGroupPages'
import {
  AdminAuditPage,
  AdminFinancierCreatePage,
  AdminFinancierDetailPage,
  AdminFinanciersPage,
  AdminProfilePage,
} from '@/pages/admin/OtherAdminPages'
import {
  FinancierAnalyticsPage,
  FinancierChangePasswordPage,
  FinancierCommitmentsPage,
  FinancierDashboardPage,
  FinancierProfilePage,
  FinancierProjectDetailPage,
  FinancierProjectsPage,
  FinancierReleasesPage,
} from '@/pages/financier/FinancierPages'
import { FinancierBudgetDetailPage, FinancierBudgetListPage } from '@/pages/financier/BudgetPages'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          <Route element={<ProtectedRoute allowPasswordChange />}>
            <Route path="/change-password" element={<ChangePasswordPage />} />
          </Route>

          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="finance" element={<AdminProjectsPage />} />
              <Route path="finance/new" element={<AdminFinanceGroupCreatePage />} />
              <Route path="finance/group/new" element={<Navigate to="/admin/finance/new" replace />} />
              <Route path="finance/group/:groupId" element={<AdminFinanceGroupDetailPage />} />
              <Route path="finance/:id" element={<AdminProjectDetailPage />} />
              <Route path="finance/:id/edit" element={<AdminProjectEditPage />} />
              <Route path="finance/:id/funding" element={<AdminFundingPage />} />
              <Route path="finance/:id/confirm" element={<Navigate to="../funding" replace />} />
              <Route path="projects/*" element={<Navigate to="/admin/finance" replace />} />
              <Route path="financiers" element={<AdminFinanciersPage />} />
              <Route path="financiers/new" element={<AdminFinancierCreatePage />} />
              <Route path="financiers/:id" element={<AdminFinancierDetailPage />} />
              <Route path="audit" element={<AdminAuditPage />} />
              <Route path="profile" element={<AdminProfilePage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute roles={['financier']} />}>
            <Route path="/app" element={<FinancierLayout />}>
              <Route index element={<FinancierDashboardPage />} />
              <Route path="finance" element={<FinancierProjectsPage />} />
              <Route path="finance/:id" element={<FinancierProjectDetailPage />} />
              <Route path="budget" element={<FinancierBudgetListPage />} />
              <Route path="budget/:projectId" element={<FinancierBudgetDetailPage />} />
              <Route path="projects/*" element={<Navigate to="/app/finance" replace />} />
              <Route path="commitments" element={<FinancierCommitmentsPage />} />
              <Route path="releases" element={<FinancierReleasesPage />} />
              <Route path="analytics" element={<FinancierAnalyticsPage />} />
              <Route path="profile" element={<FinancierProfilePage />} />
              <Route path="change-password" element={<FinancierChangePasswordPage />} />
            </Route>
          </Route>

          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </AuthProvider>
  )
}
