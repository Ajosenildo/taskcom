// js/set-password.js
import { supabaseClient } from './supabaseClient.js';

const setPasswordForm = document.getElementById('set-password-form');
const messageArea = document.getElementById('message-area');

// Função para ativar o usuário no nosso banco de dados público
async function activateUser(userId) {
    const { error } = await supabaseClient
        .from('usuarios')
        .update({ ativo: true })
        .eq('id', userId);
    if (error) throw error;
}

// Handler do formulário
setPasswordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    messageArea.textContent = '';
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (newPassword.length < 6) { return messageArea.textContent = 'A senha deve ter no mínimo 6 caracteres.'; }
    if (newPassword !== confirmPassword) { return messageArea.textContent = 'As senhas não coincidem.'; }

    const { data, error } = await supabaseClient.auth.updateUser({ password: newPassword });

    if (error) { return messageArea.textContent = 'Erro ao atualizar senha: ' + error.message; }

    if (data.user) {
        try {
            await activateUser(data.user.id);
            messageArea.style.color = 'green';
            messageArea.textContent = "Senha definida e usuário ativado com sucesso! Você será redirecionado para a tela de login em 5 segundos...";
            setTimeout(() => { window.location.href = '/'; }, 5000);
        } catch (activateError) {
            messageArea.textContent = "Sua senha foi definida, mas houve um erro ao ativar seu perfil. Contate o administrador.";
        }
    }
});

// Este listener confirma que o usuário chegou aqui por um link válido
supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' && session) {
        console.log("Página de definição de senha carregada corretamente.");
    }
});