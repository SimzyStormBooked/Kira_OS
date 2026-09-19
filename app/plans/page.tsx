import { PlansPage } from "@/components/kira/plans-page";
export const metadata = { title: "Marketing Plans" };
export default async function Page({searchParams}:{searchParams:Promise<{request?:string}>}) { const {request}=await searchParams;return <PlansPage requestId={request}/>; }
