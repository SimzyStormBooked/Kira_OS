import { z } from "zod";
export const metaAccountSchema = z.object({
  page_id: z.string().regex(/^[0-9]{1,30}$/), page_name: z.string().min(1).max(500),
  instagram_id: z.string().regex(/^[0-9]{1,30}$/).nullable(), instagram_username: z.string().max(100).nullable(),
}).strict();
export const metaConnectionSchema = z.object({
  author_id: z.uuid(), authorized_by: z.uuid(), meta_user_id: z.string(),
  status: z.enum(["authorized", "needs_reconnect"]), scopes: z.array(z.string()),
  expires_at: z.string(), connected_at: z.string(), last_checked_at: z.string(),
  accounts: z.array(metaAccountSchema),
});
export type MetaConnection = z.infer<typeof metaConnectionSchema>;
export type MetaAccount = z.infer<typeof metaAccountSchema>;
export interface MetaView { configured: boolean; isOwner: boolean; connection: MetaConnection | null; unavailable?: boolean; callbackUrl?: string; }
