const AUTH_EMAIL_DOMAIN = 'users.fundtrack.local'

export function toAuthEmail(username: string): string {
  const normalized = username.trim().toLowerCase()
  return `${normalized}@${AUTH_EMAIL_DOMAIN}`
}

export function usernameFromAuthEmail(email: string | undefined | null): string | null {
  if (!email) return null
  const suffix = `@${AUTH_EMAIL_DOMAIN}`
  if (!email.toLowerCase().endsWith(suffix)) return null
  return email.slice(0, -suffix.length)
}

export const TEMP_PASSWORD = '0000'
export const MIN_PASSWORD_LENGTH = 8
