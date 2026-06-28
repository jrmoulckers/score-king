/**
 * Public client ID of the shared "Score King" Microsoft (Azure AD) app registration.
 *
 * This is NOT a secret. For browser / single-page apps the client ID is public by
 * design — security comes from PKCE plus the redirect-URI allowlist on the app
 * registration, so the value is safe to commit to a public repo. Each user signs in
 * with their own Microsoft account and backs up to their own OneDrive.
 *
 * Fill in BUILT_IN_ONEDRIVE_CLIENT_ID below (or set VITE_ONEDRIVE_CLIENT_ID at build
 * time). When empty, the app falls back to a per-user client ID entered in Settings.
 */
const BUILT_IN_ONEDRIVE_CLIENT_ID = '34a70d1d-a03d-433e-b1de-4a54b16025d5';

export const ONEDRIVE_CLIENT_ID = (
  import.meta.env.VITE_ONEDRIVE_CLIENT_ID ?? BUILT_IN_ONEDRIVE_CLIENT_ID
).trim();
