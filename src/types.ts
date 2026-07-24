export type UserRole = 'admin' | 'financier'
export type AccountStatus = 'active' | 'inactive' | 'locked'

export type ProjectStatus =
  | 'draft'
  | 'open_for_funding'
  | 'partially_funded'
  | 'fully_funded'
  | 'active'
  | 'released'
  | 'completed'
  | 'overdue'
  | 'cancelled'

export type CommitmentStatus =
  | 'invited'
  | 'pending'
  | 'submitted'
  | 'confirmed'
  | 'rejected'
  | 'withdrawn'

export type ReleaseStatus = 'tba' | 'scheduled' | 'released'

export type LenderPromiseType = 'pct_of_loan' | 'pct_of_my_profit' | 'fixed_profit' | 'manual'

export interface Profile {
  id: string
  username: string
  full_name: string
  display_name?: string | null
  email: string | null
  contact_number: string | null
  role: UserRole
  account_status: AccountStatus
  must_change_password: boolean
  locked_until: string | null
  failed_login_count: number
  created_at: string
  updated_at: string
  deactivated_at: string | null
}

export interface FinanceGroup {
  id: string
  name: string
  financing_date: string
  status: ProjectStatus | string
  description: string | null
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  name: string
  financing_date: string
  duration_days: number
  capital_required: number | string
  expected_profit: number | string
  max_financiers: number
  release_date: string | null
  calculated_expected_release: string | null
  actual_release_date: string | null
  description: string | null
  notes: string | null
  status: ProjectStatus
  created_by: string
  created_at: string
  updated_at: string
  group_id?: string | null
  invite_financier_ids?: string[] | null
  finance_groups?: Pick<FinanceGroup, 'id' | 'name' | 'financing_date'> | null
}

export type FinanceGroupLineSummary = {
  project_id: string
  name: string
  status: ProjectStatus | string
  capital_required: number | string
  expected_profit: number | string
  duration_days: number
  financing_date: string
  calculated_expected_release: string | null
  confirmed_total: number | string
  my_confirmed: number | string
  my_suggested?: number | string
  my_status: CommitmentStatus | string | null
  project_financier_id: string | null
}

export type FinanceGroupSummary = {
  group_id: string
  name: string
  financing_date: string
  status: string
  description: string | null
  notes: string | null
  group_budget: number | string
  group_profit: number | string
  group_confirmed: number | string
  group_remaining: number | string
  my_confirmed: number | string
  my_suggested?: number | string
  lines: FinanceGroupLineSummary[]
}

export type AdminCreateFinanceGroupResult = {
  group_id: string | null
  project_ids: string[]
  name: string
}

export type GroupCommitmentConfirmResult = {
  group_id: string
  total_amount: number | string
  group_budget: number | string
  group_profit: number | string
  budget_pct: number | string
  expected_profit_total: number | string
  splits: Array<{
    project_id: string
    project_name: string
    confirmed_amount: number | string
    weight_ratio: number | string
    expected_profit_share: number | string
    project_financier_id: string
  }>
}

export interface ProjectFinancier {
  id: string
  project_id: string
  financier_id: string
  initial_suggested_amount: number | string
  initial_suggested_percentage: number | string
  current_suggested_amount: number | string
  willing_amount: number | string | null
  confirmed_amount: number | string | null
  confirmed_percentage: number | string | null
  commitment_status: CommitmentStatus
  submitted_at: string | null
  confirmed_at: string | null
  confirmed_by: string | null
  reconciliation_adjustment: number | string
  created_at: string
  updated_at: string
  profiles?: Pick<Profile, 'id' | 'username' | 'full_name' | 'display_name' | 'email' | 'contact_number' | 'account_status'> | null
  projects?: Pick<
    Project,
    | 'id'
    | 'name'
    | 'status'
    | 'capital_required'
    | 'expected_profit'
    | 'release_date'
    | 'financing_date'
    | 'duration_days'
    | 'group_id'
    | 'calculated_expected_release'
  > | null
}

export interface ProjectRelease {
  id: string
  project_id: string
  scheduled_date: string | null
  actual_date: string | null
  release_status: ReleaseStatus
  capital_released: number | string
  profit_released: number | string
  recorded_by: string | null
  notes: string | null
  created_at: string
  projects?: Pick<Project, 'id' | 'name' | 'status'> | null
}

export interface FinancierReleasePayment {
  id: string
  release_id: string
  project_financier_id: string
  capital_amount: number | string
  profit_amount: number | string
  total_amount: number | string
  received_at: string | null
  created_at: string
  project_releases?: ProjectRelease | null
  project_financiers?: ProjectFinancier | null
}

export interface FinancierBudgetPool {
  id: string
  financier_id: string
  color_index: number
  created_at: string
  updated_at: string
}

export interface FinancierProjectBudget {
  id: string
  financier_id: string
  project_id: string
  own_capital: number | string
  manual_profit: number | string | null
  notes: string | null
  pool_id: string | null
  created_at: string
  updated_at: string
  financier_project_lenders?: FinancierProjectLender[]
  financier_budget_pools?: Pick<FinancierBudgetPool, 'id' | 'color_index'> | null
  projects?: Pick<Project, 'id' | 'name' | 'status' | 'capital_required' | 'expected_profit' | 'financing_date'> | null
}

export interface FinancierProjectLender {
  id: string
  budget_id: string
  lender_name: string
  borrowed_amount: number | string
  promise_type: LenderPromiseType
  promise_value: number | string
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  actor_id: string | null
  entity_type: string
  entity_id: string | null
  action: string
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  created_at: string
  profiles?: Pick<Profile, 'id' | 'username' | 'full_name'> | null
}

export interface Notification {
  id: string
  profile_id: string
  title: string
  body: string
  is_read: boolean
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & Pick<Profile, 'id' | 'username' | 'full_name' | 'role'>; Update: Partial<Profile> }
      finance_groups: {
        Row: FinanceGroup
        Insert: Partial<FinanceGroup> & Pick<FinanceGroup, 'name' | 'financing_date' | 'created_by'>
        Update: Partial<FinanceGroup>
      }
      projects: { Row: Project; Insert: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'calculated_expected_release' | 'actual_release_date'> & { id?: string }; Update: Partial<Project> }
      project_financiers: { Row: ProjectFinancier; Insert: Partial<ProjectFinancier> & Pick<ProjectFinancier, 'project_id' | 'financier_id'>; Update: Partial<ProjectFinancier> }
      project_releases: { Row: ProjectRelease; Insert: Partial<ProjectRelease> & Pick<ProjectRelease, 'project_id'>; Update: Partial<ProjectRelease> }
      financier_release_payments: { Row: FinancierReleasePayment; Insert: Partial<FinancierReleasePayment> & Pick<FinancierReleasePayment, 'release_id' | 'project_financier_id'>; Update: Partial<FinancierReleasePayment> }
      financier_budget_pools: {
        Row: FinancierBudgetPool
        Insert: Partial<FinancierBudgetPool> & Pick<FinancierBudgetPool, 'financier_id'>
        Update: Partial<FinancierBudgetPool>
      }
      financier_project_budgets: {
        Row: FinancierProjectBudget
        Insert: Partial<FinancierProjectBudget> & Pick<FinancierProjectBudget, 'financier_id' | 'project_id'>
        Update: Partial<FinancierProjectBudget>
      }
      financier_project_lenders: {
        Row: FinancierProjectLender
        Insert: Partial<FinancierProjectLender> & Pick<FinancierProjectLender, 'budget_id' | 'lender_name'>
        Update: Partial<FinancierProjectLender>
      }
      audit_logs: { Row: AuditLog; Insert: Partial<AuditLog> & Pick<AuditLog, 'entity_type' | 'action'>; Update: Partial<AuditLog> }
      notifications: { Row: Notification; Insert: Partial<Notification> & Pick<Notification, 'profile_id' | 'title' | 'body'>; Update: Partial<Notification> }
    }
    Views: Record<string, never>
    Functions: {
      complete_forced_password_change: { Args: Record<string, never>; Returns: Profile }
      confirm_allocations: { Args: { p_project_id: string; p_confirmations: { id: string; confirmed_amount: number }[] }; Returns: Project }
      admin_set_financier_commitments: {
        Args: { p_project_id: string; p_allocations: { id: string; confirmed_amount: number }[] }
        Returns: Project
      }
      invite_financiers: { Args: { p_project_id: string; p_financier_ids: string[] }; Returns: ProjectFinancier[] }
      admin_create_finance_group: {
        Args: {
          p_financing_date: string
          p_lines: Array<{
            name: string
            capital_required: number
            expected_profit: number
            duration_days: number
          }>
          p_financier_ids?: string[] | null
          p_name?: string | null
          p_status?: string | null
          p_description?: string | null
          p_notes?: string | null
        }
        Returns: AdminCreateFinanceGroupResult
      }
      financier_confirm_commitment: {
        Args: { p_project_financier_id: string; p_amount: number }
        Returns: ProjectFinancier
      }
      financier_confirm_group_commitment: {
        Args: { p_group_id: string; p_total_amount: number }
        Returns: GroupCommitmentConfirmResult
      }
      financier_reject_group_commitment: {
        Args: { p_group_id: string }
        Returns: { group_id: string; rejected_lines: number }
      }
      get_finance_group_summary: {
        Args: { p_group_id: string }
        Returns: FinanceGroupSummary
      }
      record_project_release: {
        Args: {
          p_project_id: string
          p_actual_date: string
          p_capital_released: number
          p_profit_released: number
          p_notes?: string | null
        }
        Returns: ProjectRelease
      }
      submit_willing_amount: { Args: { p_project_financier_id: string; p_willing_amount: number }; Returns: ProjectFinancier }
      financier_confirm_release_received: { Args: { p_payment_id: string }; Returns: FinancierReleasePayment }
      current_profile: { Args: Record<string, never>; Returns: Profile }
      is_admin: { Args: Record<string, never>; Returns: boolean }
    }
    Enums: {
      lender_promise_type: LenderPromiseType
    }
  }
}

export const LENDER_PROMISE_TYPE_LABELS: Record<LenderPromiseType, string> = {
  pct_of_loan: '% of loan',
  pct_of_my_profit: '% of my profit',
  fixed_profit: 'Fixed profit (₱)',
  manual: 'Manual (notes only)',
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: 'Draft',
  open_for_funding: 'Open for Funding',
  partially_funded: 'Partially Funded',
  fully_funded: 'Fully Funded',
  active: 'Active',
  released: 'Released',
  completed: 'Completed',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
}

export const COMMITMENT_STATUS_LABELS: Record<CommitmentStatus, string> = {
  invited: 'Invited',
  pending: 'Pending',
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

export const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = {
  tba: 'TBA',
  scheduled: 'Scheduled',
  released: 'Released',
}
