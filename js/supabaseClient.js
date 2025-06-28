// js/supabaseClient.js
export const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: sessionStorage, // A MUDANÇA ESTÁ AQUI
    },
});