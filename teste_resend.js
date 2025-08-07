// Arquivo: teste_resend.js

async function testarEnvioResend() {
    console.log("Iniciando teste de envio com Resend...");

    // 1. CONFIGURE ESTAS VARIÁVEIS
    const apiKey = 're_EMjJAvN8_KzBFTwU3GZtCTZBUtzUPzvD6'; // <-- MUITO IMPORTANTE: Cole sua Chave de API do Resend aqui.
    const emailParaEnviar = 'ajosenildosilva@gmail.com'; // <-- Coloque um e-mail que você possa acessar para receber o teste.
    const emailRemetente = 'nao-responda@taskcom.iadev.app'; // <-- Este deve ser o e-mail que você configurou no Supabase.

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                from: `TasKCom <${emailRemetente}>`,
                to: [emailParaEnviar],
                subject: 'Teste de Envio Direto via API Resend',
                html: '<h1>Olá!</h1><p>Se você recebeu este e-mail, a sua chave de API e domínio no Resend estão funcionando perfeitamente!</p>'
            })
        });

        const data = await response.json();

        if (response.ok) {
            console.log("✅ SUCESSO! E-mail enviado.");
            console.log("Resposta da API:", data);
        } else {
            console.error("❌ FALHA! O Resend retornou um erro.");
            console.error("Status da Resposta:", response.status);
            console.error("Detalhes do Erro:", data);
        }

    } catch (error) {
        console.error("❌ ERRO CRÍTICO! Não foi possível conectar com a API do Resend.");
        console.error("Detalhes:", error.message);
    }
}

// Executa a função de teste
testarEnvioResend();