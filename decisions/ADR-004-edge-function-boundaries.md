# ADR-004: Edge Function Boundaries

## Status

`Proposed`

## Date

2026-07-23

## Context

Administrators must create Auth users, reset passwords, and revoke sessions. Service-role keys must never ship to Vercel frontend.

## Decision

Use Supabase Edge Functions (service role, JWT-verified caller) for:

1. `admin-create-financier` — create Auth user + profile with temp password `0000`
2. `admin-reset-password` — set `0000`, force change, revoke sessions
3. `admin-set-account-status` — activate/deactivate/unlock (if not fully doable under RLS)
4. `confirm-allocations` — transactional confirmation of project financing (if RPC alone insufficient for authz orchestration)
5. `record-release` — privileged release posting with audit (optional if strict RPC + admin RLS is enough)

Ordinary reads/writes (projects list, submit willing amount) use client → PostgREST with RLS.

## Consequences

### Positive

- Service role stays server-side
- Clear privileged vs public API surface

### Negative

- Extra deployables and authz checks in functions

## Alternatives Considered

1. All privileged ops via Postgres SECURITY DEFINER only — possible for some; Auth Admin API still needs Edge Function
2. Separate Node API on Vercel serverless — deferred

## Related Documents

- [docs/10-system-architecture.md](../docs/10-system-architecture.md)
- [docs/13-authentication-design.md](../docs/13-authentication-design.md)
