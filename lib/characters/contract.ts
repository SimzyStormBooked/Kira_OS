export const PORTRAIT_MAX_BYTES = 8 * 1024 * 1024;
export const PORTRAIT_MIME_TYPES = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;
export type PortraitFormat = keyof typeof PORTRAIT_MIME_TYPES;
export const PORTRAIT_USAGE_PERMISSIONS = ["private_reference_only", "promotional_approved"] as const;
export type PortraitUsagePermission = (typeof PORTRAIT_USAGE_PERMISSIONS)[number];

const extensions: Record<string, PortraitFormat> = { png: "png", jpg: "jpeg", jpeg: "jpeg", webp: "webp" };

/** A declared type is only accepted when the filename agrees; the bytes are checked separately. */
export function portraitFormat(filename: string, declaredType: string): PortraitFormat | null {
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  const byName = extensions[extension] ?? null;
  const byType = (Object.entries(PORTRAIT_MIME_TYPES).find(([, mime]) => mime === declaredType)?.[0] ?? null) as PortraitFormat | null;
  if (!byName || !byType || byName !== byType) return null;
  return byName;
}
