// js/auth.js
import { supabaseClient } from './supabaseClient.js';


export async function login() {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    if (!email || !password) {
        return alert("Preencha email e senha.");
    }
    
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    console.log("Login response:", { data, error });

    if (error) {
        return alert("Email ou senha inválidos.");
    }

    setTimeout(() => {
        location.reload();
    }, 500);
}


export async function logout() {
    console.log("Iniciando processo de logout...");

    try {
        // Cria uma promessa de "timeout" que será rejeitada após 5 segundos.
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Logout no servidor demorou demais (timeout).')), 2000)
        );

        // Colocamos o signOut do Supabase para "correr" contra o nosso timeout.
        // O que acontecer primeiro (o logout ou o fim dos 5 segundos) determinará o resultado.
        await Promise.race([
            supabaseClient.auth.signOut(),
            timeoutPromise
        ]);

        console.log("Logout no servidor Supabase concluído com sucesso.");

    } catch (error) {
        console.error("Ocorreu um erro ou timeout durante o signOut:", error.message);
        // Independentemente do erro, o processo continuará no bloco 'finally'.
        
    } finally {
        // ESTE BLOCO DE CÓDIGO É EXECUTADO SEMPRE
        console.log("Limpando dados da sessão local e recarregando a página.");
        
        // Limpa a sessão temporária (se houver algo lá)
        sessionStorage.clear(); 
        
        // --- NOVA LINHA OBRIGATÓRIA ---
        // Limpa a sessão persistente (token de login) para garantir a saída
        localStorage.clear(); 
        // ------------------------------

        location.reload();
    }
}

// checkSession
export async function checkSession() {
    const { data, error } = await supabaseClient.auth.getUser();
    console.log("Check session response:", { data, error });
    if (!data?.user) {
        return { status: 'NO_SESSION' };
    }
    return { status: 'AUTHENTICATED', user: data.user };
}