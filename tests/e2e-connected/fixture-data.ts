/** Synthetic identities used only by the loopback browser fixture. Never real accounts. */
export const fixture = {
  authorId: "9ef8d6cd-3cd5-4994-b86c-d61692dd320d",
  memberId: "bf52dc6c-dcd9-4c11-a43d-f7ea59520f6e",
  outsiderId: "c51d34cf-fb71-40c1-ab65-a8a16a20a1e2",
  memberEmail: "cassie-fixture@example.test",
  outsiderEmail: "outsider-fixture@example.test",
  password: "Synthetic-browser-fixture-only-123!",
  publishableKey: "sb_publishable_simulated_browser_fixture_only",
  supabaseUrl: "http://127.0.0.1:3107",
  appUrl: "http://127.0.0.1:3102",
} as const;
