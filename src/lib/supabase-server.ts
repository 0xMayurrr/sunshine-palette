import { createClient } from '@supabase/supabase-js'

export function getSupabaseAdmin() {
  const supabaseUrl = process.env['VITE_SUPABASE_URL'] || process.env['SUPABASE_URL'] || ''
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env['VITE_SUPABASE_ANON_KEY'] || ''

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase URL or Service Role Key in environment variables')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
