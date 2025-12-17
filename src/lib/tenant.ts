// src/lib/tenant.ts
import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cache } from 'react'

// Tworzymy klienta "tylko do odczytu" danych publicznych
// Nie potrzebujemy tutaj cookies(), bo dane restauracji są publiczne
const createClient = () =>
  createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return [] },
        setAll() {}
      },
    }
  )

export const listActiveRestaurants = cache(async () => {
  const supabase = createClient()
  
  // Upewnij się, że w bazie masz kolumnę 'active' czy 'is_active'.
  // W kodzie admina używałeś 'active', więc tu też to poprawiłem.
  const { data } = await supabase
    .from('restaurants')
    .select('id, slug, name, city, active') 
    .eq('active', true)
    .order('city')

  return data ?? []
})

export const getRestaurantBySlug = cache(async (slug: string) => {
  const supabase = createClient()
  
  // Pobieramy wszystko (*), w tym nowe pola popup_active, popup_title itd.
  const { data } = await supabase
    .from('restaurants')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  return data ?? null
})