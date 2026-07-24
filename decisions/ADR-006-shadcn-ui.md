# ADR-006: shadcn/ui Design System

## Status

`Proposed`

## Date

2026-07-23

## Context

FundTrack needs a consistent, accessible component set for admin and financier consoles (forms, tables, dialogs, charts) on React + Vite + Tailwind, deployable to Vercel. Building primitives from scratch would delay MVP.

## Decision

Adopt **shadcn/ui** (copy-in components under future `components/ui/`), **Lucide** icons, and **Recharts** via shadcn chart patterns, with **Sonner** for toasts. Visual tokens: deep navy primary, white/light-gray surfaces, green/amber/red semantic statuses as specified in [docs/28-ui-design-system.md](../docs/28-ui-design-system.md).

Do **not** scaffold or install packages until Gate 4 implementation authorization.

## Consequences

### Positive

- Fast, accessible Radix-based primitives
- Components owned in-repo (customizable)
- Fits Tailwind + Vercel SPA

### Negative

- Need discipline to avoid one-off divergent styles
- Chart library bundle size must be monitored

## Alternatives Considered

1. MUI / Chakra — heavier opinionated theming
2. Fully custom components — too slow for MVP

## Related Documents

- [docs/28-ui-design-system.md](../docs/28-ui-design-system.md)
- [ADR-001](ADR-001-technology-stack.md)
- [agents/04-frontend-agent.md](../agents/04-frontend-agent.md)
