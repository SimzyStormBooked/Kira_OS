import { PlansPage } from "@/components/kira/plans-page";
export const metadata = { title: "Marketing Plan" };
export default async function Page({params}:{params:Promise<{id:string}>}) { const {id}=await params; return <PlansPage key={id} id={id}/>; }
