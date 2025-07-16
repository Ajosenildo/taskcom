// supabase/functions/create-user/index.ts (Versão Definitiva e Robusta)
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

    const supabaseAdmin = createClient(
      Deno.env.get('TAS_KOND_URL') ?? '',
      Deno.env.get('TAS_KOND_SERVICE_ROLE_KEY') ?? ''
    );

    // Obtém o usuário admin que está fazendo a chamada
    const { data: { user: adminAuthUser } } = await supabaseAdmin.auth.getUser(req.headers.get('Authorization')!.replace('Bearer ', ''));
    if (!adminAuthUser) throw new Error("Token de administrador inválido.");

    // CORREÇÃO: Busca o perfil do admin na tabela 'usuarios' para obter o empresa_id de forma confiável
    const { data: adminProfile, error: profileFetchError } = await supabaseAdmin
      .from('usuarios')
      .select('empresa_id', 'cargos_id')
      .eq('id', adminAuthUser.id)
      .single();

    if (profileFetchError) throw new Error("Perfil do administrador não encontrado.");
    const empresa_id = adminProfile?.empresa_id;
    if (!empresa_id) throw new Error("Administrador não está associado a uma empresa.");
    
    // Etapa 1: Cria o usuário na autenticação com a senha provisória
    const { data: authResponse, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      app_metadata: { empresa_id, cargo_id }
    });
    if (createUserError) throw createUserError;
    newAuthUserId = authResponse.user.id;

    const { error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(
      newAuthUserId,
      { app_metadata: { ...authResponse.user.app_metadata, 'empresa_id': empresa_id, 'cargo_id': cargo_id, 'is_admin': false } }
    );
    if (updateUserError) {
        // Se a atualização falhar, delete o usuário recém-criado para não deixar lixo
        await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
        throw updateUserError;
    }

    // Etapa 2: Insere o perfil na tabela 'public.usuarios', já como ativo
    const { error: insertProfileError } = await supabaseAdmin.from('usuarios').insert({ 
      id: newAuthUserId, nome_completo, empresa_id, cargo_id, ativo: true
    });
    if (insertProfileError) {
      await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
      throw insertProfileError;
    }

    return new Response(JSON.stringify(authResponse.user), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
  }
})