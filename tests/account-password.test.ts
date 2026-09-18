import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@supabase/supabase-js",()=>({createClient:vi.fn()}));
vi.mock("@/lib/auth/client",()=>({createWorkspaceSupabaseClient:vi.fn()}));
vi.mock("@/lib/auth/session",async()=>({WorkspaceAccessError:(await import("@/lib/auth/errors")).WorkspaceAccessError,requireWorkspaceSession:vi.fn()}));
import { createClient } from "@supabase/supabase-js";
import { createWorkspaceSupabaseClient } from "@/lib/auth/client";
import { requireWorkspaceSession,WorkspaceAccessError } from "@/lib/auth/session";
import { POST } from "@/app/api/account/password/route";
const user={id:"a56cb900-9634-4121-a87e-33cc5904a307",email:"synthetic-owner@example.test"};
const tokens={access_token:"synthetic-access-token",refresh_token:"synthetic-refresh-token",user};
const signInWithPassword=vi.fn(),setSession=vi.fn(),updateUser=vi.fn();
const input={currentPassword:"Synthetic-current-password!",newPassword:"Synthetic-new-password-123!",confirmPassword:"Synthetic-new-password-123!"};
function request(body:unknown=input,origin:string|null="https://kira.example") {
  const headers=new Headers({"Content-Type":"application/json"});if(origin)headers.set("Origin",origin);
  return new Request("https://kira.example/api/account/password",{method:"POST",headers,body:JSON.stringify(body)});
}
describe("Authenticated password change",()=>{
  beforeEach(()=>{
    vi.stubEnv("KIRA_WORKSPACE_MODE","connected");vi.stubEnv("KIRA_AUTHOR_ID","10000000-0000-4000-8000-000000000001");
    vi.stubEnv("NEXT_PUBLIC_APP_URL","https://kira.example");vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://synthetic.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","sb_publishable_synthetic_password_test_key");
    vi.mocked(requireWorkspaceSession).mockResolvedValue({user} as Awaited<ReturnType<typeof requireWorkspaceSession>>);
    vi.mocked(createClient).mockReturnValue({auth:{signInWithPassword}} as unknown as ReturnType<typeof createClient>);
    vi.mocked(createWorkspaceSupabaseClient).mockResolvedValue({auth:{setSession,updateUser}} as unknown as Awaited<ReturnType<typeof createWorkspaceSupabaseClient>>);
    signInWithPassword.mockResolvedValue({data:{user,session:tokens},error:null});
    setSession.mockResolvedValue({data:{user,session:tokens},error:null});updateUser.mockResolvedValue({data:{user},error:null});
  });
  afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
  it("reverifies the same member in an isolated client and updates through writable HttpOnly SSR cookies",async()=>{
    const response=await POST(request());expect(response.status).toBe(200);expect(await response.json()).toEqual({changed:true});
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(createClient).toHaveBeenCalledWith("https://synthetic.supabase.co","sb_publishable_synthetic_password_test_key",{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    expect(signInWithPassword).toHaveBeenCalledExactlyOnceWith({email:user.email,password:input.currentPassword});
    expect(createWorkspaceSupabaseClient).toHaveBeenCalledWith({writableCookies:true});
    expect(setSession).toHaveBeenCalledExactlyOnceWith({access_token:tokens.access_token,refresh_token:tokens.refresh_token});
    expect(updateUser).toHaveBeenCalledExactlyOnceWith({password:input.newPassword});
    expect(signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(setSession.mock.invocationCallOrder[0]);
    expect(setSession.mock.invocationCallOrder[0]).toBeLessThan(updateUser.mock.invocationCallOrder[0]);
  });
  it.each([[401,"unauthenticated"],[403,"forbidden"],[503,"unconfigured"]] as const)("does not change passwords without workspace access (%i)",async(status,code)=>{
    vi.mocked(requireWorkspaceSession).mockRejectedValue(new WorkspaceAccessError(status,code,"Access unavailable"));
    expect((await POST(request())).status).toBe(status);expect(createClient).not.toHaveBeenCalled();expect(updateUser).not.toHaveBeenCalled();
  });
  it.each([null,"null","https://evil.example"])("requires a same-origin request %s",async(origin)=>{
    expect((await POST(request(input,origin))).status).toBe(403);expect(requireWorkspaceSession).not.toHaveBeenCalled();expect(updateUser).not.toHaveBeenCalled();
  });
  it("keeps the existing session untouched for a wrong current password",async()=>{
    signInWithPassword.mockResolvedValue({data:{user:null,session:null},error:{status:400,message:"PRIVATE detail"}});
    const response=await POST(request());expect(response.status).toBe(401);expect(await response.text()).not.toContain("PRIVATE");
    expect(createWorkspaceSupabaseClient).not.toHaveBeenCalled();expect(setSession).not.toHaveBeenCalled();expect(updateUser).not.toHaveBeenCalled();
  });
  it.each(["different-user","different-session-user"])("rejects an identity mismatch: %s",async(kind)=>{
    signInWithPassword.mockResolvedValue({data:{user:kind==="different-user"?{...user,id:"other"}:user,session:kind==="different-session-user"?{...tokens,user:{...user,id:"other"}}:tokens},error:null});
    expect((await POST(request())).status).toBe(401);expect(setSession).not.toHaveBeenCalled();expect(updateUser).not.toHaveBeenCalled();
  });
  it("never updates if the fresh cookie session cannot be verified",async()=>{
    setSession.mockResolvedValue({data:{user:null},error:{status:401}});
    expect((await POST(request())).status).toBe(503);expect(updateUser).not.toHaveBeenCalled();
  });
  it.each([
    {...input,newPassword:"short",confirmPassword:"short"},
    {...input,newPassword:"x".repeat(129),confirmPassword:"x".repeat(129)},
    {...input,newPassword:"😀".repeat(6),confirmPassword:"😀".repeat(6)},
    {...input,confirmPassword:"A different password"},
    {...input,newPassword:input.currentPassword,confirmPassword:input.currentPassword},
    {...input,currentPassword:""},
    {...input,userId:"another-user"},
    {...input,email:"another@example.test"},
  ])("rejects invalid or spoofed password fields",async(body)=>{
    const response=await POST(request(body));expect(response.status).toBe(400);expect(await response.text()).not.toContain(input.currentPassword);
    expect(signInWithPassword).not.toHaveBeenCalled();expect(updateUser).not.toHaveBeenCalled();
  });
  it("bounds actual body bytes and rejects missing, malformed or wrong content type",async()=>{
    expect((await POST(request({...input,currentPassword:"😀".repeat(1100)}))).status).toBe(413);
    for(const body of [undefined,"{invalid-json"])expect((await POST(new Request("https://kira.example/api/account/password",{method:"POST",headers:{Origin:"https://kira.example","Content-Type":"application/json"},body}))).status).toBe(400);
    const wrongType=request();wrongType.headers.set("Content-Type","text/plain");expect((await POST(wrongType)).status).toBe(415);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
  it.each([[429,429],[503,503]] as const)("handles verification service status %i without changing the password",async(status,expected)=>{
    signInWithPassword.mockResolvedValue({data:{user:null,session:null},error:{status}});
    expect((await POST(request())).status).toBe(expected);expect(updateUser).not.toHaveBeenCalled();
  });
  it.each([[422,400],[429,429],[503,503]] as const)("handles update service status %i without disclosing supplied passwords",async(status,expected)=>{
    updateUser.mockResolvedValue({error:{status,message:input.newPassword}});
    const response=await POST(request());expect(response.status).toBe(expected);expect(await response.text()).not.toContain(input.newPassword);
  });
});
