import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {csvRows, importSearchCsv} from '@/lib/discovery/csv';
const header='Date,Clicks,Impressions,CTR,Position';
const input=(csv:string,since='2026-09-01',until='2026-09-20')=>importSearchCsv(csv,since,until,'sc-domain:kirastanleyauthor.com');
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-24T12:00:00Z'));});
afterEach(()=>vi.useRealTimers());
describe('Search Console manual snapshots',()=>{
  it('weights position by impressions, derives CTR and keeps missing dates unknown',()=>{
    const snapshot=input(`\uFEFF${header}\r\n2026-09-01,10,100,10%,2\r\n2026-09-03,10,300,3.33%,10`);
    expect(snapshot.data_origin).toBe('manual_snapshot');expect(snapshot.rows).toHaveLength(2);
    expect(snapshot.totals).toEqual({clicks:20,impressions:400,ctr:0.05,position:8});
    expect(snapshot.rows[1].ctr).toBeCloseTo(1/30);expect(snapshot.warning).toMatch(/Missing rows are unknown/);
  });
  it.each(['Top pages','Top queries'])('does not misrepresent %s as site totals',dimension=>{
    const snapshot=input(`${dimension},Clicks,Impressions,CTR,Position\n"A book, with commas",1,20,5%,3`);
    expect(snapshot.rows[0].key).toBe('A book, with commas');expect(snapshot.totals).toBeNull();
  });
  it('supports quoted commas, escaped quotes and embedded newlines',()=>{
    expect(csvRows('a,b\r\n"one, two","line\n""quoted"""')).toEqual([['a','b'],['one, two','line\n"quoted"']]);
  });
  it.each(['a,b\n"unfinished','a,b\na"b,c','a,b\n"a"x,b'])('rejects malformed quotation %s',csv=>expect(()=>csvRows(csv)).toThrow());
  it.each([
    `${header}\n2026-09-01,2,1,200%,1`,
    `${header}\n2026-09-01,1.2,10,12%,1`,
    `${header}\n2026-09-01,-1,10,0%,1`,
    `${header}\n2026-09-01,1,9007199254740993,0%,1`,
    `${header}\n2026-09-01,1,10,10%,-2`,
    `${header}\n2026-08-31,1,10,10%,1`,
    `${header}\n2026-09-01,1,10,10%,1\n2026-09-01,1,10,10%,1`,
    `${header},Query\n2026-09-01,1,10,10%,1,test`,
    `Date,Clicks,Clicks,Impressions,CTR,Position\n2026-09-01,1,1,10,10%,1`,
    `${header}\n2026-09-01,1,10,10%`,
    'Date,Clicks,Impressions,Position\n2026-09-01,1,10,1',
  ])('rejects inconsistent or unsupported source data %#',csv=>expect(()=>input(csv)).toThrow());
  it('rejects future/reversed/overlong dates and missing properties',()=>{
    const csv=`${header}\n2026-09-01,1,10,10%,1`;
    expect(()=>input(csv,'2026-09-01','2026-09-25')).toThrow();
    expect(()=>input(csv,'2026-09-20','2026-09-01')).toThrow();
    expect(()=>input(csv,'2025-01-01','2026-09-20')).toThrow();
    expect(()=>importSearchCsv(csv,'2026-09-01','2026-09-20',' ')).toThrow();
  });
  it('enforces the row limit even if every key is unique',()=>{
    const csv='Query,Clicks,Impressions,CTR,Position\n'+Array.from({length:10001},(_,i)=>`query ${i},1,10,10%,1`).join('\n');
    expect(()=>input(csv)).toThrow();
  });
});
