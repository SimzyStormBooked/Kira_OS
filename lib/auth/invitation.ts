import { safeRedirectPath } from "./security";

/**
 * A welcome link is a shareable address, not a credential. It carries at most an
 * email address to prefill and a destination page. It never carries a password or
 * token, it does not create an account, and it grants no workspace access on its
 * own: the recipient still needs their own confirmed account and a granted role.
 */
export const WELCOME_PATH = "/welcome";

// Conservative addr-spec: no quoted local parts, no bare hosts, no IP literals.
const EMAIL_ADDRESS =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/** Accept only a plain email address, so a shared link cannot reflect arbitrary text. */
export function safeInvitationEmail(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const email = raw.trim();
  if (email.length > 254 || !EMAIL_ADDRESS.test(email)) return null;
  return email;
}

/**
 * A shared address points at a page, never at a caller-supplied query string or
 * fragment: these links travel through text messages, so they carry no payload.
 */
function sharedDestination(next: unknown): string {
  const [pathname] = safeRedirectPath(next).split(/[?#]/, 1);
  return pathname || "/";
}

/** The sign-in page to open from a welcome link, with the email prefilled. */
export function buildSignInPath(email: unknown, next: unknown): string {
  const params = new URLSearchParams();
  const invited = safeInvitationEmail(email);
  const destination = sharedDestination(next);
  if (invited) params.set("email", invited);
  if (destination !== "/") params.set("next", destination);
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

/** The absolute address an owner shares. Invalid parts are dropped, never echoed. */
export function buildWelcomeLink(origin: string, email?: unknown, next?: unknown): string {
  const url = new URL(WELCOME_PATH, origin);
  const invited = safeInvitationEmail(email);
  const destination = sharedDestination(next);
  if (invited) url.searchParams.set("for", invited);
  if (destination !== "/") url.searchParams.set("next", destination);
  return url.toString();
}
