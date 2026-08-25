import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TypedSupabaseClient = any

let _client: TypedSupabaseClient | null = null

export function getSupabaseClient(): TypedSupabaseClient {
  if (_client) return _client

  const url = getEnvVar('SUPABASE_URL')
  const anonKey = getEnvVar('SUPABASE_ANON_KEY')

  _client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })

  return _client
}

declare const process: { env: Record<string, string | undefined> } | undefined

function getEnvVar(name: string): string {
  const viteKey = `VITE_${name}`
  const expoKey = `EXPO_PUBLIC_${name}`

  // Try process.env first (Expo / Node)
  if (typeof process !== 'undefined') {
    const val = process.env[expoKey] ?? process.env[name] ?? ''
    if (val) return val
  }

  throw new Error(`Missing environment variable: ${viteKey} or ${expoKey}`)
}

export { createClient }
