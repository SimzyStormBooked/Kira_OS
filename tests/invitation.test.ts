import { describe, expect, it } from "vitest";
import {
  buildSignInPath,
  buildWelcomeLink,
  safeInvitationEmail,
  WELCOME_PATH,
} from "@/lib/auth/invitation";
import { resolveShareOrigin } from "@/lib/config";

const ORIGIN = "https://kira-os-dusky.vercel.app";

describe("safeInvitationEmail", () => {
  it("accepts an ordinary address and trims surrounding space", () => {
    expect(safeInvitationEmail("  cassy@example.com ")).toBe("cassy@example.com");
    expect(safeInvitationEmail("first.last+kira@sub.example.co.uk")).toBe("first.last+kira@sub.example.co.uk");
  });

  it("uses the first value when a query parameter repeats", () => {
    expect(safeInvitationEmail(["cassy@example.com", "other@example.com"])).toBe("cassy@example.com");
  });

  it("rejects anything that is not a plain address, so a link cannot reflect text", () => {
    for (const value of [
      undefined, null, 42, "", "   ", "not an email", "cassy@example",
      "cassy@@example.com", "cassy@.example.com", "cassy@example..com",
      "<script>alert(1)</script>@example.com", "cassy@example.com <b>call now</b>",
      "cassy@example.com\nBcc: someone@example.com", "\"quoted local\"@example.com",
      "cassy@[127.0.0.1]", `${"a".repeat(250)}@example.com`,
    ]) {
      expect(safeInvitationEmail(value), String(value)).toBeNull();
    }
  });
});

describe("buildWelcomeLink", () => {
  it("builds a shareable address with no recipient by default", () => {
    expect(buildWelcomeLink(ORIGIN)).toBe(`${ORIGIN}${WELCOME_PATH}`);
  });

  it("prefills a valid recipient and drops an invalid one", () => {
    expect(buildWelcomeLink(ORIGIN, "cassy@example.com"))
      .toBe(`${ORIGIN}/welcome?for=cassy%40example.com`);
    expect(buildWelcomeLink(ORIGIN, "javascript:alert(1)")).toBe(`${ORIGIN}${WELCOME_PATH}`);
  });

  it("carries only a safe in-app destination", () => {
    expect(buildWelcomeLink(ORIGIN, null, "/desk")).toBe(`${ORIGIN}/welcome?next=%2Fdesk`);
    for (const unsafe of ["https://example.com", "//example.com", "/auth/logout", "/api/access", "/login"]) {
      expect(buildWelcomeLink(ORIGIN, null, unsafe), unsafe).toBe(`${ORIGIN}${WELCOME_PATH}`);
    }
  });

  it("drops a query string or fragment, so nothing rides along in a text message", () => {
    expect(buildWelcomeLink(ORIGIN, null, "/desk?password=hunter2#token"))
      .toBe(`${ORIGIN}/welcome?next=%2Fdesk`);
    expect(buildSignInPath(null, "/desk?password=hunter2")).toBe("/login?next=%2Fdesk");
  });
});

describe("resolveShareOrigin", () => {
  it("prefers the configured public address over the request host", () => {
    expect(resolveShareOrigin("preview-xyz.vercel.app", { NEXT_PUBLIC_APP_URL: ORIGIN })).toBe(ORIGIN);
  });

  it("falls back to this deployment's own host", () => {
    expect(resolveShareOrigin("kira.example.com", {})).toBe("https://kira.example.com");
    expect(resolveShareOrigin("localhost:3000", {})).toBe("http://localhost:3000");
    expect(resolveShareOrigin("127.0.0.1:3000", {})).toBe("http://127.0.0.1:3000");
  });

  it("returns nothing it cannot trust, rather than a guessed address", () => {
    for (const host of [null, undefined, "", "evil.com/path", "host header\ninjected", "a b"]) {
      expect(resolveShareOrigin(host, {}), String(host)).toBeNull();
    }
    expect(resolveShareOrigin("kira.example.com", { NEXT_PUBLIC_APP_URL: "not a url" })).toBeNull();
  });
});

describe("buildSignInPath", () => {
  it("returns bare sign-in when nothing is known", () => {
    expect(buildSignInPath(null, "/")).toBe("/login");
    expect(buildSignInPath("nope", "/")).toBe("/login");
  });

  it("prefills the address and keeps a safe destination", () => {
    expect(buildSignInPath("cassy@example.com", "/")).toBe("/login?email=cassy%40example.com");
    expect(buildSignInPath("cassy@example.com", "/desk"))
      .toBe("/login?email=cassy%40example.com&next=%2Fdesk");
  });

  it("refuses an off-site destination", () => {
    expect(buildSignInPath(null, "https://example.com/steal")).toBe("/login");
  });
});
