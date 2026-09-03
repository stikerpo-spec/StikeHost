import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret');
export async function setSession(userId:string){ const token=await new SignJWT({sub:userId}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('7d').sign(secret); (await cookies()).set('stikehost_session',token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/'}); }
export async function getSession(){ const token=(await cookies()).get('stikehost_session')?.value; if(!token) return null; try { return (await jwtVerify(token,secret)).payload.sub ?? null } catch { return null } }
