# Release Checklist Template

## Release Version

`vX.Y.Z`

## Environment

`Staging | Production`

## Pre-Release

- [ ] Gates 1–3 approved (or Gate 5 for production)
- [ ] Tests passed (unit, integration, security, UAT)
- [ ] Migrations reviewed and backup taken
- [ ] Environment variables verified
- [ ] Service-role key not in frontend
- [ ] Auth redirect URLs updated
- [ ] Monitoring and error reporting active
- [ ] Rollback plan documented

## Release Steps

1. …
2. …

## Post-Release Smoke Test

- [ ] Login (admin / financier)
- [ ] Forced password change path
- [ ] Create/read project
- [ ] Submit commitment
- [ ] Confirm allocation
- [ ] Analytics load

## Sign-Off

| Role | Name | Date | Decision |
| ---- | ---- | ---- | -------- |
| Product | | | |
| Security | | | |
| QA | | | |
| DevOps | | | |
