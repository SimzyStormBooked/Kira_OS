import Link from "next/link";
import {getWorkspaceConfig} from "@/lib/config";
import {loadDiscoveryView} from "@/lib/discovery/repository";
import {DiscoveryDashboard} from "@/components/kira/discovery/dashboard";
export const metadata={title:'Find Your Readers'};
export default async function Page({searchParams}:{searchParams:Promise<{connection?:string}>}){if(getWorkspaceConfig().mode==='demo')return <div className="page-heading"><div><span className="eyebrow">DEMO / DISCOVERY</span><h1>Find your readers</h1><p>Website checks, saved listing reviews, and private search reports are available in the connected workspace. No real data or account connections are simulated here.</p><Link href="/universe">Explore the sample catalog</Link></div></div>;const params=await searchParams;return <DiscoveryDashboard initial={await loadDiscoveryView()} connectionResult={params.connection}/>;}
