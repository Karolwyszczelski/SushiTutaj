import 'server-only'
import { createServerClient } from '@supabase/ssr'

const server = () =>
  createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: () => undefined, set: () => {}, remove: () => {} } }
  )

export async function listActiveRestaurants() {
  const supabase = server()
  const { data } = await supabase
    .from('restaurants')
    .select('id,slug,name,city,is_active')
    .eq('is_active', true)
    .order('city')
  return data ?? []
}

export async function getRestaurantBySlug(slug: string) {
  const supabase = server()
  const { data } = await supabase.from('restaurants').select('*').eq('slug', slug).maybeSingle()
  return data ?? null
}
