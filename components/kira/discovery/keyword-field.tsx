"use client";
import {useId,useState} from "react";
import {Input} from "@/components/ui/input";

export function KeywordField({index,initial}:{index:number;initial:string}) {
  const [value,setValue]=useState(initial);
  const hint=useId();
  const field=useId();
  return <div className="discovery-keyword-field"><label htmlFor={field}>Keyword field {index+1}</label><Input id={field} name={`keyword${index}`} value={value} onChange={event=>setValue(event.target.value)} maxLength={200} aria-describedby={hint}/><small id={hint} className="quiet-note">{value.length} characters{value.length>50?' · Longer than KDP’s 50-character guidance. Preserved as a review note.':' · Aim for 50 or fewer for KDP.'}</small></div>;
}
