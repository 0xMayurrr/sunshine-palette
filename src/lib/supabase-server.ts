import { createClient } from '@supabase/supabase-js'

export function getSupabaseAdmin() {
  const supabaseUrl = process.env['VITE_SUPABASE_URL'] || process.env['SUPABASE_URL'] || ''
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] || ''

  if (!supabaseUrl) throw new Error('Missing VITE_SUPABASE_URL env var')
  if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY env var — anon key cannot bypass RLS')

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
