import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Função de validação (mantida)
async function validateTokenAndGetCompany(supabaseAdmin: SupabaseClient, req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Error('Token de acesso ausente.');
  
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError) throw userError;
  if (!user) throw new Error('Usuário não encontrado.');

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('usuarios')
    .select('empresa_id, empresa:empresa_id ( plano:plano_id ( nome ), segmento_id )')
    .eq('id', user.id)
    .single();

  if (profileError) throw new Error('Perfil do administrador não encontrado.');
  return profile;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Validar o token do Admin
    const adminProfile = await validateTokenAndGetCompany(supabaseAdmin, req);
    const { empresa_id, empresa } = adminProfile;

    // 2. Coletar os dados do novo usuário
    const {
      email,
      password,
      nome_completo,
      cargo_id,
      condominio_ids // <<<--- MUDANÇA: AGORA É UM ARRAY
    } = await req.json();

    if (!email || !password || !nome_completo || !cargo_id) {
      throw new Error('Campos obrigatórios ausentes.');
    }

    // 3. Lógica de Negócio (Cargo de Cliente)
    const { data: cargoData, error: cargoError } = await supabaseAdmin
      .from('cargos')
      .select('is_client_role')
      .eq('id', cargo_id)
      .single();

    if (cargoError) throw new Error('Cargo não encontrado.');

    if (cargoData.is_client_role) {
      // 4a. Verifique as regras de negócio
      const isCondominio = empresa.segmento_id === 1;
      const isPlanoIlimitado = empresa.plano.nome === 'Plano Master';

      if (!isPlanoIlimitado || !isCondominio) {
        throw new Error('Cargos do tipo "Cliente" (ex: Síndico) só estão disponíveis para o Plano Master no segmento de Condomínios.');
      }
      
      // 4b. Verifica se pelo menos um condomínio foi enviado
      if (!condominio_ids || !Array.isArray(condominio_ids) || condominio_ids.length === 0) {
        throw new Error('Para usuários do tipo "Cliente", é obrigatório associar pelo menos um condomínio.');
      }

      // 4c. Verifique o limite de 2 usuários
      const { count, error: countError } = await supabaseAdmin
        .from('usuarios')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresa_id)
        .eq('cargo_id', cargo_id); //

      if (countError) throw countError;
      if (count !== null && count >= 2) {
        throw new Error('Limite de 2 usuários do tipo "Cliente" (Síndico/Gerente) atingido para este plano.');
      }
    }
    
    // 5. Verificação de limite de usuários (lógica antiga mantida)
    // ... (bloco de código do limite_usuarios mantido) ...

    // 6. Criar o usuário no Auth
    const { data: authResponse, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome_completo }
    });
    if (authError) throw authError;
    if (!authResponse.user) throw new Error('Falha ao criar usuário no Auth.');

    // 7. Criar o perfil do usuário (sem a coluna de condomínio)
    const { error: profileError } = await supabaseAdmin
      .from('usuarios')
      .insert({
        id: authResponse.user.id,
        nome_completo,
        email,
        cargo_id,
        empresa_id,
        ativo: false
        // <<<--- 'condominio_associado_id' REMOVIDO
      });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authResponse.user.id);
      throw profileError;
    }

    // 8. --- NOVA ETAPA ---
    // Salva as associações na nova tabela, se for um Cliente
    if (cargoData.is_client_role && condominio_ids.length > 0) {
      const assignments = condominio_ids.map((condoId: number) => ({
        usuario_id: authResponse.user!.id,
        condominio_id: condoId
      }));
      
      const { error: assignmentError } = await supabaseAdmin
        .from('usuario_condominio')
        .insert(assignments);

      if (assignmentError) {
        // Se falhar aqui, deleta o usuário criado para não deixar lixo
        await supabaseAdmin.auth.admin.deleteUser(authResponse.user.id);
        throw assignmentError;
      }
    }

    return new Response(JSON.stringify({ success: true, user: authResponse.user }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});