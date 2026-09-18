import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/auth/session",async()=>({
  WorkspaceAccessError:(await import("@/lib/auth/errors")).WorkspaceAccessError,
  requireWorkspaceSession:vi.fn(),
}));
vi.mock("@/lib/auth/workspace-role",async(importOriginal)=>({
  ...(await importOriginal<typeof import("@/lib/auth/workspace-role")>()),
  getWorkspaceRole:vi.fn(),readWorkspaceAccess:vi.fn(),
}));
import { requireWorkspaceSession,WorkspaceAccessError } from "@/lib/auth/session";
import { getWorkspaceRole,readWorkspaceAccess } from "@/lib/auth/workspace-role";
import { GET,PATCH } from "@/app/api/access/route";
const authorId="20000000-0000-4000-8000-000000000001",id="20000000-0000-4000-8000-000000000030";
const rpc=vi.fn();
const session={mode:"connected" as const,configured:true as const,authorization:"authorized" as const,
  user:{id:"owner",email:"owner@example.test"},authorId,supabase:{rpc} as unknown as SupabaseClient};
const listing={role:"owner" as const,owner:{userId:session.user.id,email:session.user.email},members:[]};
function patch(body:unknown,origin:string|null="https://kira.example") {
  const headers=new Headers({"Content-Type":"application/json"});if(origin)headers.set("origin",origin);
  return new Request("https://kira.example/api/access",{method:"PATCH",headers,body:JSON.stringify(body)});
}
describe("Access API authorization and mutation boundaries",()=>{
  beforeEach(()=>{
    vi.stubEnv("NEXT_PUBLIC_APP_URL","https://kira.example");
    vi.mocked(requireWorkspaceSession).mockResolvedValue(session);
    vi.mocked(getWorkspaceRole).mockResolvedValue("owner");
    vi.mocked(readWorkspaceAccess).mockResolvedValue(listing);
    rpc.mockResolvedValue({data:null,error:null});
  });
  afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
  it("returns a private list scoped to the verified session",async()=>{
    const response=await GET();expect(response.status).toBe(200);expect(await response.json()).toEqual(listing);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(readWorkspaceAccess).toHaveBeenCalledWith(session);
  });
  it.each([[401,"unauthenticated"],[403,"forbidden"],[503,"unconfigured"]] as const)("rejects missing access %i",async(status,code)=>{
    vi.mocked(requireWorkspaceSession).mockRejectedValue(new WorkspaceAccessError(status,code,"Access unavailable"));
    expect((await GET()).status).toBe(status);expect((await PATCH(patch({action:"grant",email:"someone@example.test",role:"viewer"}))).status).toBe(status);
    expect(rpc).not.toHaveBeenCalled();expect(readWorkspaceAccess).not.toHaveBeenCalled();
  });
  it.each(["editor","viewer"] as const)("rejects mutations by a %s before database writes",async(role)=>{
    vi.mocked(getWorkspaceRole).mockResolvedValue(role);
    for(const input of [{action:"grant",email:"someone@example.test",role:"editor"},{action:"change",id,role:"editor",version:0},{action:"revoke",id,version:0}]) {
      expect((await PATCH(patch(input))).status).toBe(403);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([null,"null","https://evil.example"])("requires same-origin mutation requests: %s",async(origin)=>{
    expect((await PATCH(patch({action:"revoke",id,version:0},origin))).status).toBe(403);
    expect(requireWorkspaceSession).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    [{action:"grant",email:"  FRIEND@EXAMPLE.TEST  ",role:"viewer"},"workspace_access_grant",{p_author_id:authorId,p_email:"friend@example.test",p_role:"viewer"}],
    [{action:"change",id,role:"editor",version:2},"workspace_access_change",{p_author_id:authorId,p_member_id:id,p_role:"editor",p_expected_version:2}],
    [{action:"revoke",id,version:2},"workspace_access_revoke",{p_author_id:authorId,p_member_id:id,p_expected_version:2}],
  ])("validates and dispatches only the authorized mutation %j",async(input,name,args)=>{
    const response=await PATCH(patch(input));expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(name,args);expect(await response.json()).toEqual(listing);
  });
  it.each([
    {action:"grant",email:"friend@example.test",role:"owner"},
    {action:"grant",email:"invalid",role:"viewer"},
    {action:"grant",email:"friend@example.test",role:"viewer",authorId:"different-tenant"},
    {action:"grant",email:"friend@example.test",role:"viewer",sendInvite:true},
    {action:"change",id,role:"editor",version:-1},
    {action:"change",id,role:"editor",version:1.5},
    {action:"change",id,role:"editor"},
    {action:"revoke",id:"not-uuid",version:0},
    {action:"create-user",email:"friend@example.test"},
  ])("rejects extra, invalid or account-creation fields %j",async(input)=>{
    expect((await PATCH(patch(input))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
  });
  it("bounds actual bytes and rejects missing, malformed or non-JSON bodies",async()=>{
    expect((await PATCH(patch({action:"grant",email:"😀".repeat(1100),role:"viewer"}))).status).toBe(413);
    for(const body of [undefined,"{bad-json"]) {
      expect((await PATCH(new Request("https://kira.example/api/access",{method:"PATCH",headers:{origin:"https://kira.example","Content-Type":"application/json"},body}))).status).toBe(400);
    }
    const wrongType=patch({action:"revoke",id,version:0});wrongType.headers.set("Content-Type","text/plain");
    expect((await PATCH(wrongType)).status).toBe(415);expect(rpc).not.toHaveBeenCalled();
  });
  it.each([["42501",403],["40001",409],["P0002",404],["22023",400],["unexpected",503]] as const)("maps %s without exposing database account details",async(code,status)=>{
    rpc.mockResolvedValue({error:{code,message:"PRIVATE DATABASE ACCOUNT DETAIL"}});
    const response=await PATCH(patch({action:"grant",email:"friend@example.test",role:"viewer"}));
    expect(response.status).toBe(status);expect(await response.text()).not.toContain("PRIVATE");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
