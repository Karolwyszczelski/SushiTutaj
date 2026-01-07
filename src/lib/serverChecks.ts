
import 'server-only'
import { createServerClient } from '@supabase/ssr'

const server = () =>
  createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: () => undefined, set: () => {}, remove: () => {} } }
  )

export async function isOrderingOpenNow(restaurantId: string, now: Date) {
  const supabase = server()
  const { data: closures } = await supabase.from('closure_windows').select('*').eq('restaurant_id', restaurantId).eq('is_active', true)
  const ts = now.getTime(); const weekday = now.getDay()
  const inClosure = (closures ?? []).some((c: any) => {
    const st = c.start_time ? new Date(c.start_time).getTime() : null
    const en = c.end_time ? new Date(c.end_time).getTime() : null
    const match = c.weekday !== null ? (c.weekday === weekday) : true
    if (!match) return false
    if (st && en) return ts >= st && ts <= en
    return false
  })
  return !inClosure
}

export async function isAddressBlocked(restaurantId: string, address: string) {
  const supabase = server()
  const norm = address.trim().toLowerCase()
  const { data: rows } = await supabase.from('blocked_addresses').select('pattern,type,active').eq('restaurant_id', restaurantId).eq('active', true)
  return (rows ?? []).some((r: any) => {
    const p = String(r.pattern || '').toLowerCase()
    if (r.type === 'exact') return norm === p
    if (r.type === 'prefix') return norm.startsWith(p)
    if (r.type === 'contains') return norm.includes(p)
    return false
  })
}

export async function getDrivingDistanceKm(restaurantId: string, address: string) {
  const supabase = server()
  const { data: r } = await supabase.from('restaurants').select('lat,lon,max_delivery_km').eq('id', restaurantId).maybeSingle()
  if (!r?.lat || !r?.lon) return { km: null, maxKm: r?.max_delivery_km ?? null }
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return { km: null, maxKm: r.max_delivery_km ?? null }
  const params = new URLSearchParams({ origins: `${r.lat},${r.lon}`, destinations: address, key })
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`
  const res = await fetch(url); if (!res.ok) return { km: null, maxKm: r.max_delivery_km ?? null }
  const json = await res.json(); const el = json?.rows?.[0]?.elements?.[0]
  const meters = el?.distance?.value; const km = typeof meters === 'number' ? meters / 1000 : null
  return { km, maxKm: r.max_delivery_km ?? null }
}
