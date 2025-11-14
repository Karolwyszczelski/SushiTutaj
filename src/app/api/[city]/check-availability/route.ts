
import { NextResponse } from 'next/server'
import { isOrderingOpenNow, isAddressBlocked, getDrivingDistanceKm } from '@/lib/serverChecks'
import { createServerClient } from '@supabase/ssr'

export const runtime='nodejs'; export const dynamic='force-dynamic'

async function getRestaurantBySlug(slug: string){
  const s = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { get:()=>undefined, set:()=>{}, remove:()=>{} } })
  const { data } = await s.from('restaurants').select('*').eq('slug', slug).maybeSingle()
  return data
}

export async function POST(req: Request, { params }: { params: { city: string } }){
  const r = await getRestaurantBySlug(params.city)
  if(!r) return NextResponse.json({ error: 'Brak restauracji' }, { status: 404 })
  const { address, method } = await req.json()
  const open = await isOrderingOpenNow(r.id, new Date())
  if(!open) return NextResponse.json({ error: 'Zamówienia chwilowo wstrzymane' }, { status: 403 })
  if(method === 'delivery'){
    const blocked = await isAddressBlocked(r.id, String(address||''))
    if(blocked) return NextResponse.json({ error: 'Adres zablokowany' }, { status: 403 })
    const { km, maxKm } = await getDrivingDistanceKm(r.id, String(address||''))
    if(km != null && maxKm != null && km > maxKm) return NextResponse.json({ error: `Poza zasięgiem (${km.toFixed(1)} km)` }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
