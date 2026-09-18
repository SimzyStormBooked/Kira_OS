import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only",()=>({}));
import { getWorkspaceRole, readWorkspaceAccess } from "@/lib/auth/workspace-role";
const authorId="20000000-0000-4000-8000-000000000001", userId="20000000-0000-4000-8000-000000000010";
function client(ownerId:string|null="different-user",role:string|null="viewer",authorError:unknown=null) {
  const author={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data:{id:authorId,owner_user_id:ownerId},error:authorError})};
  author.select.mockReturnValue(author);author.eq.mockReturnValue(author);
  const member={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data:role?{role}:null,error:null})};
  member.select.mockReturnValue(member);member.eq.mockReturnValue(member);
  const supabase={from:vi.fn((table:string)=>table==="authors"?author:member),rpc:vi.fn()};
  return {author,member,supabase,session:{authorId,user:{id:userId},supabase:supabase as unknown as SupabaseClient}};
}
describe("Fresh workspace role lookup",()=>{
  it("derives ownership from the RLS-visible row instead of editable user metadata",async()=>{
    const c=client(userId);expect(await getWorkspaceRole(c.session)).toBe("owner");
    expect(c.member.select).not.toHaveBeenCalled();expect(c.author.eq).toHaveBeenCalledWith("id",authorId);
  });
  it.each(["viewer","editor"] as const)("returns the exact %s membership and hides others' account details",async(role)=>{
    const c=client(null,role);expect(await readWorkspaceAccess(c.session)).toEqual({role,owner:null,members:[]});
    expect(c.member.eq).toHaveBeenCalledWith("author_id",authorId);expect(c.member.eq).toHaveBeenCalledWith("user_id",userId);
    expect(c.supabase.rpc).not.toHaveBeenCalled();
  });
  it.each([null,"owner","admin"])("fails closed for missing or unexpected membership role %s",async(role)=>{
    const c=client(null,role);await expect(getWorkspaceRole(c.session)).rejects.toMatchObject({status:403});
  });
  it("fails closed on a revoked author row and on database failure",async()=>{
    const c=client();c.author.maybeSingle.mockResolvedValue({data:null,error:null});
    await expect(getWorkspaceRole(c.session)).rejects.toMatchObject({status:403});
    await expect(getWorkspaceRole(client(null,null,{code:"42P01"}).session)).rejects.toMatchObject({status:503});
  });
  it("loads owner account details only through the guarded RPC and validates its result",async()=>{
    const c=client(userId);c.supabase.rpc.mockResolvedValue({data:{owner:{userId,email:"owner@example.test"},members:[]},error:null});
    expect(await readWorkspaceAccess(c.session)).toMatchObject({role:"owner",owner:{email:"owner@example.test"}});
    expect(c.supabase.rpc).toHaveBeenCalledWith("workspace_access_list",{p_author_id:authorId});
    c.supabase.rpc.mockResolvedValue({data:{members:"invalid"},error:null});
    await expect(readWorkspaceAccess(c.session)).rejects.toMatchObject({code:"unavailable"});
  });
});
