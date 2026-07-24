# ADR-002: Username Authentication Model

## Status

`Proposed`

## Date

2026-07-23

## Context

Business requires financier login by **username** and a temporary password `0000` with forced change. Supabase Auth is email/password oriented.

## Decision

- Store `username` (unique, case-normalized) on `profiles`.
- Create Auth users via Edge Function (service role) with synthetic email: `{username}@users.fundtrack.local`.
- Login UI collects username + password; client maps username → synthetic email before `signInWithPassword`.
- Optional real email on profile is for contact only in MVP (not Auth identity unless later approved).
- `must_change_password` enforced in profile + protected route gate.
- Admin password reset sets password to `0000`, sets `must_change_password = true`, and revokes sessions.

## Consequences

### Positive

- Matches business login UX
- Keeps passwords in Supabase Auth (hashed), never in app tables

### Negative

- Synthetic emails cannot receive real email resets without a later design change
- Username→email mapping must be consistent and documented

### Neutral

- Forgot-password for MVP may be admin-assisted reset only

## Alternatives Considered

1. True email login — rejected for MVP (business wants username)
2. Custom JWT auth — rejected (security and maintenance risk)

## Related Documents

- [docs/13-authentication-design.md](../docs/13-authentication-design.md)
- [docs/14-security-plan.md](../docs/14-security-plan.md)
