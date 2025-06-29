// supabase/functions/create-user/index.ts (Versão Definitiva)
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') { return new Response('ok', { headers: corsHeaders }) }
  let newAuthUserId: string | undefined;
  try {
    const { email, password, nome_completo, cargo_id } = await req.json();
    if (!email || !password || !nome_completo || !cargo_id) {
      throw new Error("Todos os campos (Email, Senha, Nome, Cargo) são obrigatórios.");
    }
    if (password.length < 6) {
        throw new Error("A senha deve ter no mínimo 6 caracteres.");
    }
    const supabaseAdmin = createClient(Deno.env.get('TAS_KOND_URL') ?? '', Deno.env.get('TAS_KOND_SERVICE_ROLE_KEY') ?? '');
    const { data: { user: adminUser } } = await supabaseAdmin.auth.getUser(req.headers.get('Authorization')!.replace('Bearer ', ''));
    const empresa_id = adminUser?.app_metadata?.empresa_id;
    if (!empresa_id) throw new Error("Administrador não está associado a uma empresa.");

    const { data: authResponse, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      app_metadata: { empresa_id, cargo_id }
    });
    if (createUserError) throw createUserError;
    newAuthUserId = authResponse.user.id;

    const { error: profileError } = await supabaseAdmin.from('usuarios').insert({ 
      id: newAuthUserId, nome_completo, empresa_id, cargo_id, ativo: true
    });
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
      throw profileError;
    }

    return new Response(JSON.stringify(authResponse.user), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
  }
})