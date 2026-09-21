import { describe,it,expect,vi,afterEach } from "vitest";
import { parseCsv, importAdsCsv } from "@/lib/ads/csv";
const header='Day,Ad ID,Ad name,Campaign ID,Campaign name,Amount spent (USD),Impressions,Link clicks';
const row='2026-09-07,123,"Cover, variation A",456,Launch,12.5,1000,20';
afterEach(()=>vi.useRealTimers());
describe("manual Meta exports",()=>{
 it("parses quoted cells and creates an explicitly manual snapshot",()=>{vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-22T12:00:00Z"));const s=importAdsCsv(`${header}\r\n${row}`,"2026-09-07","2026-09-20","America/Phoenix","USD","My account");expect(s.data_origin).toBe("manual_snapshot");expect(s.attribution).toBe("not_verified");expect(s.rows[0].adName).toBe("Cover, variation A");expect(s.rows[0].purchases).toBeNull();});
 it("rejects duplicate ad/day breakdowns and currency mismatch",()=>{vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-22T12:00:00Z"));expect(()=>importAdsCsv(`${header}\n${row}\n${row}`,"2026-09-07","2026-09-20","America/Phoenix","USD","Test")).toThrow(/Duplicate/);expect(()=>importAdsCsv(`${header}\n${row}`,"2026-09-07","2026-09-20","America/Phoenix","EUR","Test")).toThrow(/currency/);});
 it("rejects incomplete dates, unbalanced quotes, and summary windows",()=>{expect(()=>parseCsv('a,b\n"unfinished')).toThrow();expect(()=>importAdsCsv(`${header}\n${row}`,"2026-09-07","2026-09-09","America/Phoenix","USD","Test")).toThrow(/14/);expect(()=>importAdsCsv(`${header},Reporting ends\n${row},2026-09-20`,"2026-09-07","2026-09-20","America/Phoenix","USD","Test")).toThrow();});
});
