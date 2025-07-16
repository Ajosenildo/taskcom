// Arquivo: supabase/functions/fix-my-admin/index.ts (Versão Corrigida)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Pega o ID do usuário do corpo da requisição
    const { user_id } = await req.json();
    if (!user_id) {
      throw new Error("O 'user_id' do administrador a ser corrigido é obrigatório.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Busca o perfil desse usuário na tabela public.usuarios
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('usuarios')
      .select('empresa_id, cargo_id')
      .eq('id', user_id)
      .single();

    if (profileError) throw new Error(`Perfil não encontrado para o user_id: ${user_id}`);

    // Garante que o cargo do usuário é de fato um admin
    const { data: cargo, error: cargoError } = await supabaseAdmin
      .from('cargos')
      .select('is_admin')
      .eq('id', profile.cargo_id)
      .single();

    if (cargoError) throw new Error(`Cargo não encontrado para o cargo_id: ${profile.cargo_id}`);
    if (!cargo.is_admin) throw new Error("O usuário especificado não tem um cargo de Administrador.");

    // Finalmente, atualiza os metadados do usuário na autenticação
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user_id,
      {
        app_metadata: {
          empresa_id: profile.empresa_id,
          cargo_id: profile.cargo_id,
          is_admin: true
        }
      }
    )

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ message: "Metadados do admin atualizados com sucesso!", user: updatedUser.user.email }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})