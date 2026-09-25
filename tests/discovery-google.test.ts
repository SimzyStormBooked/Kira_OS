import {createHash} from 'node:crypto';
import {afterEach, describe, expect, it, vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {authorizationUrl,decryptGoogle,encryptGoogle,exchangeGoogleCode,fetchGoogleSearch,googleConfig,googleDateRange,googleProperties,googleScope,refreshGoogle} from '@/lib/discovery/google';
const env={KIRA_GOOGLE_CLIENT_ID:'test-client',KIRA_GOOGLE_CLIENT_SECRET:'test-secret',KIRA_GOOGLE_CREDENTIAL_KEY:Buffer.alloc(32,5).toString('base64'),KIRA_AI_RECORDING_KEY:'test-capability',NEXT_PUBLIC_APP_URL:'https://kira.example'};
const config=googleConfig(env)!;
const credential={accessToken:'test-access-token',refreshToken:'test-refresh-token',expiresAt:1000};
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('Google Search Console read-only provider',()=>{
  it.each(['https://','https://kira.example/path','https://u:p@kira.example','https://kira.example:123','http://kira.example'])('fails closed for unsafe origin %s',origin=>expect(googleConfig({...env,NEXT_PUBLIC_APP_URL:origin})).toBeNull());
  it('requires all credentials and a canonical 32-byte key',()=>{
    expect(googleConfig({})).toBeNull();expect(googleConfig({...env,KIRA_AI_RECORDING_KEY:''})).toBeNull();
    expect(googleConfig({...env,KIRA_GOOGLE_CREDENTIAL_KEY:'weak'})).toBeNull();
    expect(googleConfig({...env,KIRA_GOOGLE_CREDENTIAL_KEY:env.KIRA_GOOGLE_CREDENTIAL_KEY+'!'})).toBeNull();
  });
  it('binds encrypted tokens to author, actor and authenticated ciphertext',()=>{
    const sealed=encryptGoogle(credential,config.key,'author-a','actor-a');
    expect(sealed).not.toContain('test-access-token');expect(decryptGoogle(sealed,config.key,'author-a','actor-a')).toEqual(credential);
    expect(()=>decryptGoogle(sealed,config.key,'author-b','actor-a')).toThrow();
    expect(()=>decryptGoogle(sealed,config.key,'author-a','actor-b')).toThrow();
    const parts=sealed.split('.');parts[3]=(parts[3][0]==='A'?'B':'A')+parts[3].slice(1);
    expect(()=>decryptGoogle(parts.join('.'),config.key,'author-a','actor-a')).toThrow();
  });
  it('requests only read-only search access with state and PKCE',()=>{
    const url=new URL(authorizationUrl(config,'test-state','test-verifier'));
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('scope')).toBe(googleScope);expect(url.searchParams.get('state')).toBe('test-state');
    expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256').update('test-verifier').digest('base64url'));
    expect(url.searchParams.get('redirect_uri')).toBe(config.callback);expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.toString()).not.toContain('test-secret');
  });
  it.each([
    ['2026-09-24T00:00:00Z','2026-09-20','2026-08-24'],
    ['2026-03-09T07:30:00Z','2026-03-06','2026-02-07'],
    ['2026-11-02T07:30:00Z','2026-10-29','2026-10-02'],
  ])('uses 28 Pacific calendar dates ending three days before %s',(now,until,since)=>expect(googleDateRange(new Date(now))).toEqual({until,since}));
  it('exchanges code server-side and retains refresh token when refreshing',async()=>{
    const fetcher=vi.fn(async (_url:string,init:RequestInit)=>{const body=init.body as URLSearchParams;expect(body.get('client_secret')).toBe('test-secret');return Response.json({access_token:'new-access',...(body.get('grant_type')==='authorization_code'?{refresh_token:'new-refresh',scope:googleScope}:{}),token_type:'Bearer',expires_in:3600});});
    vi.stubGlobal('fetch',fetcher);
    const exchanged=await exchangeGoogleCode(config,'one-time-code','verifier');expect(exchanged.refreshToken).toBe('new-refresh');
    const refreshed=await refreshGoogle(config,credential);expect(refreshed.refreshToken).toBe(credential.refreshToken);
    expect(fetcher.mock.calls.every(([url])=>url==='https://oauth2.googleapis.com/token')).toBe(true);
    expect((fetcher.mock.calls[0][1].body as URLSearchParams).get('code_verifier')).toBe('verifier');
  });
  it.each([{scope:undefined},{scope:'https://www.googleapis.com/auth/webmasters'}, {scope:googleScope+' https://www.googleapis.com/auth/webmasters'},{scope:googleScope,refresh_token:undefined},{scope:googleScope,token_type:'Basic'}])('rejects missing or wider grant %#',async override=>{
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({access_token:'access',refresh_token:'refresh',token_type:'Bearer',expires_in:3600,...override})));
    await expect(exchangeGoogleCode(config,'code','verifier')).rejects.toThrow(/Reconnect Google/);
  });
  it('does not refresh a current credential',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const current={...credential,expiresAt:Date.now()+120000};
    expect(await refreshGoogle(config,current)).toEqual(current);expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['transport','json','body limit'])('sanitizes %s failures',async kind=>{
    vi.stubGlobal('fetch',vi.fn(async()=>{if(kind==='transport')throw new Error('test-secret private-token');if(kind==='json')return new Response('private-token not json');return new Response('x'.repeat(3000001));}));
    await expect(exchangeGoogleCode(config,'code','verifier')).rejects.toThrow('Reconnect Google or try the report again later.');
  });
  it('filters unverified properties and does not read a property without current access',async()=>{
    const fetcher=vi.fn(async()=>Response.json({siteEntry:[{siteUrl:'sc-domain:allowed.example',permissionLevel:'siteOwner'},{siteUrl:'sc-domain:unverified.example',permissionLevel:'siteUnverifiedUser'}]}));
    vi.stubGlobal('fetch',fetcher);expect(await googleProperties('access')).toEqual([{siteUrl:'sc-domain:allowed.example',permissionLevel:'siteOwner'}]);
    await expect(fetchGoogleSearch('access','sc-domain:unverified.example')).rejects.toThrow(/Reconnect/);expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('uses separate aggregate data, keeps missing dates absent, and reports provenance',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-24T12:00:00Z'));
    const fetcher=vi.fn(async(url:string,init:RequestInit)=>{
      if(url.endsWith('/sites'))return Response.json({siteEntry:[{siteUrl:'sc-domain:author.example',permissionLevel:'siteRestrictedUser'}]});
      expect(url).toContain('sc-domain%3Aauthor.example/searchAnalytics/query');
      const body=JSON.parse(String(init.body));expect(body).toMatchObject({dataState:'final',type:'web',rowLimit:10000});
      expect(init.redirect).toBe('error');expect(init.cache).toBe('no-store');
      return Response.json({rows:body.dimensions.length?[{keys:['2026-09-20'],clicks:2,impressions:20,ctr:.1,position:3}]:[{clicks:3,impressions:30,ctr:.1,position:4}]});
    });vi.stubGlobal('fetch',fetcher);
    const result=await fetchGoogleSearch('access','sc-domain:author.example');
    expect(result.data_origin).toBe('google_api');expect(result.rows).toHaveLength(1);expect(result.totals?.clicks).toBe(3);expect(result.warning).toMatch(/Missing dates remain unknown/);
  });
  it('leaves aggregate totals unknown when the provider supplies none',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/sites')?Response.json({siteEntry:[{siteUrl:'sc-domain:author.example',permissionLevel:'siteFullUser'}]}):Response.json({})));
    const result=await fetchGoogleSearch('access','sc-domain:author.example');expect(result.rows).toEqual([]);expect(result.totals).toBeNull();
  });
});
