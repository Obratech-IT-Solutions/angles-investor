# Dependency Map

```mermaid
flowchart TD
  Gate1[Gate1_MVP] --> Gate2[Gate2_UX]
  Gate2 --> Gate3[Gate3_Architecture]
  Gate3 --> Gate4[Gate4_ImplAuth]
  Gate4 --> P3[Phase3_Auth]
  P3 --> P4[Phase4_ProjectsProfiles]
  P4 --> P5[Phase5_FlexibleFunding]
  P5 --> P6[Phase6_ReleaseAnalytics]
  P6 --> P7[Phase7_Hardening]
  P7 --> P8[Phase8_Deploy]
  P8 --> Gate5[Gate5_Production]
```

## Story dependencies

| Story | Depends on |
| ----- | ---------- |
| US-002 Forced password change | Auth project setup (Phase 3) |
| US-001 Create financier | US-002 patterns; Edge Function create-user |
| US-003 Create project | Admin auth |
| US-004 Invite | US-001, US-003 |
| US-005 Willing amount | US-004 |
| US-006 Confirm allocations | US-005 |
| US-007 Release date | US-003 |
| US-008 Record release | US-006, US-007 |
| US-009 / US-010 Analytics | US-006 (confirmed amounts) |
| US-011 / US-012 Account ops | US-001 |
| US-013 Overdue display | US-007 |

## Technical dependencies

- Vercel SPA ↔ Supabase Auth redirect URL allow-list
- Edge Functions ↔ service role secrets (never in `VITE_*`)
- Confirmation RPC ↔ overfunding check constraints
- Analytics views ↔ confirmed + release tables
