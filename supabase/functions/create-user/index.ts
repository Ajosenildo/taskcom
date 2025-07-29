import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseAdmin = createClient(
  Deno.env.get('TAS_KOND_URL') ?? '',
  Deno.env.get('TAS_KOND_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, password, nome_completo, cargo_id } = await req.json();

    // 1. Criação do usuário no Auth
    const { data: authResponse, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome_completo, cargo_id }
    });
    if (authError) throw authError;

    // 2. Inserção na tabela usuarios
    const { error: profileError } = await supabaseAdmin
      .from('usuarios')
      .insert({
        id: authResponse.user.id,
        nome_completo,
        cargo_id,
        empresa_id: 1, // Substitua por um valor dinâmico ou obtenha do admin
        ativo: true
      });
    
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authResponse.user.id);
      throw profileError;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})