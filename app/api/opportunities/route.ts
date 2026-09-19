import { NextResponse } from "next/server";
import { requireWorkspaceSession } from "@/lib/auth/session";
import { catalogBookSchema, catalogOpportunities } from "@/lib/catalog/opportunities";
import { libraryFailure, privateHeaders } from "@/lib/manuscripts/http";
export async function GET(){try{const session=await requireWorkspaceSession();const {data,error}=await session.supabase.rpc("catalog_observations",{a:session.authorId});if(error)throw error;const books=catalogBookSchema.array().parse(data);return NextResponse.json({books,opportunities:catalogOpportunities(books)},{headers:privateHeaders});}catch(error){return libraryFailure(error);}}
