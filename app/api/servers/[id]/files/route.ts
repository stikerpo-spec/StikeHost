import { NextResponse } from 'next/server';
import { db } from '../../../../../lib/db';
import { getSession } from '../../../../../lib/auth';
import { worker } from '../../../../../lib/worker';

async function owned(id:string,uid:string){return db.server.findFirst({where:{id,ownerId:uid}})}
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  const uid=await getSession(); const {id}=await params; if(!uid)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!(await owned(id,uid)))return NextResponse.json({error:'Not found'},{status:404});
  try{const name=new URL(req.url).searchParams.get('name');return NextResponse.json(await worker(`/v1/servers/${id}/${name?'file?name='+encodeURIComponent(name):'files'}`))}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'File service unavailable'},{status:502})}
}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  const uid=await getSession(); const {id}=await params; if(!uid)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!(await owned(id,uid)))return NextResponse.json({error:'Not found'},{status:404});
  try{return NextResponse.json(await worker(`/v1/servers/${id}/file`,{method:'POST',body:JSON.stringify(await req.json())}))}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'File save failed'},{status:500})}
}
