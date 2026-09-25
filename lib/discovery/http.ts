import { z } from "zod";
import { WorkspaceAccessError } from "@/lib/auth/session";
export const discoveryHeaders={"Cache-Control":"private, no-store, max-age=0","Referrer-Policy":"no-referrer"};
export class DiscoveryError extends Error { constructor(message:string,public status=400){super(message);} }
export function discoveryFailure(error:unknown){
  const status=error instanceof WorkspaceAccessError||error instanceof DiscoveryError?error.status:error instanceof z.ZodError||error instanceof SyntaxError?400:503;
  const message=error instanceof WorkspaceAccessError||error instanceof DiscoveryError?error.message:status===400?"Check the supplied fields and try again.":"This step could not finish. Your saved discovery work is safe. Please try again.";
  return Response.json({error:message},{status,headers:discoveryHeaders});
}
export async function boundedBody(request:Request,max=20000){const reader=request.body?.getReader();if(!reader)throw new DiscoveryError("Choose a file or enter the required details.");let size=0;const chunks:Uint8Array[]=[];while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>max){await reader.cancel();throw new DiscoveryError("This upload is too large.",413);}chunks.push(part.value);}return Buffer.concat(chunks).toString("utf8");}
