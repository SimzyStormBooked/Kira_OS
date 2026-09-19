import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { strategyPlanSchema, strategyRevisionSchema, strategyTaskSchema, strategyResultSchema, strategyReviewSchema, type StrategyInput, type StrategyOutput, type StrategyUsage } from "./contract";
export class StrategyError extends Error { constructor(public code: string) { super("The marketing plan could not be saved."); } }
function check(error: { code?: string } | null) { if (error) throw new StrategyError(error.code ?? "unavailable"); }
function key() { const value = process.env.KIRA_AI_RECORDING_KEY; if (!/^[a-f\d]{64}$/i.test(value ?? "")) throw new StrategyError("unavailable"); return value; }
export function createStrategyRepository(client: SupabaseClient, author: string) {
  async function rpc(name: string, args: Record<string, unknown>, protectedWrite = false) {
    const { data, error } = await client.rpc(`strategy_${name}`, { a: author, ...args, ...(protectedWrite ? { p_key: key() } : {}) });
    check(error); return Array.isArray(data) && data.length === 1 ? data[0] : data;
  }
  async function rows<T>(table: string, schema: z.ZodType<T>, id?: string) {
    let query = client.from(`strategy_${table}`).select("*").eq("author_id", author);
    if (id) query = query.eq(table === "plans" ? "id" : "plan_id", id);
    const { data, error } = await query.order("created_at", { ascending: table === "tasks" }).limit(200);
    check(error); return schema.array().parse(data ?? []);
  }
  return {
    list: () => rows("plans", strategyPlanSchema),
    async detail(id: string) {
      const [plans, revisions, tasks, results, reviews] = await Promise.all([rows("plans", strategyPlanSchema, id), rows("revisions", strategyRevisionSchema, id), rows("tasks", strategyTaskSchema, id), rows("results", strategyResultSchema, id), rows("reviews", strategyReviewSchema, id)]);
      if (!plans[0]) throw new StrategyError("P0002");
      return { plan: plans[0], revisions, tasks, results, reviews };
    },
    async save(id: string, expected: number | null, input: StrategyInput) { return strategyPlanSchema.parse(await rpc("save_plan", { p_id: id, p_expected: expected, p_input: input })); },
    async begin(id: string, request: string, expected: number) { return z.object({ created: z.boolean(), revision: strategyRevisionSchema }).parse(await rpc("begin_revision", { p_id: id, p_request: request, p_expected: expected }, true)); },
    async finish(request: string, output: StrategyOutput | null, error: string | null, usage: StrategyUsage) { return strategyRevisionSchema.parse(await rpc("finish_revision", { p_request: request, p_output: output, p_error: error, p_usage: usage }, true)); },
    async review(id: string, expected: number, decision: string, feedback: string) { return strategyPlanSchema.parse(await rpc("review_plan", { p_id: id, p_expected: expected, p_decision: decision, p_feedback: feedback })); },
    async activate(id: string, expected: number) { return strategyPlanSchema.parse(await rpc("activate_plan", { p_id: id, p_expected: expected })); },
    async task(id: string, expected: number, status: string) { return strategyTaskSchema.parse(await rpc("set_task", { p_id: id, p_expected: expected, p_status: status })); },
    async result(id: string, value: unknown) { return strategyResultSchema.parse(await rpc("record_result", { p_plan: id, p_value: value })); },
  };
}
