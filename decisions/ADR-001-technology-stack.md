# ADR-001: Technology Stack

## Status

`Proposed`

## Date

2026-07-23

## Context

FundTrack must replace spreadsheet-based project financing tracking with a secure private web application. The owner requires a React frontend hosted on Vercel and Supabase for authentication, PostgreSQL, RLS, and privileged server-side operations.

## Decision

Use:

- **Frontend:** React + Vite + TypeScript + Tailwind CSS + **shadcn/ui** (Lucide, Recharts charts), deployed as a SPA on **Vercel**
- **Backend:** Supabase Auth, PostgreSQL, Row Level Security, Edge Functions for privileged operations
- **Dev database target:** Supabase project `jxwvvytzkvtjgtefmxkk`
- **Timezone / currency defaults:** Asia/Manila, PHP with `NUMERIC(18,2)`
- **UI system detail:** [ADR-006](ADR-006-shadcn-ui.md), [docs/28-ui-design-system.md](../docs/28-ui-design-system.md)

## Consequences

### Positive

- Fast SPA delivery on Vercel with preview deployments
- Managed Auth + Postgres + RLS reduces custom backend surface
- Clear secret boundary: only publishable keys in `VITE_*` env vars

### Negative

- SPA auth redirects and Vercel preview URLs need careful Supabase allow-list management
- Privileged workflows require Edge Functions (not pure client CRUD)

### Neutral

- Viewer/Auditor role deferred; stack still supports it later via profiles.role

## Alternatives Considered

1. Next.js full-stack on Vercel — deferred; SPA + Edge Functions meets MVP with less framework coupling
2. Custom Node API — rejected for MVP to reduce ops burden

## Related Documents

- [docs/10-system-architecture.md](../docs/10-system-architecture.md)
- [docs/17-deployment-plan.md](../docs/17-deployment-plan.md)
