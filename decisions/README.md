# Architectural Decision Records

This folder records significant technical and product architecture decisions for **FundTrack**.

## How to use

1. Copy [ADR-000-template.md](ADR-000-template.md).
2. Number sequentially (`ADR-001`, `ADR-002`, …).
3. Set status to `Proposed` until Architecture Gate (Gate 3) approval.
4. Link from [docs/10-system-architecture.md](../docs/10-system-architecture.md) and the traceability matrix.

## Index

| ID | Title | Status |
| ---- | ----- | ------ |
| [ADR-001](ADR-001-technology-stack.md) | Technology stack (React/Vite + Supabase + Vercel) | Proposed |
| [ADR-002](ADR-002-username-auth-model.md) | Username login via synthetic Auth email | Proposed |
| [ADR-003](ADR-003-money-precision.md) | NUMERIC money precision and RPC calculations | Proposed |
| [ADR-004](ADR-004-edge-function-boundaries.md) | Edge Function boundaries for privileged ops | Proposed |
| [ADR-005](ADR-005-entity-consolidation.md) | Commitment/confirmation entity consolidation | Proposed |
| [ADR-006](ADR-006-shadcn-ui.md) | shadcn/ui + Lucide + Recharts design system | Proposed |
