// supabase/functions/invite-user/index.ts (Versão Definitiva)
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  // Trata a requisição de verificação CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let newAuthUserId: string | undefined;

  try {
    const { email, nome_completo, cargo_id } = await req.json();
    if (!email || !nome_completo || !cargo_id) {
      throw new Error("Email, nome completo e cargo são obrigatórios.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('TAS_KOND_URL') ?? '',
      Deno.env.get('TAS_KOND_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user: adminUser } } = await supabaseAdmin.auth.getUser(req.headers.get('Authorization')!.replace('Bearer ', ''));
    const empresa_id = adminUser?.app_metadata?.empresa_id;
    if (!empresa_id) throw new Error("Administrador não está associado a uma empresa.");

    // Etapa 1: Envia o convite e cria o usuário na autenticação
    const { data: inviteResponse, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      { redirectTo: `${Deno.env.get('TAS_KOND_URL')}/set-password.html` }
    );

    if (inviteError) throw inviteError;
    if (!inviteResponse || !inviteResponse.user) throw new Error("Falha ao receber dados do usuário convidado.");
    
    newAuthUserId = inviteResponse.user.id;

    // Etapa 2: Insere o perfil na tabela 'public.usuarios' explicitamente, com status inativo
    const { error: profileError } = await supabaseAdmin
      .from('usuarios')
      .insert({ 
        id: newAuthUserId, 
        nome_completo: nome_completo, 
        empresa_id: empresa_id,
        cargo_id: cargo_id,
        ativo: false // Começa como inativo
      });

    // Se a criação do perfil falhar, desfaz a criação do convite/usuário para não criar "órfãos"
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
      throw profileError;
    }
    
    return new Response(JSON.stringify(inviteResponse.user), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
})