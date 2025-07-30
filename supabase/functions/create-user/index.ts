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

    // 1. Validação básica
    if (!email || !password || !nome_completo || !cargo_id) {
      throw new Error("Todos os campos são obrigatórios");
    }

    // 2. Obter empresa_id do token JWT (do admin logado)
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
      throw new Error("Token de autenticação não fornecido");
    }

    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    
    if (!user) {
      throw new Error("Usuário não autenticado");
    }

    // 3. Buscar empresa_id do admin logado
    const { data: adminData, error: adminError } = await supabaseAdmin
      .from('usuarios')
      .select('empresa_id')
      .eq('id', user.id)
      .single();

    if (adminError || !adminData) {
      throw new Error("Dados do administrador não encontrados");
    }

    // 4. Criar usuário no Auth
    const { data: authResponse, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome_completo, cargo_id }
    });

    if (authError) throw authError;

    // 5. Criar perfil na tabela usuarios
    const { error: profileError } = await supabaseAdmin
      .from('usuarios')
      .insert({
        id: authResponse.user.id,
        nome_completo,
        cargo_id,
        empresa_id: adminData.empresa_id,
        ativo: true
      });

    if (profileError) {
      // Rollback: deletar usuário do Auth se falhar na tabela usuarios
      await supabaseAdmin.auth.admin.deleteUser(authResponse.user.id);
      throw profileError;
    }

    return new Response(
      JSON.stringify({ success: true, userId: authResponse.user.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
})