import type { DataOrigin, Evidence } from "@/types/domain";
export interface ConnectorResult<T> {
  records: T[];
  evidence: Evidence[];
  data_origin: DataOrigin;
  fetched_at: string;
  cursor: string | null;
}
/** Connectors are read-only in Phase One. No publishing or messaging interface exists. */
export interface ReadOnlyConnector<T> {
  id: string;
  name: string;
  status: "not_connected" | "ready";
  fetch(cursor?: string): Promise<ConnectorResult<T>>;
}
