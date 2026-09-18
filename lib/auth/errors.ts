export class WorkspaceAccessError extends Error {
  constructor(
    public readonly status: 401 | 403 | 503,
    public readonly code: "unauthenticated" | "forbidden" | "unconfigured" | "unavailable" | "cross_origin",
    message: string,
  ) {
    super(message);
    this.name = "WorkspaceAccessError";
  }
}
