import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** Instancia única del cliente Supabase para el frontend. */
export const supabase = createClient(supabaseUrl, supabaseKey)
