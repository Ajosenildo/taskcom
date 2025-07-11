// js/auth.js
import { supabaseClient } from './supabaseClient.js';

export async function login() {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    if (!email || !password) return alert("Preencha email e senha.");
    
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return alert("Email ou senha inválidos.");
    // O onAuthStateChange cuidará do resto.
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
        // ESTE BLOCO DE CÓDIGO É EXECUTADO SEMPRE, COM SUCESSO OU FALHA.
        // Isso garante que o usuário seja deslogado da interface.
        console.log("Limpando dados da sessão local e recarregando a página.");
        sessionStorage.clear();
        location.reload();
    }
}

export async function checkSession() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        return { status: 'NO_SESSION' };
    }

    const { data: userProfile, error } = await supabaseClient
      .from("usuarios")
      .select("*, cargo: cargo_id (nome_cargo, is_admin), empresa:empresa_id (nome_empresa)")
      // .select("*, empresa:empresa_id(nome_empresa), cargo: cargo_id (nome_cargo, is_admin)")
      //.select("*, empresa:empresa_id(nome_empresa)")
      .eq("id", user.id)
      .single();

    if (error || !userProfile) {
      console.error("Erro ao buscar perfil ou perfil não encontrado. Deslogando.", error);
      await logout();
      return { status: 'NO_PROFILE' };
    }
    
    sessionStorage.setItem("userProfile", JSON.stringify(userProfile));

    if (!userProfile.ativo) {
        // Apenas informa que está inativo. A decisão será do app.js
        return { status: 'INACTIVE', userProfile: userProfile };
    }
    
    return { status: 'ACTIVE', userProfile: userProfile };
}