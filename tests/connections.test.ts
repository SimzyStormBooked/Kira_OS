import { describe, expect, it } from "vitest";
import { connectionInputSchema, normalizeConnectionUrl, type ConnectionPlatform } from "@/lib/connections/schema";

describe("saved connection links", () => {
  it.each([
    ["instagram", "https://instagram.com/kirastanleyauthor/?igsh=tracking#bio", "https://www.instagram.com/kirastanleyauthor"],
    ["facebook", "https://facebook.com/profile.php?id=123456&ref=tracking", "https://www.facebook.com/profile.php?id=123456"],
    ["facebook", "https://www.facebook.com/people/Kira-Stanley/12345/", "https://www.facebook.com/people/Kira-Stanley/12345"],
    ["tiktok", "https://tiktok.com/@author.name?lang=en", "https://www.tiktok.com/@author.name"],
    ["pinterest", "https://pinterest.com/author_name/", "https://www.pinterest.com/author_name"],
    ["youtube", "https://youtube.com/@Author", "https://www.youtube.com/@Author"],
    ["youtube", "https://youtube.com/channel/UC_ab-c", "https://www.youtube.com/channel/UC_ab-c"],
    ["notebooklm", "https://notebooklm.google.com/notebook/abc-123?authuser=0", "https://notebooklm.google.com/notebook/abc-123"],
  ] as const)("canonicalizes %s links without tracking parameters", (platform, input, expected) => {
    expect(normalizeConnectionUrl(platform, input)).toBe(expected);
  });
  it.each([
    ["instagram", "javascript:alert(1)"], ["instagram", "http://instagram.com/author"],
    ["instagram", "https://instagram.com.evil.test/author"], ["instagram", "https://instagram.com@evil.test/author"],
    ["instagram", "https://evil.test@instagram.com/author"], ["instagram", "https://www.instagram.com:8443/author"],
    ["instagram", "https://www.instagram.com\\@evil.test/author"], ["instagram", "https://www.instagram.com/p/abc"],
    ["instagram", "https://www.instagram.com/accounts"], ["facebook", "https://www.facebook.com/l.php?u=https://evil.test"],
    ["facebook", "https://www.facebook.com/profile.php?id=abc"], ["youtube", "https://youtu.be/abc"],
    ["notebooklm", "https://notebooklm.google.com/"], ["notebooklm", "https://notebooklm.google.com.evil.test/notebook/abc"],
    ["tiktok", "https://www.tiktok.com/@author/video/123"], ["pinterest", "https://www.pinterest.com/author/board"],
  ] as [ConnectionPlatform, string][])("rejects unsafe or non-profile %s links", (platform, input) => {
    expect(() => normalizeConnectionUrl(platform, input)).toThrow();
  });
  it("rejects caller-supplied tenant, status, credential, and origin fields", () => {
    const value = { platform: "instagram", label: "My profile", url: "https://instagram.com/author" };
    expect(connectionInputSchema.parse(value).url).toBe("https://www.instagram.com/author");
    for (const key of ["author_id", "access_token", "is_live", "data_origin", "created_by"])
      expect(connectionInputSchema.safeParse({ ...value, [key]: "untrusted" }).success).toBe(false);
  });
});
