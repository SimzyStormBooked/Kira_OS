import {EventEmitter} from 'node:events';
import type {RequestOptions} from 'node:https';
import type {IncomingMessage} from 'node:http';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const network=vi.hoisted(()=>({lookup:vi.fn(),request:vi.fn()}));
vi.mock('server-only',()=>({}));vi.mock('node:dns/promises',()=>({lookup:network.lookup}));vi.mock('node:https',()=>({request:network.request}));
import {auditPage,auditUrl,parseAuditHtml,publicAddress} from '@/lib/discovery/audit';
type Reply={status:number;body?:string;location?:string;type?:string;encoding?:string};
const page='https://author.example.com/book';
const html='<title>A book by an author</title><meta name="description" content="A public introduction"><link rel="canonical" href="/book"><h1>A book</h1>';
function replies(values:Reply[]){
  network.request.mockImplementation((_url:URL,_options:RequestOptions,callback:(res:IncomingMessage)=>void)=>{
    const value=values.shift();if(!value)throw new Error('Unexpected request');
    const req=Object.assign(new EventEmitter(),{destroy:vi.fn(),end:()=>queueMicrotask(()=>{
      const res=Object.assign(new EventEmitter(),{statusCode:value.status,headers:{location:value.location,'content-type':value.type??'text/html','content-encoding':value.encoding},destroy:vi.fn()});
      callback(res as unknown as IncomingMessage);if(value.body)res.emit('data',Buffer.from(value.body));res.emit('end');
    })});return req;
  });
}
beforeEach(()=>{vi.clearAllMocks();network.lookup.mockResolvedValue([{address:'93.184.216.34',family:4}]);});
afterEach(()=>vi.useRealTimers());
describe('public author-page audits',()=>{
  it.each(['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','100.64.0.1','0.0.0.0','224.0.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1'])('rejects non-public DNS address %s',address=>expect(publicAddress(address)).toBe(false));
  it('recognizes public IPv4 and IPv6',()=>{expect(publicAddress('93.184.216.34')).toBe(true);expect(publicAddress('2606:4700:4700::1111')).toBe(true);});
  it.each(['https://127.0.0.1/','https://[::1]/','https://author.local/','https://author.example.com/login','http://author.example.com/book','https://u:p@author.example.com/book','https://author.example.com:8443/book','https://author.example.com/book?token=x'])('refuses unsafe page URL %s',url=>expect(()=>auditUrl(url)).toThrow());
  it('pins the vetted DNS address for both Node lookup callback shapes',async()=>{
    replies([{status:200,body:'User-agent: *\nAllow: /'},{status:200,body:html}]);
    const result=await auditPage(page);expect(result.title).toBe('A book by an author');expect(result.findings).toEqual([]);
    expect(network.lookup).toHaveBeenCalledTimes(2);
    const options=network.request.mock.calls[1][1] as RequestOptions;
    expect(options).toMatchObject({agent:false,family:4});
    const callback=vi.fn();options.lookup!('author.example.com',{all:false},callback);expect(callback).toHaveBeenLastCalledWith(null,'93.184.216.34',4);
    options.lookup!('author.example.com',{all:true},callback);expect(callback).toHaveBeenLastCalledWith(null,[{address:'93.184.216.34',family:4}]);
  });
  it('checks all DNS answers before making a request',async()=>{
    network.lookup.mockResolvedValue([{address:'93.184.216.34',family:4},{address:'127.0.0.1',family:4}]);
    await expect(auditPage(page)).rejects.toMatchObject({code:'page_unavailable'});expect(network.request).not.toHaveBeenCalled();
  });
  it('rechecks DNS between robots and page fetch to block rebinding',async()=>{
    network.lookup.mockResolvedValueOnce([{address:'93.184.216.34',family:4}]).mockResolvedValueOnce([{address:'169.254.169.254',family:4}]);
    replies([{status:404}]);await expect(auditPage(page)).rejects.toMatchObject({code:'page_unavailable'});expect(network.request).toHaveBeenCalledTimes(1);
  });
  it('obeys robots and never fetches a disallowed page',async()=>{
    replies([{status:200,body:'User-agent: *\nDisallow: /book'}]);
    await expect(auditPage(page)).rejects.toMatchObject({code:'robots_blocked'});expect(network.request).toHaveBeenCalledTimes(1);
  });
  it('fails closed if the robots file cannot be read',async()=>{
    replies([{status:503}]);await expect(auditPage(page)).rejects.toMatchObject({code:'robots_blocked'});
  });
  it('does not follow a redirect into private infrastructure',async()=>{
    replies([{status:404},{status:302,location:'https://127.0.0.1/private'}]);
    await expect(auditPage(page)).rejects.toThrow();expect(network.request).toHaveBeenCalledTimes(2);
  });
  it('checks the destination origin robots before following a public redirect',async()=>{
    replies([{status:404},{status:301,location:'https://other.example.com/book'},{status:200,body:'User-agent: KiraDiscovery\nDisallow: /'}]);
    await expect(auditPage(page)).rejects.toMatchObject({code:'robots_blocked'});
    expect(String(network.request.mock.calls[2][0])).toBe('https://other.example.com/robots.txt');
  });
  it('bounds redirect chains',async()=>{
    replies([{status:404},...Array.from({length:4},()=>({status:302,location:'/book'}))]);
    await expect(auditPage(page)).rejects.toMatchObject({code:'page_unavailable'});expect(network.request).toHaveBeenCalledTimes(5);
  });
  it.each([{status:200,encoding:'gzip',body:'compressed'}, {status:200,type:'application/pdf',body:'not HTML'},{status:403,body:html},{status:200,body:'x'.repeat(2000001)}])('rejects unsupported or oversized responses %#',async response=>{
    replies([{status:404},response]);await expect(auditPage(page)).rejects.toMatchObject({code:'page_unavailable'});
  });
  it('bounds a hung DNS resolution',async()=>{
    vi.useFakeTimers();network.lookup.mockReturnValue(new Promise(()=>{}));
    const assertion=expect(auditPage(page)).rejects.toMatchObject({code:'page_unavailable'});
    await vi.advanceTimersByTimeAsync(5001);await assertion;expect(network.request).not.toHaveBeenCalled();
  });
  it('bounds a hanging HTTPS response',async()=>{
    vi.useFakeTimers();network.request.mockImplementation(()=>Object.assign(new EventEmitter(),{destroy:vi.fn(),end:vi.fn()}));
    const assertion=expect(auditPage(page)).rejects.toMatchObject({code:'page_unavailable'});
    await vi.advanceTimersByTimeAsync(12001);await assertion;
  });
  it('preserves observed evidence while avoiding ranking or traffic claims',()=>{
    const result=parseAuditHtml('<title>Blank Page | Author</title><h1>Newsletter signup</h1><img alt="cover.jpg"><meta name="robots" content="noindex">',page);
    expect(result.title).toBe('Blank Page | Author');expect(result.canonical).toBeNull();expect(result.description).toBeNull();
    expect(result.findings.map(f=>f.code)).toEqual(expect.arrayContaining(['page_title','description','headings','canonical','cover_alternatives','noindex']));
    expect(result.findings.find(f=>f.code==='headings')?.suggestion).toMatch(/not evidence of a Google penalty/);
  });
  it('handles deeply nested HTML without recursive traversal overflow',()=>{
    const result=parseAuditHtml('<div>'.repeat(12000)+'<h1>Observed heading</h1>'+'</div>'.repeat(12000),page);
    expect(result.h1).toEqual(['Observed heading']);
  });
});
