# FundTrack — Security Plan

## Document Control

| Field | Value |
| --- | --- |
| Document | `docs/14-security-plan.md` |
| Owner | ObraTech |
| Version | 0.1 |
| Last Updated | 2026-07-23 |
| Approval Status | **READY FOR REVIEW** |

## 1. Threat Model (summary)

| Threat | Example | Mitigation |
| --- | --- | --- |
| Broken access control | Financier reads peer amounts | RLS + UI hiding; server denies |
| Privilege escalation | Financier calls admin Edge Function | JWT role check in every function |
| Financial tampering | Client sends inflated confirmed amount | Only admin confirm RPC; ignore client-calculated profit |
| Overfunding race | Two confirms exceed capital | Transaction + row lock |
| IDOR | Swap project/financier UUIDs | RLS by auth.uid(); admin checks |
| XSS | Injected project notes | React escaping; sanitize; CSP headers on Vercel |
| Secret leakage | Service role in frontend | Never ship service role; `VITE_*` publishable only |
| Temp password abuse | Login with 0000 before change | Forced change gate; lockouts; audit |
| Preview env risk | Vercel preview against prod DB | Separate staging Supabase; restrict preview env |
| Session reuse after reset | Old refresh token | Revoke sessions on reset/deactivate |

## 2. Authentication and Password Security

- Supabase Auth hashing only; no plaintext passwords in DB/app logs.
- Temp password `0000` preserved for MVP with mitigations in [docs/13-authentication-design.md](13-authentication-design.md).
- Post-MVP: random temporary passwords recommended.
- Failed login monitoring and lock/unlock by admin.

## 3. Authorization

- Roles: admin, financier (viewer deferred).
- Matrix: [docs/04-user-roles-and-permissions.md](04-user-roles-and-permissions.md).
- Defense in depth: route guards + RLS + Edge Function checks.

## 4. Service Role and Edge Functions

- Service role only in Edge Function secrets.
- Functions verify `Authorization` JWT and `profiles.role`.
- Deny by default; least privilege payloads.

## 5. Input Validation

- Zod (or equivalent) on client for UX; identical rules on RPC/Edge.
- Numeric ranges, status enums, UUID formats.
- Parameterized queries / Supabase client only — no string-built SQL from user input.

## 6. CSRF / Browser Storage

- Prefer Supabase-recommended auth storage for SPA; document risk if localStorage used.
- SameSite cookies if cookie-based session adopted later.
- Vercel security headers: CSP, X-Frame-Options, Referrer-Policy (configure at implementation).

## 7. Audit Integrity

- Audit logs insert-only for authenticated clients; no update/delete policies for non-service roles.
- Capture before/after JSON for confirmed amount changes.

## 8. Logging Hygiene

- Never log passwords, tokens, or full PATs.
- Redact Authorization headers in any custom logs.

## 9. Rate Limiting

- Rely on Supabase Auth rate limits where available; add Edge Function rate checks for create/reset if needed.
- Account lockout after repeated failures.

## 10. Production Security Checklist (pre-launch)

- [ ] RLS enabled on all business tables
- [ ] No service role in Vercel frontend env
- [ ] Auth redirect allow-list correct
- [ ] Preview deployments not pointed at production DB
- [ ] Security tests from [docs/16-testing-plan.md](16-testing-plan.md) passed
- [ ] Backup tested

## 11. Related Documents

- [docs/15-row-level-security-plan.md](15-row-level-security-plan.md)
- [docs/20-production-readiness.md](20-production-readiness.md)
