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
    await supabaseClient.auth.signOut();
    sessionStorage.clear();
    location.reload();
}

export async function checkSession() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        return { status: 'NO_SESSION' };
    }

    const { data: userProfile, error } = await supabaseClient
      .from("usuarios")
      .select("*, empresa:empresa_id(nome_empresa)")
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