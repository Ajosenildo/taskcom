import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  // Trata a requisição pre-flight do CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email } = await req.json()
    if (!email) throw new Error("O e-mail é obrigatório.");

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Gera o link de redefinição de senha (versão sem redirectTo)
    const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
    })
    if (linkError) throw linkError

    const recoveryLink = data.properties.action_link
    const resendApiKey = Deno.env.get('RESEND_API_KEY')

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'Autenticação TasKCom <nao-responda@iadev.app>',
        to: email,
        subject: 'Redefinição de Senha - TasKCom',
         html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                  <h2 style="color: #1e3a8a; text-align: center;">Redefinição de Senha</h2>
                  <p>Olá,</p>
                  <p>Recebemos uma solicitação para redefinir a senha da sua conta no sistema <strong>TasKCom</strong>.</p>
                  <p>Para criar uma nova senha de acesso, por favor, clique no botão seguro abaixo:</p>
                  <p style="text-align: center; margin: 30px 0;">
                    <a href="${recoveryLink}" style="background-color: #1e3a8a; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Redefinir Minha Senha</a>
                  </p>
                  <p>Este link é válido por um tempo limitado. Se você não solicitou esta alteração, pode ignorar este e-mail com segurança.</p>
                  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                  <p style="font-size: 0.8em; color: #888; text-align: center;">Enviado por TasKCom</p>
                </div>
              </div>
            `,
      }),
    })

    if (!res.ok) {
        const errorBody = await res.json();
        throw new Error(JSON.stringify(errorBody));
    }

    return new Response(JSON.stringify({ message: "Link de redefinição enviado com sucesso!" }), {
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