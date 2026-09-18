import { randomUUID, createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", async () => ({ WorkspaceAccessError: (await import("@/lib/auth/errors")).WorkspaceAccessError, requireWorkspaceSession: vi.fn() }));
vi.mock("@/lib/auth/workspace-role", () => ({ getWorkspaceRole: vi.fn() }));
vi.mock("@/lib/manuscripts/repository", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/manuscripts/repository")>(), createManuscriptRepository: vi.fn() }));
vi.mock("@/lib/ai/studio-provider", () => ({ getStudioAvailability: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({ runManuscriptExtraction: vi.fn() }));
import { requireWorkspaceSession, WorkspaceAccessError } from "@/lib/auth/session";
import { getWorkspaceRole } from "@/lib/auth/workspace-role";
import { createManuscriptRepository } from "@/lib/manuscripts/repository";
import { getStudioAvailability } from "@/lib/ai/studio-provider";
import { runManuscriptExtraction } from "@/lib/ai/provider";
import { emptyManuscriptUsage, ManuscriptProviderError } from "@/lib/manuscripts/provider";
import { POST as upload } from "@/app/api/manuscripts/upload/route";
import { POST as processBook } from "@/app/api/manuscripts/[id]/process/route";
import { GET as search } from "@/app/api/library/search/route";
import { GET as source } from "@/app/api/manuscripts/[id]/source/route";
import { POST as createBook } from "@/app/api/library/route";
const authorId=randomUUID(), userId=randomUUID(), bookId=randomUUID(), manuscriptId=randomUUID(), chunkId=randomUUID();
const text="This synthetic manuscript reference records a coordinator named Rowan and an archive location.";
const chunk={id:chunkId,chunk_index:0,section:"Manuscript",reference_text:text,content_hash:createHash("sha256").update(text).digest("hex")};
const row={id:manuscriptId,author_id:authorId,book_id:bookId,source_id:randomUUID(),asset_id:randomUUID(),filename:"reference.txt",mime_type:"text/plain",size_bytes:text.length,content_hash:chunk.content_hash,storage_path:`${authorId}/${bookId}/${manuscriptId}.txt`,version:1,status:"queued" as const,chunk_count:1,completed_chunks:0,error_code:null,created_at:new Date().toISOString()};
const repo={findBook:vi.fn(),findManuscript:vi.fn(),list:vi.fn(),detail:vi.fn(),saveBook:vi.fn(),register:vi.fn(),storeChunks:vi.fn(),failUpload:vi.fn(),beginBatch:vi.fn(),finishBatch:vi.fn(),source:vi.fn(),search:vi.fn()};
const storage={upload:vi.fn(),download:vi.fn()};
const supabase={storage:{from:vi.fn(()=>storage)}};
const origin="https://kira.test";
function json(path:string,body:unknown,site:string|null=origin) { return new Request(`${origin}${path}`,{method:"POST",headers:{"Content-Type":"application/json",...(site?{origin:site}:{})},body:JSON.stringify(body)}); }
function fileUpload(permission=true,content=text) { const form=new FormData();form.set("bookId",bookId);form.set("permission",String(permission));form.set("file",new File([content],"reference.txt",{type:"text/plain"}));return new Request(`${origin}/api/manuscripts/upload`,{method:"POST",headers:{origin},body:form}); }
const context={params:Promise.resolve({id:manuscriptId})};
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv("NEXT_PUBLIC_APP_URL",origin);
  vi.mocked(requireWorkspaceSession).mockResolvedValue({mode:"connected",configured:true,authorization:"authorized",authorId,user:{id:userId,email:"fixture@example.test"},supabase:supabase as unknown as Awaited<ReturnType<typeof requireWorkspaceSession>>["supabase"]});
  vi.mocked(getWorkspaceRole).mockResolvedValue("editor");vi.mocked(createManuscriptRepository).mockReturnValue(repo);
  repo.findBook.mockResolvedValue({id:bookId});repo.findManuscript.mockResolvedValue(row);repo.register.mockResolvedValue({...row,status:"uploading"});
  repo.storeChunks.mockResolvedValue(row);repo.failUpload.mockResolvedValue(row);storage.upload.mockResolvedValue({error:null});supabase.storage.from.mockReturnValue(storage);
  repo.beginBatch.mockResolvedValue({created:true,batch:{id:randomUUID()},chunks:[chunk]});repo.finishBatch.mockResolvedValue({});
  vi.mocked(getStudioAvailability).mockResolvedValue({available:true,reason:"ready",message:"Ready"});
  vi.mocked(runManuscriptExtraction).mockResolvedValue({result:{facts:[],characters:[]},usage:emptyManuscriptUsage(),embeddings:[]});
});
afterEach(()=>vi.unstubAllEnvs());
describe("private manuscript API boundaries",()=>{
  it.each([null,"https://elsewhere.test"])("blocks upload/process from origin %s before touching private data",async site=>{
    const response=await processBook(json("/api/manuscripts/x/process",{requestId:randomUUID(),retry:false},site),context);expect(response.status).toBe(403);expect(requireWorkspaceSession).not.toHaveBeenCalled();expect(runManuscriptExtraction).not.toHaveBeenCalled();
  });
  it("blocks viewer mutation and invalid upload permission before storage or paid calls",async()=>{
    vi.mocked(getWorkspaceRole).mockResolvedValueOnce("viewer");expect((await upload(fileUpload())).status).toBe(403);
    expect((await upload(fileUpload(false))).status).toBe(400);expect(storage.upload).not.toHaveBeenCalled();expect(repo.register).not.toHaveBeenCalled();
  });
  it("parses, registers, privately stores and seals attributed chunks with no AI call during upload",async()=>{
    const response=await upload(fileUpload());expect(response.status).toBe(200); // mock registry deliberately returns an existing version ID
    expect(supabase.storage.from).toHaveBeenCalledWith("kira-manuscripts");expect(storage.upload).toHaveBeenCalledWith(row.storage_path,expect.any(Buffer),expect.objectContaining({upsert:false}));
    expect(repo.storeChunks).toHaveBeenCalledWith(manuscriptId,[expect.objectContaining({reference_text:text})]);expect(runManuscriptExtraction).not.toHaveBeenCalled();
    const payload=await response.json();expect(JSON.stringify(payload)).not.toContain("storage_path");expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("returns an already processed identical upload without storage writes or AI spend",async()=>{
    repo.register.mockResolvedValueOnce({...row,status:"ready"});const response=await upload(fileUpload());expect(response.status).toBe(200);expect(storage.upload).not.toHaveBeenCalled();expect(repo.storeChunks).not.toHaveBeenCalled();
  });
  it("does not attach text to a mismatched object after upload conflict",async()=>{
    storage.upload.mockResolvedValue({error:{message:"conflict"}});storage.download.mockResolvedValue({data:new Blob(["tampered file"]),error:null});
    expect((await upload(fileUpload())).status).toBe(503);expect(repo.failUpload).toHaveBeenCalledWith(manuscriptId);expect(repo.storeChunks).not.toHaveBeenCalled();
  });
  it("recovers a lost upload response only after verifying stored bytes",async()=>{
    storage.upload.mockResolvedValue({error:{message:"conflict"}});storage.download.mockResolvedValue({data:new Blob([text]),error:null});
    expect((await upload(fileUpload())).status).toBe(200);expect(repo.storeChunks).toHaveBeenCalledOnce();
  });
  it("reserves a batch before spending and persists the result before responding",async()=>{
    const id=randomUUID();const response=await processBook(json("/process",{requestId:id,retry:false}),context);
    expect(response.status).toBe(200);expect(repo.beginBatch).toHaveBeenCalledWith(manuscriptId,id,false);
    expect(repo.beginBatch.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(runManuscriptExtraction).mock.invocationCallOrder[0]);
    expect(repo.finishBatch).toHaveBeenCalledWith(manuscriptId,id,{facts:[],characters:[]},emptyManuscriptUsage(),[],null);
  });
  it("does not repeat paid work for a pending/reused request and reports it to the UI",async()=>{
    repo.beginBatch.mockResolvedValue({created:false,batch:{status:"pending"},chunks:[]});repo.findManuscript.mockResolvedValue({...row,status:"processing"});
    const response=await processBook(json("/process",{requestId:randomUUID(),retry:false}),context);expect(response.status).toBe(202);expect(await response.json()).toMatchObject({pending:true});expect(runManuscriptExtraction).not.toHaveBeenCalled();
  });
  it("retries final persistence once without repeating the paid call",async()=>{
    repo.finishBatch.mockRejectedValueOnce(new Error("temporary write failure")).mockResolvedValueOnce({});
    expect((await processBook(json("/process",{requestId:randomUUID(),retry:false}),context)).status).toBe(200);expect(runManuscriptExtraction).toHaveBeenCalledOnce();expect(repo.finishBatch).toHaveBeenCalledTimes(2);
  });
  it("records sanitized failure and retains completed passages",async()=>{
    vi.mocked(runManuscriptExtraction).mockRejectedValueOnce(new ManuscriptProviderError("timeout",emptyManuscriptUsage()));
    const response=await processBook(json("/process",{requestId:randomUUID(),retry:true}),context);expect(response.status).toBe(503);expect(repo.finishBatch).toHaveBeenCalledWith(manuscriptId,expect.any(String),null,emptyManuscriptUsage(),[],"timeout");
  });
  it("rejects tenant spoofing and undeclared input fields",async()=>{
    expect((await createBook(json("/api/library",{title:"Book",authorId:randomUUID()}))).status).toBe(400);
    expect((await processBook(json("/process",{requestId:randomUUID(),retry:false,authorId:randomUUID()}),context)).status).toBe(400);expect(repo.saveBook).not.toHaveBeenCalled();expect(repo.beginBatch).not.toHaveBeenCalled();
  });
  it("requires a verified private session for source lookup and retrieval",async()=>{
    vi.mocked(requireWorkspaceSession).mockRejectedValue(new WorkspaceAccessError(401,"unauthenticated","Sign in."));
    expect((await search(new Request(`${origin}/api/library/search?q=Rowan`))).status).toBe(401);expect((await source(new Request(`${origin}/api/manuscripts/${manuscriptId}/source?chunk=${chunkId}`),context)).status).toBe(401);
    expect(repo.source).not.toHaveBeenCalled();expect(repo.search).not.toHaveBeenCalled();
  });
});
