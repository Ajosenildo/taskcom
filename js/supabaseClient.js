// js/supabaseClient.js
/* import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: sessionStorage,
  },
});*/

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // MUDANÇA AQUI: De 'sessionStorage' para 'localStorage'
    storage: localStorage, 
    
    // Opções extras para garantir a persistência
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
});
