import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // <-- MUDANÇA 1: Adicionado 'segmentoId' para receber o dado do front-end
    const {
      companyName,
      cnpj,
      phone,
      fullName,
      email,
      password,
      planName,
      segmentoId
    } = await req.json();

    // <-- MUDANÇA 2: Adicionado 'segmentoId' à lista de campos obrigatórios
    if (!companyName || !fullName || !email || !password || !planName || !cnpj || !phone || !segmentoId) {
      throw new Error("Todos os campos do formulário são obrigatórios.");
    }
    if (password.length < 6) {
      throw new Error("A senha deve ter no mínimo 6 caracteres.");
    }
    
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: existingCompany, error: companyCheckError } = await supabaseAdmin
      .from('empresas')
      .select('id')
      .eq('cnpj', cnpj)
      .single();

    if (companyCheckError && companyCheckError.code !== 'PGRST116') {
      throw companyCheckError;
    }
    if (existingCompany) {
      return new Response(JSON.stringify({ error: 'Uma empresa com este CNPJ/CPF já está cadastrada.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 409,
      });
    }

    const { data: planData, error: planError } = await supabaseAdmin
      .from('planos')
      .select('id')
      .eq('nome', planName)
      .single();

    if (planError || !planData) {
      throw new Error(`Plano '${planName}' não encontrado ou erro na busca.`);
    }

    const { data: companyData, error: companyError } = await supabaseAdmin
      .from('empresas')
      .insert({
        nome_empresa: companyName,
        plano_id: planData.id,
        status_assinatura: planName === 'Plano Gratuito' ? 'ativa' : 'em_trial',
        trial_inicia_em: planName !== 'Plano Gratuito' ? new Date().toISOString() : null,
        trial_termina_em: planName !== 'Plano Gratuito' ? new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString() : null,
        cnpj: cnpj,
        segmento_id: segmentoId // <-- MUDANÇA 3: Salvando o ID do segmento na tabela 'empresas'
      })
      .select()
      .single();

    if (companyError) throw companyError;

    const { data: cargoData, error: cargoError } = await supabaseAdmin
      .from('cargos')
      .insert({ nome_cargo: 'Administrador', is_admin: true, empresa_id: companyData.id })
      .select('id')
      .single();

    if (cargoError) throw cargoError;

    const { data: authResponse, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome_completo: fullName }
    });

    if (authError) throw authError;
    if (!authResponse.user) throw new Error("Falha ao criar o usuário na autenticação.");

    const { error: profileError } = await supabaseAdmin
      .from('usuarios')
      .insert({
        id: authResponse.user.id,
        nome_completo: fullName,
        email: email,
        cargo_id: cargoData.id,
        empresa_id: companyData.id,
        ativo: true,
        telefone: phone
      });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authResponse.user.id);
      throw profileError;
    }

    return new Response(JSON.stringify({ success: true, userId: authResponse.user.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Erro na função signup-new-company:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});