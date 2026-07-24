# FundTrack — Glossary

| Term | Definition |
| --- | --- |
| FundTrack | Project Financing and Profit Monitoring System by ObraTech |
| Administrator | User with `admin` role; full operational control |
| Financier | Investor user who commits capital to projects |
| Capital required | Total funding target for a project |
| Suggested amount | Initial or revised recommended contribution |
| Willing amount | Amount a financier offers before confirmation |
| Confirmed amount | Admin-approved contribution used for profit math |
| Funding gap | Capital required minus total confirmed |
| Investor percentage | Confirmed amount ÷ capital required |
| Expected profit share | Expected profit × investor percentage |
| Total receivable | Confirmed amount + expected profit share |
| Release date | Date capital/profit is expected or recorded |
| TBA | Release date not announced |
| Overdue | Release date passed without completion |
| Temporary password | MVP initial password `0000` |
| must_change_password | Flag blocking app until password changed |
| RLS | Row Level Security in PostgreSQL/Supabase |
| Edge Function | Privileged Supabase serverless function |
| Synthetic email | `{username}@users.fundtrack.local` Auth identity |
| Audit log | Immutable record of significant data changes |
| shadcn/ui | Component system on Radix + Tailwind for the SPA |

Related: [docs/07-financial-calculations.md](07-financial-calculations.md)
