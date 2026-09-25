import "server-only";
import { createCipheriv,createDecipheriv,createHash,randomBytes } from "node:crypto";
import { z } from "zod";
import { searchSnapshotSchema,type SearchSnapshot } from "./contract";
export const googleScope="https://www.googleapis.com/auth/webmasters.readonly";
export function googleConfig(env:Record<string,string|undefined>=process.env){
  const clientId=env.KIRA_GOOGLE_CLIENT_ID?.trim(),clientSecret=env.KIRA_GOOGLE_CLIENT_SECRET?.trim(),encoded=env.KIRA_GOOGLE_CREDENTIAL_KEY?.trim(),origin=env.NEXT_PUBLIC_APP_URL?.replace(/\/$/,"");
  if(!clientId||!clientSecret||!encoded||!origin||!/^https:\/\//.test(origin)||!env.KIRA_AI_RECORDING_KEY)return null;
  const key=Buffer.from(encoded,"base64");if(key.length!==32||key.toString('base64')!==encoded)return null;
  try{const u=new URL(origin);if(u.origin!==origin||u.username||u.password||u.port)return null;}catch{return null;}
  return {clientId,clientSecret,key,origin,callback:`${origin}/api/discovery/google/callback`};
}
type Config=NonNullable<ReturnType<typeof googleConfig>>;
export const credentialSchema=z.object({accessToken:z.string().min(1).max(10000),refreshToken:z.string().min(1).max(10000),expiresAt:z.number().finite()});
export type GoogleCredential=z.infer<typeof credentialSchema>;
export function encryptGoogle(value:GoogleCredential,key:Buffer,authorId:string,actorId:string){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv);cipher.setAAD(Buffer.from(`kira-google:v1:${authorId}:${actorId}`));const data=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),data.toString('base64url')].join('.');}
export function decryptGoogle(value:string,key:Buffer,authorId:string,actorId:string){const [version,iv,tag,data,extra]=value.split('.');if(version!=='v1'||!iv||!tag||!data||extra)throw new Error('Invalid credential');const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));decipher.setAAD(Buffer.from(`kira-google:v1:${authorId}:${actorId}`));decipher.setAuthTag(Buffer.from(tag,'base64url'));return credentialSchema.parse(JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString()));}
export class GoogleError extends Error {constructor(){super("Reconnect Google or try the report again later.");}}
async function googleJson(url:string,init:RequestInit){
  try{
  const response=await fetch(url,{...init,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new GoogleError();
  const reader=response.body?.getReader();if(!reader)throw new GoogleError();let size=0;const parts:Uint8Array[]=[];while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>3000000){await reader.cancel();throw new GoogleError();}parts.push(part.value);}return JSON.parse(Buffer.concat(parts).toString()) as unknown;
  }catch{throw new GoogleError();}
}
export function authorizationUrl(config:Config,state:string,verifier:string){const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');u.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.callback,response_type:'code',scope:googleScope,access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();return u.toString();}
const tokenSchema=z.object({access_token:z.string().min(1).max(10000),refresh_token:z.string().max(10000).optional(),expires_in:z.number().int().positive().max(86400),scope:z.string().optional(),token_type:z.string()});
async function token(config:Config,body:Record<string,string>){try{return tokenSchema.parse(await googleJson('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...body,client_id:config.clientId,client_secret:config.clientSecret})}));}catch{throw new GoogleError();}}
function readOnlyScope(value:string){const scopes=value.trim().split(/\s+/);return scopes.length===1&&scopes[0]===googleScope;}
export async function exchangeGoogleCode(config:Config,code:string,verifier:string):Promise<GoogleCredential>{const result=await token(config,{grant_type:'authorization_code',code,redirect_uri:config.callback,code_verifier:verifier});if(!result.refresh_token||result.token_type.toLowerCase()!=='bearer'||!result.scope||!readOnlyScope(result.scope))throw new GoogleError();return {accessToken:result.access_token,refreshToken:result.refresh_token,expiresAt:Date.now()+result.expires_in*1000};}
export async function refreshGoogle(config:Config,credential:GoogleCredential):Promise<GoogleCredential>{if(credential.expiresAt>Date.now()+60000)return credential;const result=await token(config,{grant_type:'refresh_token',refresh_token:credential.refreshToken});if(result.token_type.toLowerCase()!=='bearer'||(result.scope!==undefined&&!readOnlyScope(result.scope)))throw new GoogleError();return {accessToken:result.access_token,refreshToken:result.refresh_token||credential.refreshToken,expiresAt:Date.now()+result.expires_in*1000};}
const propertySchema=z.object({siteUrl:z.string().max(2000),permissionLevel:z.enum(['siteOwner','siteFullUser','siteRestrictedUser','siteUnverifiedUser'])});
export async function googleProperties(accessToken:string){const result=z.object({siteEntry:propertySchema.array().max(100).default([])}).parse(await googleJson('https://www.googleapis.com/webmasters/v3/sites',{headers:{Authorization:`Bearer ${accessToken}`}}));return result.siteEntry.filter(p=>p.permissionLevel!=='siteUnverifiedUser');}
export function googleDateRange(now=new Date()){const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);const end=Date.parse(`${today}T12:00:00Z`)-3*86400000;return {until:new Date(end).toISOString().slice(0,10),since:new Date(end-27*86400000).toISOString().slice(0,10)};}
export async function fetchGoogleSearch(accessToken:string,property:string):Promise<SearchSnapshot>{
  const properties=await googleProperties(accessToken);if(!properties.some(p=>p.siteUrl===property))throw new GoogleError();
  const range=googleDateRange();const endpoint=`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
  const read=async(dimensions:string[])=>z.object({rows:z.array(z.object({keys:z.string().array().optional(),clicks:z.number().int().nonnegative(),impressions:z.number().int().nonnegative(),ctr:z.number().min(0).max(1),position:z.number().nonnegative()})).max(10000).default([])}).parse(await googleJson(endpoint,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({startDate:range.since,endDate:range.until,type:'web',dataState:'final',dimensions,rowLimit:10000})}));
  const [daily,aggregate]=await Promise.all([read(['date']),read([])]);
  if(aggregate.rows.length>1||daily.rows.some(r=>r.keys?.length!==1||!z.iso.date().safeParse(r.keys[0]).success||r.keys[0]<range.since||r.keys[0]>range.until||r.clicks>r.impressions)||new Set(daily.rows.map(r=>r.keys?.[0])).size!==daily.rows.length||aggregate.rows.some(r=>r.clicks>r.impressions))throw new GoogleError();
  return searchSnapshotSchema.parse({data_origin:'google_api',property,dimension:'date',...range,fetchedAt:new Date().toISOString(),rows:daily.rows.map(r=>({...r,key:r.keys?.[0]})),totals:aggregate.rows[0]??null,warning:'Google Search Console · finalized web-search data · Pacific reporting dates. The API does not guarantee all rows. Missing dates remain unknown. Clicks are not purchases.'});
}
export async function revokeGoogle(credential:GoogleCredential){const response=await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:credential.refreshToken}),signal:AbortSignal.timeout(10000),redirect:'error'});return response.ok;}
