// supabase/functions/_shared/cors.ts (Versão Corrigida)

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', // <-- A LINHA QUE FALTAVA
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}