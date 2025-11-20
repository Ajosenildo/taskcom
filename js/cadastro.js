// Importa as configurações do nosso ambiente (local ou produção)
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

document.addEventListener('DOMContentLoaded', function() {

    const form = document.getElementById('signup-form');
    const statusMessage = document.getElementById('status-message');
    const planCards = document.querySelectorAll('.plan-card');
    let selectedPlan = null;

    // --- Função robusta para selecionar plano ---
    function selectPlan(planName) {
        if (!planName) return;
        const normalized = planName.trim();
        let found = false;

        planCards.forEach(card => {
            const cardPlan = (card.dataset.plan || '').trim();
            if (cardPlan === normalized) {
                card.classList.add('selected');
                selectedPlan = normalized;
                found = true;
            } else {
                card.classList.remove('selected');
            }
        });
    }

    // clique manual nos cards
    planCards.forEach(card => {
        card.addEventListener('click', function() {
            selectPlan(this.dataset.plan);
        });
    });

    // --- Tenta ler o plano da URL ---
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const planFromUrl = urlParams.get('plan');
        const initialPlan = (planFromUrl && planFromUrl.trim()) || 'Plano Gratuito';
        selectPlan(initialPlan);
    } catch (error) {
        console.error("Erro ao ler URL, selecionando plano padrão:", error);
        selectPlan('Plano Gratuito');
    }

    // --- SUBMISSÃO ---
    if (form) {
        form.addEventListener('submit', async function(event) {
            event.preventDefault();
            const submitButton = form.querySelector('button[type="submit"]');
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            if (!selectedPlan) {
                statusMessage.textContent = 'Por favor, selecione um plano.';
                statusMessage.className = 'status-error';
                return;
            }
            if (password !== confirmPassword) {
                statusMessage.textContent = 'As senhas não coincidem.';
                statusMessage.className = 'status-error';
                return;
            }

            const formData = {
                companyName: document.getElementById('company-name').value,
                fullName: document.getElementById('full-name').value,
                email: document.getElementById('email').value,
                password: password,
                planName: selectedPlan
            };

            submitButton.disabled = true;
            submitButton.textContent = 'Criando sua conta...';
            statusMessage.className = '';

            try {
                // AGORA a URL é a LOCAL, vinda do config.js
                const response = await fetch(`${SUPABASE_URL}/functions/v1/signup-new-company`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        'apikey': SUPABASE_ANON_KEY // Usa a chave local
                    },
                    body: JSON.stringify(formData)
                });
                
                const result = await response.json();

                if (!response.ok) { throw new Error(result.error || 'Ocorreu um erro desconhecido.'); }
                
                statusMessage.textContent = 'Conta criada! Verifique seu e-mail para confirmar o cadastro e liberar seu acesso.';
                statusMessage.className = 'status-success';
                form.reset();
                selectedPlan = null;
                planCards.forEach(card => card.classList.remove('selected'));

            } catch (error) {
                statusMessage.textContent = `Erro: ${error.message}`;
                statusMessage.className = 'status-error';
                submitButton.disabled = false;
                submitButton.textContent = 'Criar Conta';
            }
        });
    }
});

