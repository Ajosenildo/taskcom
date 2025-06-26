// js/supabaseClient.js
// O objeto 'supabase' vem do script do CDN.
// As variáveis SUPABASE_URL e SUPABASE_ANON_KEY vêm do config.js.
export const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);