import { z } from "zod";

export const publicUrlSchema = z.string().trim().url().max(2000).refine(value => {
  const u = new URL(value);
  return u.protocol === "https:" && !u.username && !u.password && !u.port && !u.search && !u.hash && u.hostname.includes(".");
}, "Use a public HTTPS page address without tracking parameters, passwords, or fragments.");
export const findingSchema = z.object({ code: z.string().max(80), title: z.string().max(200), detail: z.string().max(1500), suggestion: z.string().max(1500) });
export const auditSchema = z.object({ url: publicUrlSchema, checkedAt: z.iso.datetime(), title: z.string().max(1000).nullable(), description: z.string().max(3000).nullable(), canonical: z.string().max(2000).nullable(), h1: z.string().max(1000).array().max(50), findings: findingSchema.array().max(20), statusCode: z.number().int() });
export type Audit = z.infer<typeof auditSchema>;
export const searchMetricSchema = z.object({ clicks: z.number().int().nonnegative(), impressions: z.number().int().nonnegative(), ctr: z.number().min(0).max(1), position: z.number().finite().nonnegative() });
export const searchSnapshotSchema = z.object({ data_origin: z.enum(["google_api", "manual_snapshot"]), property: z.string().trim().min(1).max(2000), dimension: z.enum(["date", "page", "query"]), since: z.iso.date(), until: z.iso.date(), fetchedAt: z.iso.datetime(), rows: searchMetricSchema.extend({ key: z.string().max(2000) }).array().max(10000), totals: searchMetricSchema.nullable(), warning: z.string().max(2000) });
export type SearchSnapshot = z.infer<typeof searchSnapshotSchema>;
const nullableId = z.uuid().nullable();
export const pageInputSchema = z.object({ url: publicUrlSchema, label: z.string().trim().min(1).max(200), bookId: nullableId, kind: z.enum(["website", "book", "series"]) }).strict();
const amazonHosts = ["amazon.com", "amazon.co.uk", "amazon.ca", "amazon.com.au", "amazon.de", "amazon.fr", "amazon.it", "amazon.es", "amazon.co.jp", "amazon.in", "amazon.com.br", "amazon.com.mx", "amazon.nl", "amazon.se", "amazon.pl"];
export const amazonUrlSchema = z.string().trim().url().max(2000).refine(value => {
  const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password && !u.port && amazonHosts.includes(u.hostname.replace(/^www\./,"")) && /\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:\/|$)/i.test(u.pathname);
}, "Use the full Amazon book link containing /dp/ and its ten-character edition ID.").transform(value => { const u = new URL(value); u.search=""; u.hash=""; return u.toString(); });
export const listingInputSchema = z.object({ bookId: z.uuid(), amazonUrl: amazonUrlSchema, edition: z.string().trim().min(1).max(100), description: z.string().trim().max(5000), keywords: z.string().trim().max(200).array().max(7), categories: z.string().trim().max(150).array().max(3), status: z.enum(["draft", "reviewed"]), expectedVersion: z.number().int().nonnegative().nullable() }).strict();
export const discoveryActionInputSchema = z.object({ pageId: nullableId, bookId: nullableId, title: z.string().trim().min(1).max(200), detail: z.string().trim().min(1).max(6000) }).strict();
export const discoveryInputSchema = z.discriminatedUnion("action", [
  pageInputSchema.extend({ action:z.literal("page") }), listingInputSchema.extend({ action:z.literal("listing") }),
  discoveryActionInputSchema.extend({action:z.literal("action")}), z.object({action:z.literal("action_status"),id:z.uuid(),status:z.enum(["planned","applied"])}).strict(),
  z.object({action:z.literal("remove_page"),id:z.uuid()}).strict(),
]);
export const googleViewSchema=z.object({configured:z.boolean(),connected:z.boolean(),properties:z.array(z.object({siteUrl:z.string(),permissionLevel:z.string()})),selectedProperty:z.string().nullable(),connectedAt:z.string().nullable(),lastError:z.string().nullable().default(null)});
export const discoveryViewSchema = z.object({
  available:z.boolean(),canEdit:z.boolean(),books:z.array(z.object({id:z.uuid(),title:z.string()})),
  pages:z.array(pageInputSchema.extend({id:z.uuid(),audit:auditSchema.nullable(),updatedAt:z.string()})),
  listings:z.array(listingInputSchema.omit({expectedVersion:true}).extend({id:z.uuid(),asin:z.string(),updatedAt:z.string(),version:z.number().int()})),
  reports:z.array(z.object({id:z.uuid(),snapshot:searchSnapshotSchema,createdAt:z.string()})),
  actions:z.array(discoveryActionInputSchema.extend({id:z.uuid(),status:z.enum(["planned","applied"]),createdAt:z.string(),updatedAt:z.string()})),
  jobs:z.array(z.object({id:z.uuid(),kind:z.enum(["audit","search"]),state:z.enum(["queued","running","complete","failed","cancelled"]),pageId:nullableId,error:z.string().nullable(),createdAt:z.string()})),
  google:googleViewSchema,
});
export type DiscoveryView=z.infer<typeof discoveryViewSchema>;
