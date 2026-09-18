import { z } from "zod";

export const connectionPlatforms = ["instagram", "facebook", "tiktok", "pinterest", "youtube", "notebooklm"] as const;
export type ConnectionPlatform = (typeof connectionPlatforms)[number];
export const platformLabels: Record<ConnectionPlatform, string> = {
  instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", pinterest: "Pinterest", youtube: "YouTube", notebooklm: "NotebookLM",
};
const hosts: Record<ConnectionPlatform, readonly string[]> = {
  instagram: ["instagram.com", "www.instagram.com"],
  facebook: ["facebook.com", "www.facebook.com"],
  tiktok: ["tiktok.com", "www.tiktok.com"],
  pinterest: ["pinterest.com", "www.pinterest.com"],
  youtube: ["youtube.com", "www.youtube.com"],
  notebooklm: ["notebooklm.google.com", "notebook.google.com"],
};
const paths: Record<ConnectionPlatform, RegExp> = {
  instagram: /^\/[A-Za-z0-9._]{1,30}\/?$/,
  facebook: /^\/(?:[A-Za-z0-9.]{1,100}|people\/[A-Za-z0-9.-]{1,100}\/[0-9]{1,30})\/?$/,
  tiktok: /^\/@[A-Za-z0-9._]{1,100}\/?$/,
  pinterest: /^\/[A-Za-z0-9_]{1,100}\/?$/,
  youtube: /^\/(?:@[A-Za-z0-9._-]{1,100}|(?:channel|c|user)\/[A-Za-z0-9._-]{1,100})\/?$/,
  notebooklm: /^\/notebook\/[A-Za-z0-9_-]{1,100}\/?$/,
};
const reservedPaths = new Set(["/accounts", "/login", "/logout", "/explore", "/direct", "/reel", "/reels", "/p", "/l.php", "/dialog", "/oauth", "/share", "/sharer.php", "/settings", "/help", "/search", "/watch"]);

/** A saved shortcut, never a request target or proof of account ownership. */
export function normalizeConnectionUrl(platform: ConnectionPlatform, value: string): string {
  const raw = value.trim();
  if (!raw || raw.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(raw)) throw new Error("Use a full HTTPS profile or notebook link.");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Use a full HTTPS profile or notebook link."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !hosts[platform].includes(url.hostname)) {
    throw new Error(`Use an HTTPS link on ${hosts[platform][0]}.`);
  }
  if (platform === "facebook" && url.pathname === "/profile.php") {
    const id = url.searchParams.get("id");
    if (!id || !/^[0-9]{1,30}$/.test(id)) throw new Error("This Facebook profile link needs its numeric id.");
    return `https://www.facebook.com/profile.php?id=${id}`;
  }
  const path = url.pathname.replace(/\/$/, "");
  if (!paths[platform].test(url.pathname) || reservedPaths.has(path.toLowerCase())) {
    throw new Error(platform === "notebooklm" ? "Open a notebook and copy its notebook link." : "Use the account’s profile link, rather than a post or sign-in page.");
  }
  const canonicalHost = platform === "notebooklm" ? url.hostname : `www.${platform}.com`;
  return `https://${canonicalHost}${path}`;
}

export const connectionInputSchema = z.object({
  platform: z.enum(connectionPlatforms),
  label: z.string().trim().min(1).max(100),
  url: z.string().trim().min(1).max(2048),
}).strict().transform((value, context) => {
  try { return { ...value, url: normalizeConnectionUrl(value.platform, value.url) }; }
  catch (error) {
    context.addIssue({ code: "custom", path: ["url"], message: error instanceof Error ? error.message : "Check this profile link." });
    return z.NEVER;
  }
});

export const connectionLinkSchema = z.object({
  id: z.uuid(), author_id: z.uuid(), platform: z.enum(connectionPlatforms), label: z.string().max(100), url: z.string(),
  created_by: z.uuid(), created_at: z.string(), data_origin: z.literal("manual"),
}).transform((value, context) => {
  try { return { ...value, url: normalizeConnectionUrl(value.platform, value.url) }; }
  catch { context.addIssue({ code: "custom", message: "A saved link has an invalid address." }); return z.NEVER; }
});
export type ConnectionLink = z.infer<typeof connectionLinkSchema>;
export type ConnectionInput = z.infer<typeof connectionInputSchema>;
