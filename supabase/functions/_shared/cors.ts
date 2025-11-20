// supabase/functions/_shared/cors.ts (Versão Corrigida)

/* export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', // <-- A LINHA QUE FALTAVA
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}*/

/* export const corsHeaders = {
  'Access-Control-Allow-Origin': 'http://localhost:3000', // Libera seu frontend local
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};*/

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Permite qualquer origem (ótimo para desenvolvimento local)
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE', // Métodos permitidos
};