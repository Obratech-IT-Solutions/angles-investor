# FundTrack — UI Design System

## Document Control

| Field | Value |
| --- | --- |
| Document | `docs/28-ui-design-system.md` |
| Owner | ObraTech / Frontend Agent |
| Version | 0.1 |
| Last Updated | 2026-07-23 |
| Approval Status | **READY FOR REVIEW** |

**Implementation note:** This document specifies the design system only. Do **not** install shadcn/ui, create `components/ui/`, or add `package.json` until Gate 4 authorization.

## 1. UI Stack

| Layer | Choice |
| --- | --- |
| Framework | React + Vite + TypeScript |
| Styling | Tailwind CSS |
| Components | **shadcn/ui** (Radix primitives + Tailwind) |
| Icons | Lucide |
| Charts | Recharts via shadcn chart patterns |
| Toasts | Sonner (shadcn toast pattern) |
| Future path | `components/ui/*` for primitives; feature components outside |

Related ADR: [ADR-006](../decisions/ADR-006-shadcn-ui.md).

## 2. Design Tokens

### 2.1 Color

| Token role | Direction | Usage |
| --- | --- | --- |
| Primary | Deep navy | Brand, primary buttons, sidebar active, key headings |
| Background | White / light gray | App canvas, cards on subtle gray panels |
| Foreground | Near-black navy | Body text |
| Muted | Cool gray | Secondary text, borders |
| Success / positive | Green | Completed, fully funded, positive profit |
| Warning | Amber | Pending, approaching release, attention |
| Destructive / overdue | Red | Overdue, rejected, destructive actions, errors |
| Ring / focus | Navy-tinted focus ring | Keyboard focus visibility |

Avoid purple-gradient AI clichés; keep a clean finance console look: navy + neutral surfaces + semantic status colors.

### 2.2 Typography

| Role | Guidance |
| --- | --- |
| Display / page title | Semibold, larger tracking-tight |
| Section title | Semibold |
| Body | Regular, readable 14–16px equivalent |
| Tabular nums | Use tabular lining for money columns |
| Labels | Medium, muted when secondary |

Prefer a distinctive but professional font pair via Tailwind theme (not default Inter-only if a licensed/open alternative is chosen at scaffold — document final choice in ADR at implementation). Until then, specify semantic sizes: `text-xs` … `text-3xl` scale consistently.

### 2.3 Spacing and radius

- Base spacing scale: Tailwind 4/8 rhythm (2, 4, 6, 8, 12, 16…).
- Card padding: comfortable (p-4 / p-6).
- Radius: slightly rounded controls (shadcn default radius token) — not pill-heavy chrome.
- Density: dashboards denser than marketing landing.

## 3. Status Colors Mapping

| Domain status | Badge variant |
| --- | --- |
| Draft | Muted / outline |
| Open for Funding | Primary/navy outline |
| Partially Funded | Amber |
| Fully Funded | Green |
| Active | Navy solid soft |
| Released | Green |
| Completed | Green |
| Overdue | Red |
| Cancelled | Muted |
| Commitment Invited/Pending | Amber |
| Submitted | Navy |
| Confirmed | Green |
| Rejected / Withdrawn | Red / muted |

## 4. Component Inventory (planned `components/ui/`)

Document-only inventory — names align with shadcn conventions:

| Component | Purpose in FundTrack |
| --- | --- |
| Button | Primary/secondary/destructive actions |
| Card | KPI tiles, detail sections (interaction containers OK) |
| Form | React Hook Form + zod resolvers (pattern) |
| Input | Text/number fields |
| Password input | Login / change password (show-hide) |
| Textarea | Notes, description |
| Label | Accessible field labels |
| Checkbox | Filters, confirm acknowledgements |
| Select | Status filters, enums |
| Date picker | Financing date, release date |
| Data table | Projects, financiers, audit, commitments |
| Dialog | Confirm allocation, reset password |
| Alert / AlertDialog | Destructive confirms |
| Dropdown menu | Row actions |
| Tabs | Project detail sections |
| Badge | Status chips |
| Progress | Funding progress |
| Sidebar | Admin/financier shell (desktop) |
| Sheet | Mobile nav drawer |
| Breadcrumb | Hierarchy under shell |
| Toast / Sonner | Success/error feedback |
| Skeleton | Loading placeholders |
| Empty state | No projects / no data |
| Chart | Dashboards (Recharts wrappers) |
| Avatar | Financier initials |
| Tooltip | Metric definitions |
| Spinner | Inline busy state |
| Separator | Section splits |
| Scroll area | Long tables/panels |

## 5. Page → Component Mapping

See also [docs/09-page-map-and-user-flows.md](09-page-map-and-user-flows.md).

| Page | Key UI building blocks |
| --- | --- |
| Landing | Button, Card |
| Logins | Form, Input, Password input, Button, Label, Alert |
| Force password change | Form, Password input, AlertDialog rules via Alert |
| Admin dashboard | Sidebar, Breadcrumb, Card, Chart, Badge, Skeleton |
| Project list | DataTable, Badge, Button, Select, Input (search) |
| Project create/edit | Form, Input, DatePicker, Textarea, Select, Button |
| Project details | Tabs, Card, Progress, DataTable, Badge |
| Funding / confirm | DataTable, Progress, Dialog, AlertDialog, Input |
| Financier CRUD | DataTable, Form, Avatar, Dialog |
| Release management | DataTable, DatePicker, Dialog, Badge |
| Audit log | DataTable, Select |
| Financier dashboard | Card, Chart, Badge, Skeleton |
| Submit willing | Form, Input, Alert, Progress |
| Analytics pages | Chart, Card, Tooltip |

## 6. Layout and Responsive Behavior

- **Desktop:** Persistent Sidebar + main canvas + Breadcrumbs.
- **Mobile:** Sidebar content moves into **Sheet** (drawer); tables scroll horizontally; sticky primary CTA where needed.
- Landing is public marketing-lite; app shells are utilitarian finance UI (cards allowed for KPIs and forms).

## 7. Data Tables

- Sort/filter on key columns (status, dates, amounts).
- Money columns right-aligned, tabular figures, 2 decimal places, `₱` formatting.
- Row actions in DropdownMenu.
- EmptyState when zero rows.
- Skeleton rows on first load.

## 8. Forms and Validation

- Inline field errors under inputs; summary Alert on submit failure.
- Disable submit while pending; show Spinner on button.
- Numeric capital fields reject negative values client-side; server revalidates.
- Password fields never echo temp password in UI copy beyond instructional text.

## 9. Loading / Error / Empty

| State | Pattern |
| --- | --- |
| Loading | Skeleton for panels; Spinner for actions |
| Error | Alert + Toast; no stack traces |
| Empty | EmptyState with optional CTA |

## 10. Accessibility

- Focus visible rings on all interactive elements.
- Dialog/Sheet focus trap; Esc closes non-destructive.
- Labels tied to inputs; errors announced (`aria-invalid`, `aria-describedby`).
- Color is not the only status signal — Badge text included.
- Minimum contrast for navy on white and status colors on backgrounds.

## 11. Dashboard Chart Specs (no code)

All charts: navy/gray palette with green/amber/red accents sparingly; tooltips show formatted PHP; legends clear; responsive containers.

| Chart | Audience | Type | Encoding |
| --- | --- | --- | --- |
| Capital by financier | Admin | Horizontal bar | Financier name vs total confirmed capital |
| Expected profit by financier | Admin | Horizontal bar | Expected profit share sum |
| Monthly financing history | Admin / Financier | Vertical bar or area | Month vs capital confirmed/financed |
| Monthly realized profit | Admin / Financier | Bar | Month vs profit released |
| Funding by project | Admin | Stacked bar or bar | Project vs confirmed capital (optionally vs target marker) |
| Active vs completed | Admin | Donut / pie | Count or capital by status group |
| Upcoming release amounts | Admin / Financier | Bar or timeline list+bar | Next N releases by amount |

Financier charts must include **only that financier’s data**.

## 12. Motion

- Subtle sidebar/sheet transitions; toast enter/exit.
- Avoid decorative motion on financial tables.
- Prefer 2–3 purposeful motions in shell, not chart animation noise.

## 13. Ownership

Frontend Agent owns this document and future `components/ui` conventions. Changes that alter brand tokens require Product + Architecture acknowledgement.

## 14. Related Documents

- [docs/09-page-map-and-user-flows.md](09-page-map-and-user-flows.md)
- [docs/03-mvp-scope.md](03-mvp-scope.md)
- [docs/10-system-architecture.md](10-system-architecture.md)
- [agents/04-frontend-agent.md](../agents/04-frontend-agent.md)
