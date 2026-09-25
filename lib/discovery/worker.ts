import "server-only";
import { z } from "zod";
import { auditPage,AuditError } from "./audit";
import { discoveryWorker } from "./repository";
import { decryptGoogle,encryptGoogle,googleConfig,refreshGoogle,fetchGoogleSearch,GoogleError } from "./google";
export async function processDiscovery(id:string,run:string){
  try{const item=await discoveryWorker('claim',id,run);if(!item)return;
    if(item.kind==='audit')await discoveryWorker('finish',id,run,{audit:await auditPage(z.string().parse(item.url))});
    else{const c=googleConfig();if(!c)throw new GoogleError();const credential=await refreshGoogle(c,decryptGoogle(item.ciphertext,c.key,item.authorId,item.actorId));
      const stillCurrent=await discoveryWorker('credential',id,run,{ciphertext:encryptGoogle(credential,c.key,item.authorId,item.actorId)});if(!stillCurrent)return;
      await discoveryWorker('finish',id,run,{snapshot:await fetchGoogleSearch(credential.accessToken,item.property)});
    }
  }catch(error){await discoveryWorker('fail',id,run,{code:error instanceof AuditError?error.code:error instanceof GoogleError?'reconnect_google':'interrupted'}).catch(()=>{});}
}
