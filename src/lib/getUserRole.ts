import { supabase } from '@/lib/supabase';

export async function getUserRole(): Promise<null | 'admin' | 'employee' | 'client'> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error fetching role:', error);
    return null;
  }

  return data?.role || null;
}
