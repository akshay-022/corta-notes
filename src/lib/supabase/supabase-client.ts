import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Singleton client instance
let supabaseClient: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  // If client already exists, return it
  if (supabaseClient) {
    return supabaseClient
  }

  // Create new client only if it doesn't exist
  supabaseClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  console.log('🔗 Created new Supabase client singleton')
  return supabaseClient
}

// Helper function to reset the singleton (useful for testing or logout)
export function resetClient(): void {
  supabaseClient = null
  console.log('🔄 Reset Supabase client singleton')
} 