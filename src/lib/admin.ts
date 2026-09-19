export const OFFICIAL_ADMIN_EMAIL = "cadenceonarc@gmail.com";

export function isOfficialAdminEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === OFFICIAL_ADMIN_EMAIL;
}
