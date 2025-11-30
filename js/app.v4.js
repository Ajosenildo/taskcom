// js/app.v2.js - VERSÃO FINAL, COMPLETA E VERIFICADA

import { supabaseClient } from './supabaseClient.js';
import { login, logout, checkSession } from './auth.v4.js';
import * as ui from './ui.v4.js';
import * as api from './api.v4.js';
import * as render from './render.v4.js';
import * as utils from './utils.v4.js';
import { state } from './state.js';

supabaseClient.auth.getUser().then(({ data, error }) => {
    // console.log("Sessão ao iniciar app:", data, error);
});

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installButton = document.getElementById('install-app-btn');
    if (installButton) installButton.style.display = 'block';

    installButton.addEventListener('click', async () => {
        installButton.style.display = 'none';
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        deferredPrompt = null;
    });
});

// --- ESTADO GLOBAL DA APLICAÇÃO ---
let appInitialized = false;
let listenersInitialized = false;
let isPasswordUpdateInProgress = false;

// Função auxiliar para validar se o responsável pertence ao condomínio
function validarVinculoSindico(responsavelId, condominioId) {
    if (!responsavelId || !condominioId) return true; // Se faltar dados, deixa passar (outras validações pegam)

    // 1. Encontra o usuário responsável
    const responsavel = state.allUsers.find(u => u.id === responsavelId);
    
    // 2. Se não achou ou não é cargo de cliente (é staff interno), permite tudo
    if (!responsavel || !responsavel.cargo || !responsavel.cargo.is_client_role) {
        return true;
    }

    // 3. Verifica se existe o vínculo na lista de associações
    // (Nota: state.allCondoAssignments deve estar carregado pelo fetchInitialData)
    const temVinculo = state.allCondoAssignments.some(
        a => a.usuario_id === responsavelId && a.condominio_id == condominioId
    );

    if (!temVinculo) {
        alert(`Atenção: O usuário "${responsavel.nome_completo}" é um cliente externo (Síndico) e NÃO está vinculado ao condomínio selecionado.\n\nPor favor, selecione um condomínio que pertença a este usuário ou mude o responsável.`);
        return false;
    }

    return true;
}

async function handleCreateTask(event) {
    event.preventDefault();
    const form = event.target;

    // 1. Coleta de Dados
    const title = form.elements['task-title'].value.trim();
    const assigneeId = form.elements['task-assignee'].value;
    const typeId = form.elements['task-type'].value;
    const condominioId = document.getElementById('task-condominio').value; // Input hidden
    const dueDate = form.elements['task-due-date'].value;
    const description = form.elements['task-desc'].value;

    // 2. Validação Básica
    if (!title || !typeId || !condominioId || !dueDate || !assigneeId) {
        return alert('Todos os campos obrigatórios precisam ser preenchidos.');
    }

    // 3. Validação de Regra de Negócio (Síndico x Condomínio)
    // Garante que não estamos atribuindo tarefa de um condomínio errado ao síndico
    if (typeof validarVinculoSindico === 'function') {
        if (!validarVinculoSindico(assigneeId, condominioId)) {
            return; // Para tudo se a validação falhar
        }
    }

    // 4. Montagem do Objeto
    const taskData = {
        titulo: title,
        descricao: description,
        data_conclusao_prevista: dueDate,
        condominio_id: parseInt(condominioId),
        tipo_tarefa_id: parseInt(typeId),
        status: form.elements['create-as-completed'].checked ? 'completed' : 'pending',
        // Se criar como concluída, já grava a data de conclusão
        data_conclusao: form.elements['create-as-completed'].checked ? new Date().toISOString() : null,
        criador_id: state.currentUserProfile.id,
        responsavel_id: assigneeId,
        empresa_id: state.currentUserProfile.empresa_id
    };

    try {
        // 5. Envio para o Banco de Dados
        await api.createTaskInDB(taskData); //

        // 6. Lógica de Salvar Modelo (Opcional)
        if (form.elements['save-as-template']?.checked) {
            await api.createTemplateInDB({
                titulo: title,
                tipo_tarefa_id: parseInt(typeId),
                empresa_id: state.currentUserProfile.empresa_id,
                criador_id: state.currentUserProfile.id
            });
            
            // Recarrega os templates para aparecerem no dropdown na próxima vez
            // (Opcional: você pode adicionar uma chamada para recarregar templates aqui se quiser)
        }

        alert('Tarefa criada com sucesso!');

        // 7. Limpeza do Formulário
        form.reset();
        
        // Limpa o campo visual de busca de condomínio
        const condoSearchInput = document.getElementById('task-condo-search');
        if (condoSearchInput) condoSearchInput.value = '';
        document.getElementById('task-condominio').value = '';

        // Se o botão de gravação de áudio estiver "vermelho", reseta ele
        const recordBtn = document.getElementById('record-desc-btn');
        if (recordBtn) {
            recordBtn.textContent = '🎙️';
            recordBtn.classList.remove('recording');
        }

        // 8. Atualização da Lista (Usando a nova Paginação)
        // Chama a busca para recarregar a lista (resetando para a página 1)
        if (typeof executeTaskSearch === 'function') {
            await executeTaskSearch(); 
        }

    } catch (error) {
        console.error("Erro ao criar tarefa:", error);
        
        // Tratamento especial para erro de modelo duplicado
        if (error.message && error.message.includes('modelos_tarefa_empresa_id_titulo_key')) {
            alert('Erro: O título desta tarefa já está salvo como um modelo. Desmarque a opção "Salvar como modelo" ou mude o título.');
        } 
        // --- INÍCIO DA CORREÇÃO ---
        // Se for um erro de validação de negócio (Ação bloqueada), mostra apenas a mensagem
        else if (error.message && error.message.includes('Ação bloqueada')) {
            alert(error.message);
        }
        // Para outros erros genéricos, mantém o prefixo para contexto
        else {
            alert("Erro ao criar a tarefa: " + error.message);
        }
        // --- FIM DA CORREÇÃO ---
    }
}

// --- NOVA FUNÇÃO PARA GRAVAÇÃO DE ÁUDIO ---
async function handleAudioTranscription(event) {
    event.preventDefault(); 
    const recordBtn = document.getElementById('record-desc-btn');
    const descTextarea = document.getElementById('task-desc'); 
    if (!recordBtn || !descTextarea) return; 

    // Verifica compatibilidade (Cobre Chrome, Edge, Android Webview)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        return alert("Seu navegador não suporta a transcrição de áudio. Por favor, use o Google Chrome.");
    }

    const baseText = descTextarea.value.trim(); 
    const recognition = new SpeechRecognition();
    
    // CONFIGURAÇÕES CRÍTICAS PARA MOBILE
    recognition.lang = 'pt-BR'; 
    recognition.interimResults = true; // Mostra o texto aparecendo enquanto fala
    recognition.continuous = false; // IMPORTANTE: false é mais estável no Android
    recognition.maxAlternatives = 1;

    // Se já estiver gravando (botão vermelho), para a gravação
    if (recordBtn.classList.contains('recording')) { 
        // Nota: Não chamamos .stop() aqui diretamente, recarregamos a função para limpar o estado
        // Apenas mudamos o visual para o usuário saber que parou
        recordBtn.textContent = '🎙️'; 
        recordBtn.classList.remove('recording');
        return; // O objeto recognition anterior morrerá sozinho ou via garbage collection
    }

    // --- EVENTOS ---

    // 1. Quando o microfone realmente abre
    recognition.onstart = () => {
        recordBtn.textContent = '🔴'; 
        recordBtn.classList.add('recording'); 
    };

    // 2. Quando o áudio é processado (Texto chegando)
    recognition.onresult = (event) => { 
        let interim_transcript = '';
        let final_transcript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                final_transcript += event.results[i][0].transcript;
            } else {
                interim_transcript += event.results[i][0].transcript;
            }
        }
        
        // Atualiza o texto preservando o que já estava escrito
        // Adiciona espaço apenas se houver texto novo e texto antigo
        const separator = baseText ? ' ' : '';
        const novoTexto = final_transcript || interim_transcript;
        
        if (novoTexto) {
            descTextarea.value = baseText + separator + novoTexto;
        }
    };

    // 3. Quando a gravação termina (silêncio ou fim)
    recognition.onend = () => { 
        recordBtn.textContent = '🎙️'; 
        recordBtn.classList.remove('recording'); 
    };

    // 4. Tratamento de Erros (Específico para Mobile)
    recognition.onerror = (event) => { 
        // Ignora erro de 'no-speech' se for apenas silêncio rápido
        if (event.error === 'no-speech') {
            return; 
        }
        
        recordBtn.textContent = '🎙️'; 
        recordBtn.classList.remove('recording');

        if (event.error === 'audio-capture') {
            alert("O microfone está ocupado ou indisponível. Verifique se outro app está usando o microfone.");
        }
        else if (event.error === 'not-allowed') {
             alert("Permissão de microfone negada. Verifique as configurações do site no seu navegador.");
        }
        else if (event.error === 'network') {
             alert("A transcrição precisa de internet para funcionar no celular. Verifique sua conexão.");
        }
        else {
            alert(`Erro: ${event.error}`);
        }
    };

    // --- INICIA A GRAVAÇÃO ---
    // Removemos o getUserMedia manual. Chamamos start direto.
    // O próprio navegador vai pedir permissão se precisar.
    try {
        recognition.start();
    } catch (e) {
        console.error("Erro ao iniciar reconhecimento:", e);
        alert("Não foi possível iniciar o microfone.");
    }
}

async function handleViewChange(input) {
    let viewId;
   

    // 1. PROTEÇÃO DE ENTRADA (Acorreção do erro 'reading detail')
    if (!input) {
        console.warn("handleViewChange chamado sem argumentos.");
        return;
    }

    // 2. Verifica o tipo de entrada para pegar o ID corretamente
    if (typeof input === 'string') {
        // Chamada direta: handleViewChange('dashboard-view')
        viewId = input;
    } else if (input.detail && input.detail.viewId) {
        // Chamada via Evento: dispatchEvent(...)
        viewId = input.detail.viewId;
    } else {
        // Proteção final
        console.warn("handleViewChange recebeu formato inválido:", input);
        return;
    }

    // 3. Atualiza Menu e Telas
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewId);
    });

    document.querySelectorAll('.view').forEach(view => view.style.display = 'none');
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.style.display = 'flex';
        
        if (viewId !== 'login-screen' && viewId !== 'admin-menu-view') {
            sessionStorage.setItem('lastActiveView', viewId);
        }
    }

    // 4. Lógica Específica por Tela
    try {
        if (viewId === 'view-tasks-view') {
            if (typeof executeTaskSearch === 'function') executeTaskSearch();
        } 
        else if (viewId === 'dashboard-view') {
            if (typeof refreshDashboard === 'function') refreshDashboard();
        }
        else if (viewId === 'admin-users-view') {
            render.renderUserList(state.allUsers, state.currentUserProfile, state.allCargos, state.allGroups, state.userGroupAssignments, state.condominios, state.allCondoAssignments);
            
            // Lógica de Limite de Usuários
            const addUserBtn = document.getElementById('add-user-btn');
            const userLimit = state.plano?.limite_usuarios;
            const activeUserCount = state.allUsers.filter(u => u.ativo).length;
            
            const oldLimitMessage = document.getElementById('user-limit-message');
            if (oldLimitMessage) oldLimitMessage.remove();

            if (addUserBtn) {
                if (userLimit && activeUserCount >= userLimit) {
                    addUserBtn.disabled = true;
                    addUserBtn.style.backgroundColor = '#9ca3af';
                    addUserBtn.style.cursor = 'not-allowed';
                    const limitMessage = document.createElement('p');
                    limitMessage.id = 'user-limit-message';
                    limitMessage.style.color = 'red';
                    limitMessage.style.textAlign = 'center';
                    limitMessage.textContent = `Limite de ${userLimit} usuários ativos atingido para o ${state.plano.nome}.`;
                    addUserBtn.after(limitMessage);
                } else {
                    addUserBtn.disabled = false;
                    addUserBtn.style.backgroundColor = '';
                    addUserBtn.style.cursor = 'pointer';
                }
            }
        } 
        else if (viewId === 'admin-cargos-view') {
            render.renderCargoList(state.allCargos);
        } 
        else if (viewId === 'admin-groups-view') {
            render.renderGroupList(state.allGroups);
        } 
        else if (viewId === 'admin-types-view') {
            render.renderTaskTypeList(state.taskTypes);
        } 
        else if (viewId === 'admin-condos-view') {
            render.renderCondoList(state.condominios, state.allGroups);
        }

    } catch (error) {
        console.error(`Erro ao renderizar a view '${viewId}':`, error);
    }
}

// Cole esta função no final do arquivo ou junto com as outras 'handle...'
async function handleUpdateTask(event) {
    console.log("[DEBUG SAVE] Botão salvar clicado!");
    event.preventDefault();
    
    // 1. Coleta dados
    const taskIdVal = document.getElementById('edit-task-id').value;
    const title = document.getElementById('edit-task-title').value.trim();
    const description = document.getElementById('edit-task-desc').value;
    const dueDate = document.getElementById('edit-task-due-date').value;
    const typeId = document.getElementById('edit-task-type').value;
    const assigneeId = document.getElementById('edit-task-assignee').value;
    const condominioId = document.getElementById('edit-task-condominio').value;

    console.log("[DEBUG SAVE] Dados:", { taskIdVal, title, assigneeId });

    if (!title || !typeId || !condominioId || !dueDate || !assigneeId) {
        console.warn("[DEBUG SAVE] Validação falhou.");
        return alert('Todos os campos obrigatórios precisam ser preenchidos.');
    }

    const updatedData = {
        titulo: title,
        descricao: description,
        data_conclusao_prevista: dueDate,
        tipo_tarefa_id: parseInt(typeId),
        responsavel_id: assigneeId,
        condominio_id: parseInt(condominioId)
    };

    try {
        // 2. Envia ao banco
        console.log("[DEBUG SAVE] Enviando ao banco...");
        const { error } = await api.updateTaskInDB(parseInt(taskIdVal), updatedData);
        if (error) throw error;
        
        // 3. Atualiza localmente
        const taskIndex = state.tasks.findIndex(t => t.id == taskIdVal);
        if (taskIndex !== -1) {
            state.tasks[taskIndex] = { ...state.tasks[taskIndex], ...updatedData };
            
            // Atualiza nomes visuais
            const responsavel = state.allUsers.find(u => u.id === assigneeId);
            state.tasks[taskIndex].responsavel_nome = responsavel ? responsavel.nome_completo : 'N/A';

            const tipo = state.taskTypes.find(t => t.id == typeId);
            state.tasks[taskIndex].tipo_tarefa_nome = tipo ? tipo.nome_tipo : 'N/A';
        }

        // 4. Redesenha e fecha
        state.tasksToDisplayForPdf = render.renderTasks(state);
        ui.closeEditModal(); // <--- Nome corrigido (igual ao usado nos botões de fechar)
        console.log("[DEBUG SAVE] Sucesso! Modal fechado.");
        alert('Tarefa atualizada com sucesso!');

    } catch (error) {
        console.error("[DEBUG SAVE] Erro:", error);
        alert("Erro ao atualizar: " + error.message);
    }
}

async function handleToggleStatus(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    try {
        await api.toggleStatusInDB(taskId, task.status);
        const taskIndex = state.tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
            state.tasks[taskIndex].status = task.status === 'pending' ? 'completed' : 'pending';
        }
        state.tasksToDisplayForPdf = render.renderTasks(state);
    } catch (error) {
        alert('Erro ao atualizar status: ' + error.message);
    }
}

async function handleCreateUser(event) {
    event.preventDefault(); //
    const form = event.target; //
    const nome = form.elements['create-user-name'].value.trim(); //
    const email = form.elements['create-user-email'].value.trim(); //
    const password = form.elements['create-user-password'].value.trim(); //
    const cargoId = parseInt(form.elements['create-user-role'].value, 10); //

    // --- INÍCIO DA ALTERAÇÃO (Lendo Checkboxes) ---
    const selectedCondoIds = Array.from(form.querySelectorAll('input[name="condominios_create"]:checked'))
        .map(cb => parseInt(cb.value, 10));
    // --- FIM DA ALTERAÇÃO ---

    if (!nome || !email || !password || isNaN(cargoId)) { //
        return alert('Todos os campos obrigatórios precisam ser preenchidos.');
    }
    if (password.length < 6) { //
        return alert("A senha provisória deve ter no mínimo 6 caracteres.");
    }

    const cargo = state.allCargos.find(c => c.id === cargoId);
    if (cargo && cargo.is_client_role && selectedCondoIds.length === 0) { // Verifica se o array está vazio
        return alert("Para cargos do tipo 'Cliente', é obrigatório selecionar pelo menos um condomínio associado.");
    }

    try {
        await api.createUser({ //
            email,
            password,
            nome_completo: nome,
            cargo_id: cargoId,
            condominio_ids: selectedCondoIds // <<<--- ENVIANDO O ARRAY DE IDS
        });
        ui.closeCreateUserModal(); //
        alert('Usuário criado com sucesso!'); //

        // Recarrega os dados (mantido)
        const freshData = await api.fetchInitialData( //
            state.currentUserProfile.empresa_id,
            state.currentUserProfile.id,
        );
        Object.assign(state, freshData); //
        render.renderUserList(state.allUsers, state.currentUserProfile, state.allCargos, state.allGroups, state.userGroupAssignments, state.condominios, state.allCondoAssignments); //

    } catch (error) {
        console.error("Erro detalhado ao criar usuário:", error); //
        alert('Erro ao criar usuário: ' + (error.message || 'Ocorreu um erro inesperado.')); //
    }
}

async function handleOpenEditModal(taskId) {
    const task = state.tasks.find(t => t.id == taskId);
    if (!task) return;

    // Abre o modal imediatamente com os dados que já temos
    ui.openEditModal(task, [], state.currentUserProfile);

    try {
        // Tenta buscar os dados secundários
        const [assignableUsers, historyEvents] = await Promise.all([
            api.fetchAllUsersForAssignment(),
            api.fetchTaskHistory(taskId)
        ]);

        // Se a busca for bem-sucedida, preenche o resto do modal
        const assigneeSelect = document.getElementById('edit-task-assignee');
        if (assigneeSelect) {
            assigneeSelect.innerHTML = '';
            assignableUsers.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.nome_completo;
                assigneeSelect.appendChild(option);
            });
            assigneeSelect.value = task.responsavel_id;
        }
        render.renderTaskHistory(historyEvents);

    } catch (error) {
        // ========================================================================
        // INÍCIO DA MUDANÇA PARA DEPURAÇÃO
        // ========================================================================

        // Em vez de um alerta genérico, agora vamos registrar o erro detalhado no console.
        console.error("ERRO DETALHADO AO CARREGAR DADOS DO MODAL:", error);

        // O alerta agora nos instrui a olhar o console.
        alert("Falha ao carregar dados secundários da tarefa. Verifique o console (F12) para mais detalhes.");

        // ========================================================================
        // FIM DA MUDANÇA
        // ========================================================================
    }
}

function handleOpenCreateUserModal() {
    // Passa os cargos, condomínios e a lista completa de cargos (para checar o 'is_client_role')
    ui.openCreateUserModal(state.allCargos, state.condominios, state.allCargos); //
}

function handleTemplateSelect(e) {
    const templateId = e.target.value;
    if (!templateId) return;
    const template = state.taskTemplates.find(t => t.id == templateId);
    if (template) {
        document.getElementById('task-title').value = template.titulo;
        document.getElementById('task-type').value = template.tipo_tarefa_id;
        document.getElementById('task-desc').value = '';
    }
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        // Verifica se o script já não foi carregado
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Falha ao carregar o script: ${src}`));
        document.head.appendChild(script);
    });
}

async function handleExportToPDF() {
    const exportBtn = document.getElementById('export-pdf-btn');
    
    // 1. Feedback Visual
    const originalText = exportBtn.textContent;
    exportBtn.textContent = 'Processando...';
    exportBtn.disabled = true;
    exportBtn.style.opacity = '0.7';

    try {
        // 2. CARREGAMENTO DINÂMICO (Mantido do seu código original)
        // Isso garante que o jsPDF exista antes de tentarmos usá-lo
        await loadScript('https://unpkg.com/jspdf@latest/dist/jspdf.umd.min.js');
        await loadScript('https://unpkg.com/jspdf-autotable@3.5.23/dist/jspdf.plugin.autotable.js');

        // 3. Prepara os Filtros
        const filters = { ...state.activeFilters };
        const searchTerm = document.getElementById('search-term-input')?.value.trim() || '';
        filters.searchTerm = searchTerm;
        if (filters.status === 'all') filters.status = null;

        // 4. BUSCA COMPLETA NO SERVIDOR (A Melhoria)
        // Busca até 100.000 tarefas para garantir que o relatório seja completo
        const allTasksForReport = await api.searchTasks(filters, state.currentUserProfile, 100000, 0);

        if (!allTasksForReport || allTasksForReport.length === 0) {
            alert("Não há tarefas correspondentes para gerar o relatório.");
            return;
        }

        // 5. Opções (Mantido do seu código original - Checkboxes são melhores que popups)
        const includeDescEl = document.getElementById('pdf-include-desc');
        const includeHistoryEl = document.getElementById('pdf-include-history');
        
        const includeDesc = includeDescEl ? includeDescEl.checked : false;
        const includeHistory = includeHistoryEl ? includeHistoryEl.checked : false;

        // 6. Prepara dados do cabeçalho
        let reportOwnerName = null;
        if (filters.assigneeId) {
            const user = state.allUsers.find(u => u.id === filters.assigneeId);
            if (user) reportOwnerName = user.nome_completo;
        }

        const empresaNome = state.currentUserProfile?.empresa?.nome_empresa || 'Relatório Geral';
        const emitterName = state.currentUserProfile?.nome_completo || 'Usuário Desconhecido';
        const logoUrl = state.currentUserProfile?.empresa?.logo_url || null;

        // 7. Gera o PDF
        await utils.exportTasksToPDF(
            allTasksForReport, // Lista completa
            state.condominios, 
            state.taskTypes,
            state.STATUSES, 
            includeDesc, 
            includeHistory,
            reportOwnerName, 
            empresaNome, 
            emitterName,
            logoUrl
        );

    } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        alert("Ocorreu um erro ao gerar o relatório: " + error.message);
    } finally {
        // 8. Restaura o botão
        if (exportBtn) {
            exportBtn.textContent = originalText;
            exportBtn.disabled = false;
            exportBtn.style.opacity = '1';
        }
    }
}

async function handleUpdateUser(event) {
    event.preventDefault(); //
    const form = event.target; //
    const userId = form.elements['edit-user-id'].value; //

    // --- INÍCIO DAS ALTERAÇÕES ---
    // 1. Remove o 'condominio_associado_id' daqui
    const updatedUserData = {
        nome_completo: form.elements['edit-user-name'].value.trim(), //
        cargo_id: parseInt(form.elements['edit-user-role'].value, 10), //
    };

    // 2. Lê os IDs dos grupos E dos condomínios
    const selectedGroupIds = Array.from(form.querySelectorAll('input[name="grupos"]:checked')).map(cb => parseInt(cb.value, 10)); //
    const selectedCondoIds = Array.from(form.querySelectorAll('input[name="condominios_edit"]:checked'))
        .map(cb => parseInt(cb.value, 10));
    // --- FIM DAS ALTERAÇÕES ---

    if (!updatedUserData.nome_completo || isNaN(updatedUserData.cargo_id)) { //
        return alert('Nome e Cargo são obrigatórios.');
    }

    const cargo = state.allCargos.find(c => c.id === updatedUserData.cargo_id);
    if (cargo && cargo.is_client_role && selectedCondoIds.length === 0) { // Verifica o array
        return alert("Para cargos do tipo 'Cliente', é obrigatório selecionar pelo menos um condomínio associado.");
    }

    try {
        // 1. Salva os dados do usuário (nome, cargo)
        await api.updateUserInDB(userId, updatedUserData); //
        // 2. Salva os grupos
        await api.updateUserGroupAssignments(userId, selectedGroupIds); //

        // --- INÍCIO DA ADIÇÃO ---
        // 3. Salva os condomínios associados
        await api.updateUserCondominioAssignments(userId, selectedCondoIds);
        // --- FIM DA ADIÇÃO ---

        ui.closeEditUserModal(); //
        alert("Usuário atualizado com sucesso!"); //

        // --- Atualização do State (Quase igual, mas removemos a coluna 'condominio_associado_id') ---
        const userIndex = state.allUsers.findIndex(u => u.id === userId); //

        if (userIndex !== -1) {
            state.allUsers[userIndex].nome_completo = updatedUserData.nome_completo; //
            state.allUsers[userIndex].cargo_id = updatedUserData.cargo_id; //

            // REMOVIDA A LINHA: state.allUsers[userIndex].condominio_associado_id = ...

            const newCargo = state.allCargos.find(c => c.id === updatedUserData.cargo_id);
            if (newCargo) {
                if (!state.allUsers[userIndex].cargo) state.allUsers[userIndex].cargo = {};
                state.allUsers[userIndex].cargo.nome_cargo = newCargo.nome_cargo;
                state.allUsers[userIndex].cargo.is_admin = newCargo.is_admin;
                state.allUsers[userIndex].cargo.tem_permissoes_admin = newCargo.tem_permissoes_admin;
                state.allUsers[userIndex].cargo.is_client_role = newCargo.is_client_role; //
            } else {
                state.allUsers[userIndex].cargo = null;
            }
        }

        state.userGroupAssignments = state.userGroupAssignments.filter(a => a.usuario_id !== userId); //
        selectedGroupIds.forEach(groupId => {
            state.userGroupAssignments.push({ usuario_id: userId, grupo_id: groupId }); //
        });

        // (Nota: O 'state' não armazena as associações de condomínio, então não precisamos atualizar)

        render.renderUserList(state.allUsers, state.currentUserProfile, state.allCargos, state.allGroups, state.userGroupAssignments, state.condominios, state.allCondoAssignments); //

    } catch (error) {
        console.error("[handleUpdateUser] Erro detalhado:", error); //
        alert("Erro ao atualizar usuário: " + error.message); //
    }
}

async function handleToggleUserStatus(userId) {
    const userToToggle = state.allUsers.find(u => u.id === userId);
    if (!userToToggle) return;

    const action = userToToggle.ativo ? "desativar" : "reativar";
    if (confirm(`Tem certeza que deseja ${action} o usuário ${userToToggle.nome_completo}?`)) {
        try {
            // 1. Atualiza o status no banco de dados
            await api.toggleUserStatusInDB(userId, userToToggle.ativo);

            // 2. Encontra o índice do usuário no nosso estado local
            const userIndex = state.allUsers.findIndex(u => u.id === userId);
            if (userIndex !== -1) {
                // 3. Inverte o status 'ativo' no estado local
                state.allUsers[userIndex].ativo = !userToToggle.ativo;
            }

            // 4. Redesenha apenas a lista de usuários, sem recarregar a página
            render.renderUserList(state.allUsers, state.currentUserProfile, state.allCargos, state.allGroups, state.userGroupAssignments, state.condominios, state.allCondoAssignments);

        } catch (error) {
            alert(`Erro ao ${action} o usuário: ` + error.message);
        }
    }
}

async function handleOpenEditUserModal(userId) {
    const userToEdit = state.allUsers.find(u => u.id === userId); //
    if (!userToEdit) return;
    try {
        // --- INÍCIO DA ALTERAÇÃO ---
        // Busca as duas listas de associação em paralelo
        const [groupAssignments, condominioAssignments] = await Promise.all([
            api.fetchUserGroupAssignments(userId), //
            api.fetchUserCondominioAssignments(userId) // <<<--- NOVO FETCH
        ]);

        // Passa a nova lista de IDs de condomínio para o modal
        ui.openEditUserModal(
            userToEdit,
            state.allCargos,
            state.allGroups,
            groupAssignments, // array [1, 2]
            state.condominios,
            state.allCargos,
            condominioAssignments // array [5, 10]
        );
        // --- FIM DA ALTERAÇÃO ---

    } catch (error) {
        alert("Não foi possível carregar os dados para edição: " + error.message); //
    }
}

async function handleCreateOrUpdateCondo(event) {
    event.preventDefault();
    const form = event.target;
    const condoId = form.elements['condo-id'].value;
    const condoData = {
        nome: form.elements['condo-nome'].value,
        nome_fantasia: form.elements['condo-nome-fantasia'].value,
        cnpj: form.elements['condo-cnpj'].value || null,
    };
    try {
        if (condoId) {
            await api.updateCondoInDB(condoId, condoData);
            alert('Condomínio atualizado com sucesso!');
        } else {
            await api.createCondoInDB(condoData);
            alert('Condomínio criado com sucesso!');
        }
        form.reset();
        document.getElementById('condo-id').value = '';
        document.getElementById('condo-submit-btn').textContent = 'Adicionar Condomínio';
        sessionStorage.setItem('lastActiveView', 'admin-view');
        location.reload();
    } catch (error) {
        alert('Erro ao salvar condomínio: ' + error.message);
    }
}

function handleEditCondo(condoId) {
    const condo = state.condominios.find(c => c.id === condoId);
    if (!condo) return;
    document.getElementById('condo-id').value = condo.id;
    document.getElementById('condo-nome').value = condo.nome;
    document.getElementById('condo-nome-fantasia').value = condo.nome_fantasia;
    document.getElementById('condo-cnpj').value = condo.cnpj || '';
    document.getElementById('condo-submit-btn').textContent = 'Salvar Alterações';
    document.getElementById('condo-nome').focus();
}

async function handleDeleteCondo(condoId) {
    const condo = state.condominios.find(c => c.id === condoId); //
    if (!condo) return; //

    // Pega o termo correto (ex: "Condomínio", "Loja") para usar nas mensagens
    const termoSingular = utils.getTermSingular(); //

    if (confirm(`Tem certeza que deseja excluir ${termoSingular.toLowerCase()} "${condo.nome_fantasia || condo.nome}"?`)) { //
        try {
            // 1. Deleta o item no banco de dados
            await api.deleteCondoInDB(condoId); //
            alert(`${termoSingular} excluído com sucesso!`); //

            // --- INÍCIO DO REFINAMENTO ---

            // 2. Remove o item da lista local 'state.condominios'
            state.condominios = state.condominios.filter(c => c.id !== condoId); //

            // 3. Renderiza (redesenha) a lista de itens
            render.renderCondoList(state.condominios, state.allGroups); //

            // 4. ATUALIZA OS DROPDOWNS por todo o app (filtros, criação, etc.)
            ui.populateDropdowns(state.condominios, state.taskTypes, state.allUsers, state.allGroups, state.currentUserProfile); //

            // (A chamada demorada para 'fetchInitialData' foi removida)

            // --- FIM DO REFINAMENTO ---

        } catch (error) {
            // 5. Lógica de tratamento de erro mantida e com terminologia
            if (error.code === '23503') { //
                alert(`Este ${termoSingular.toLowerCase()} não pode ser excluído por haver tarefas vinculadas.`); //
            } else {
                alert(`Erro ao excluir ${termoSingular.toLowerCase()}: ` + error.message); //
            }
        }
    }
}

async function handleCreateOrUpdateTaskType(event) {
    event.preventDefault(); //
    const form = event.target; //
    const typeId = form.elements['task-type-id'].value; //
    const typeData = {
        nome_tipo: form.elements['task-type-nome'].value.trim(), //
        cor: form.elements['task-type-cor'].value, //
        empresa_id: state.currentUserProfile.empresa_id //
    };
    if (!typeData.nome_tipo) return alert("O nome do tipo de tarefa é obrigatório."); //

    try {
        let savedTaskType; // Variável para guardar o tipo novo ou atualizado

        if (typeId) {
            // Chama a função da API para ATUALIZAR (que agora retorna dados)
            savedTaskType = await api.updateTaskTypeInDB(typeId, typeData); //
            alert('Tipo de tarefa atualizado com sucesso!'); //
        } else {
            // Chama a função da API para CRIAR (que agora retorna dados)
            savedTaskType = await api.createTaskTypeInDB(typeData); //
            alert('Tipo de tarefa criado com sucesso!'); //
        }

        // Limpa o formulário
        form.reset(); //
        document.getElementById('task-type-id').value = ''; //
        document.getElementById('task-type-submit-btn').textContent = 'Adicionar Tipo'; //

        // --- INÍCIO DO REFINAMENTO ---

        if (typeId) {
            // Se foi uma ATUALIZAÇÃO, encontra o índice e substitui no 'state'
            const index = state.taskTypes.findIndex(t => t.id === savedTaskType.id); //
            if (index !== -1) {
                state.taskTypes[index] = savedTaskType; // Atualiza o objeto no array
            }
        } else {
            // Se foi uma CRIAÇÃO, apenas adiciona o novo tipo ao 'state'
            state.taskTypes.push(savedTaskType); //
        }

        // Renderiza (redesenha) a lista de tipos de tarefa
        render.renderTaskTypeList(state.taskTypes); //

        // Atualiza os dropdowns que usam tipos (filtros, criação de tarefas, etc.)
        ui.populateDropdowns(state.condominios, state.taskTypes, state.allUsers, state.allGroups, state.currentUserProfile); //

        // (A chamada demorada para 'fetchInitialData' foi removida)

        // --- FIM DO REFINAMENTO ---

    } catch (error) {
        // Lógica de tratamento de erro mantida
        if (error.message && error.message.includes('tipos_tarefa_empresa_id_nome_tipo_key')) { //
            alert("Este tipo de tarefa já foi criado, use outro nome."); //
        } else {
            alert('Erro ao salvar tipo de tarefa: ' + error.message); //
        }
    }
}

function handleCondoImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: async (results) => {
            const groupNameToIdMap = new Map(state.allGroups.map(g => [g.nome_grupo.toLowerCase(), g.id]));
            const condosToInsert = results.data.map(condo => ({
                nome: condo.nome,
                nome_fantasia: condo.nome_fantasia,
                cnpj: condo.cnpj || null,
                empresa_id: state.currentUserProfile.empresa_id,
                grupo_id: groupNameToIdMap.get(condo.nome_grupo?.trim().toLowerCase()) || null
            }));
            if (confirm(`Você tem certeza que deseja importar ${condosToInsert.length} novos condomínios?`)) {
                try {
                    await api.bulkInsertCondos(condosToInsert);
                    alert("Condomínios importados com sucesso!");
                    sessionStorage.setItem('lastActiveView', 'admin-view');
                    location.reload();
                } catch (error) {
                    alert("Ocorreu um erro ao importar os condomínios: " + error.message);
                }
            }
        },
        error: (error) => alert("Ocorreu um erro ao ler o arquivo da planilha.")
    });
    event.target.value = '';
}

async function handleCreateOrUpdateGroup(event) {
    event.preventDefault(); //
    const form = event.target; //
    const groupId = form.elements['group-id'].value; //
    const groupData = {
        nome_grupo: form.elements['group-name'].value, //
        empresa_id: state.currentUserProfile.empresa_id //
    };

    try {
        let savedGroup; // Variável para guardar o grupo novo ou atualizado

        if (groupId) {
            // Chama a função da API para ATUALIZAR (que agora retorna dados)
            savedGroup = await api.updateGroupInDB(groupId, groupData); //
            alert('Grupo atualizado com sucesso!'); //
        } else {
            // Chama a função da API para CRIAR (que agora retorna dados)
            savedGroup = await api.createGroupInDB(groupData); //
            alert('Grupo criado com sucesso!'); //
        }

        // Limpa e reseta o formulário
        form.reset(); //
        document.getElementById('group-id').value = ''; //
        document.getElementById('group-submit-btn').textContent = 'Adicionar Grupo'; //

        // --- INÍCIO DO REFINAMENTO ---

        if (groupId) {
            // Se foi uma ATUALIZAÇÃO, encontra o índice e substitui no 'state'
            const index = state.allGroups.findIndex(g => g.id === savedGroup.id); //
            if (index !== -1) {
                state.allGroups[index] = savedGroup; // Atualiza o objeto no array
            }
        } else {
            // Se foi uma CRIAÇÃO, apenas adiciona o novo grupo ao 'state'
            state.allGroups.push(savedGroup); //
        }

        // Renderiza (redesenha) a lista de grupos
        render.renderGroupList(state.allGroups); //

        // Atualiza os dropdowns que usam grupos (filtros, modais de condomínio/usuário)
        ui.populateDropdowns(state.condominios, state.taskTypes, state.allUsers, state.allGroups, state.currentUserProfile); //

        // (A chamada demorada para 'fetchInitialData' foi removida)

        // --- FIM DO REFINAMENTO ---

    } catch (error) {
        alert('Erro ao salvar grupo: ' + error.message); //
    }
}

function handleEditGroup(groupId, groupName) {
    document.getElementById('group-id').value = groupId;
    document.getElementById('group-name').value = groupName;
    document.getElementById('group-submit-btn').textContent = 'Salvar Alterações';
    document.getElementById('group-name').focus();
}

async function handleDeleteGroup(groupId, groupName) {
    // 1. Confirma a ação
    if (confirm(`Tem certeza que deseja excluir o grupo "${groupName}"?`)) { //
        try {
            // 2. Chama a API para deletar no banco
            await api.deleteGroupInDB(groupId); //
            alert('Grupo excluído com sucesso!'); //

            // --- INÍCIO DO REFINAMENTO ---

            // 3. Remove o grupo da lista local 'state.allGroups'
            state.allGroups = state.allGroups.filter(group => group.id !== groupId); //

            // 4. Renderiza a lista de grupos atualizada
            render.renderGroupList(state.allGroups); //

            // (A chamada demorada para 'fetchInitialData' foi removida)

            // --- FIM DO REFINAMENTO ---

        } catch (error) {
            // 5. Tratamento de erro mantido
            alert('Erro ao excluir grupo: ' + error.message); //
        }
    }
}

function handleDownloadTemplate() {
    const csvHeader = "nome,nome_fantasia,cnpj,nome_grupo";
    const blob = new Blob([csvHeader], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "modelo-importacao-condominios.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function handleForgotPassword(event) {
    event.preventDefault();
    const email = prompt("Por favor, digite o e-mail da sua conta para enviarmos o link de redefinição de senha:");
    if (!email) return;

    try {
        // Chama a Edge Function
        const { data, error } = await supabaseClient.functions.invoke('send-reset-email', {
            body: { email: email }
        });

        // Se o supabaseClient detectar um erro na chamada, ele lança aqui
        if (error) throw error;

        // Sucesso
        alert("Se uma conta com este e-mail existir, um link para redefinir a senha foi enviado.");

    } catch (error) {
        console.error("Erro ao chamar a Edge Function de redefinição:", error);

        // --- TRATAMENTO PERSONALIZADO DE ERRO ---
        // Verifica se o erro é o retorno "non-2xx" (que acontece quando a função falha/não acha o usuário)
        if (error.message && (error.message.includes('non-2xx') || error.message.includes('400') || error.message.includes('404'))) {
            alert("O e-mail informado não foi localizado, tente com outro ou confirme seu e-mail de cadastro com o administrador do sistema.");
        } else {
            // Erros reais de conexão ou outros problemas
            alert("Ocorreu um erro ao tentar enviar o e-mail de redefinição: " + error.message);
        }
    }
}

function handleEditTaskType(typeId) {
    const type = state.taskTypes.find(t => t.id === typeId);
    if (!type) return;
    document.getElementById('task-type-id').value = type.id;
    document.getElementById('task-type-nome').value = type.nome_tipo;
    document.getElementById('task-type-cor').value = type.cor;
    document.getElementById('task-type-submit-btn').textContent = 'Salvar Alterações';
    document.getElementById('task-type-nome').focus();
}

async function handleDeleteTaskType(typeId) {
    const type = state.taskTypes.find(t => t.id === typeId); //
    if (!type) return; //

    if (confirm(`Tem certeza que deseja excluir o tipo de tarefa "${type.nome_tipo}"?`)) { //
        try {
            // 1. Deleta o tipo de tarefa no banco de dados
            await api.deleteTaskTypeInDB(typeId); //
            alert('Tipo de tarefa excluído com sucesso!'); //

            // --- INÍCIO DO REFINAMENTO ---

            // 2. Remove o tipo de tarefa da lista local 'state.taskTypes'
            state.taskTypes = state.taskTypes.filter(t => t.id !== typeId); //

            // 3. Renderiza (redesenha) a lista de tipos de tarefa com o array atualizado
            render.renderTaskTypeList(state.taskTypes); //

            // 4. ATUALIZA OS DROPDOWNS por todo o app (filtros, criação, etc.)
            //    Usando o 'state' que acabamos de atualizar.
            ui.populateDropdowns(state.condominios, state.taskTypes, state.allUsers, state.allGroups, state.currentUserProfile); //

            // (A chamada demorada para 'fetchInitialData' foi removida)

            // --- FIM DO REFINAMENTO ---

        } catch (error) {
            // 5. Lógica de tratamento de erro mantida
            if (error.code === '23503') { //
                alert('Impossível excluir! Este tipo de tarefa ainda está vinculado a uma ou mais tarefas.'); //
            } else {
                alert('Erro ao excluir tipo de tarefa: ' + error.message); //
            }
        }
    }
}

async function handleCreateOrUpdateCargo(event) {
    event.preventDefault(); //
    const form = event.target; //
    const cargoId = form.elements['cargo-id'].value; //

    const cargoData = {
        nome_cargo: form.elements['cargo-nome'].value.trim(), //
        tem_permissoes_admin: form.elements['cargo-tem-permissoes-admin'].checked, //
        is_client_role: form.elements['cargo-is-client-role'].checked, // <<<--- ADICIONADO
        empresa_id: state.currentUserProfile.empresa_id //
    };

    if (!cargoData.nome_cargo) return alert("O nome do cargo é obrigatório."); //

    try {
        let savedCargo;
        if (cargoId) {
            savedCargo = await api.updateCargoInDB(cargoId, cargoData); //
            alert('Cargo atualizado com sucesso!'); //
        } else {
            savedCargo = await api.createCargoInDB(cargoData); //
            alert('Cargo criado com sucesso!'); //
        }

        form.reset(); //
        document.getElementById('cargo-id').value = ''; //
        document.getElementById('cargo-submit-btn').textContent = 'Adicionar Cargo'; //

        // --- LÓGICA DE ATUALIZAÇÃO DO STATE (Mantida) ---
        if (cargoId) {
            const index = state.allCargos.findIndex(c => c.id === savedCargo.id); //
            if (index !== -1) {
                state.allCargos[index] = savedCargo;
            }
        } else {
            state.allCargos.push(savedCargo); //
        }
        render.renderCargoList(state.allCargos); //
        ui.populateDropdowns(state.condominios, state.taskTypes, state.allUsers, state.allCargos, state.currentUserProfile); //
        // --- FIM DA LÓGICA DE ATUALIZAÇÃO ---

    } catch (error) {
        if (error.message.includes('cargos_empresa_id_nome_cargo_key')) {
            alert('Erro: Cargo já existente!');
        } else {
            alert('Erro ao salvar cargo: ' + error.message);
        }
    }
}

function handleEditCargo(cargoId) {
    const cargo = state.allCargos.find(c => c.id === cargoId); //
    if (!cargo) {
        console.error(`Cargo com ID ${cargoId} não encontrado no estado.`);
        return;
    }

    document.getElementById('cargo-id').value = cargo.id; //
    document.getElementById('cargo-nome').value = cargo.nome_cargo; //
    document.getElementById('cargo-tem-permissoes-admin').checked = cargo.tem_permissoes_admin; //

    // --- INÍCIO DA ADIÇÃO ---
    document.getElementById('cargo-is-client-role').checked = cargo.is_client_role || false; // Preenche a nova caixa
    // --- FIM DA ADIÇÃO ---

    document.getElementById('cargo-submit-btn').textContent = 'Salvar Alterações'; //
    document.getElementById('cargo-nome').focus(); //
}

async function handleDeleteCargo(cargoId, cargoName) {
    // 1. Confirma a ação com o usuário
    if (confirm(`Tem certeza que deseja excluir o cargo "${cargoName}"?`)) {
        try {
            // 2. Chama a API para deletar o cargo no banco de dados
            await api.deleteCargoInDB(cargoId); //
            alert('Cargo excluído com sucesso!'); //

            // --- INÍCIO DO REFINAMENTO ---

            // 3. Remove o cargo da lista local (no 'state')
            //    Isso cria um novo array 'allCargos' sem o item que tem o 'cargoId'
            state.allCargos = state.allCargos.filter(cargo => cargo.id !== cargoId); //

            // 4. Renderiza (redesenha) a lista de cargos com o array atualizado
            //    Isso faz o item sumir da tela instantaneamente.
            render.renderCargoList(state.allCargos); //

            // (A chamada demorada para 'fetchInitialData' foi removida daqui)

            // --- FIM DO REFINAMENTO ---

        } catch (error) {
            // 5. A lógica de tratamento de erro (caso o cargo esteja em uso) é mantida
            if (error.code === '23503') { //
                alert('Impossível excluir! Este cargo está vinculado a um ou mais usuários.'); //
            } else {
                alert('Erro ao excluir cargo: ' + error.message); //
            }
        }
    }
}

async function handleUpdateCondo(event) {
    event.preventDefault(); //
    const form = event.target; //
    const condoId = parseInt(form.elements['edit-condo-id'].value, 10); //
    const termoSingular = utils.getTermSingular(); //

    // Lógica para coletar dados do formulário (mantida)
    const condoData = {
        nome: form.elements['edit-condo-nome'].value.trim(), //
        nome_fantasia: undefined,
        cnpj: undefined,
        grupo_id: form.elements['edit-condo-group'].value ? parseInt(form.elements['edit-condo-group'].value, 10) : null //
    };
    if (state.currentUserProfile?.empresa?.segmento_id === 1) { //
        condoData.nome_fantasia = form.elements['edit-condo-nome-fantasia'].value.trim() || null; //
        condoData.cnpj = form.elements['edit-condo-cnpj'].value.trim() || null; //
    } else {
        condoData.nome_fantasia = condoData.nome;
    }
    Object.keys(condoData).forEach(key => condoData[key] === undefined && delete condoData[key]); //

    if (!condoData.nome) return alert("O campo 'Nome' é obrigatório."); //

    try {
        // --- INÍCIO DO REFINAMENTO ---

        // 1. Chama a API (que agora retorna a entidade atualizada)
        const updatedCondo = await api.updateCondoInDB(condoId, condoData); //

        // 2. Fecha o modal e avisa o usuário
        ui.closeEditCondoModal(); //
        alert(`${termoSingular} atualizado com sucesso!`); //

        // 3. Encontra o índice e substitui a entidade no 'state' local
        const indexToUpdate = state.condominios.findIndex(c => c.id === condoId); //
        if (indexToUpdate !== -1) {
            state.condominios[indexToUpdate] = updatedCondo; //
        } else {
            // Fallback caso não encontre (adiciona ao final)
            state.condominios.push(updatedCondo); //
        }

        // 4. Renderiza (redesenha) a lista
        render.renderCondoList(state.condominios, state.allGroups); //

        // 5. Atualiza os dropdowns em todo o app
        ui.populateDropdowns(state.condominios, state.taskTypes, state.allUsers, state.allGroups, state.currentUserProfile); //

        // (A chamada demorada 'location.reload()' foi removida)

        // --- FIM DO REFINAMENTO ---

    } catch (error) {
        alert(`Erro ao atualizar ${termoSingular}: ` + error.message); //
    }
}

function handleOpenEditCondoModal(condoId) {
    const condo = state.condominios.find(c => c.id === condoId);
    if (!condo) return;

    const termo = utils.getTermSingular();
    const segmentoId = state.currentUserProfile?.empresa?.segmento_id; // Pega o segmento

    // Atualiza apenas o título
    document.querySelector('#edit-condo-modal h3').textContent = `Editar ${termo}`;

    // Chama a função da UI, passando o segmentoId para ela lidar com a visibilidade
    ui.openEditCondoModal(condo, state.allGroups, segmentoId);
}

async function handleSetPassword(event) {
    event.preventDefault();
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    if (newPassword.length < 6) return alert('A senha deve ter no mínimo 6 caracteres.');
    if (newPassword !== confirmPassword) return alert('As senhas não coincidem.');
    const { data, error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) return alert("Erro ao atualizar senha: " + error.message);
    try {
        await api.activateUser(data.user.id);
        alert("Senha definida e usuário ativado com sucesso! Você será redirecionado.");
        location.reload();
    } catch (activateError) {
        alert("Sua senha foi definida, mas houve um erro ao ativar seu perfil. Contate o administrador.");
    }
}

async function handleUpdatePassword(event) {
    event.preventDefault();
    const form = event.target;
    const newPassword = form.elements['change-new-password'].value;
    const confirmPassword = form.elements['change-confirm-password'].value;
    if (newPassword.length < 6) return alert('A nova senha deve ter no mínimo 6 caracteres.');
    if (newPassword !== confirmPassword) return alert('As senhas não coincidem.');
    isPasswordUpdateInProgress = true;
    ui.closeChangePasswordModal();
    try {
        const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
        if (error) throw error;
        alert("Senha alterada com sucesso!");
    } catch (err) {
        isPasswordUpdateInProgress = false;
        alert("Não foi possível alterar a senha. Erro: " + err.message);
    }
}

function handleOpenCreateCondoModal() {
    const termo = utils.getTermSingular(); // Busca o termo correto (ex: "Unidade")
    const segmentoId = state.currentUserProfile?.empresa?.segmento_id; // Pega o segmento do usuário logado

    // 1. Atualiza apenas os textos do modal
    document.querySelector('#create-condo-modal h3').textContent = `Novo ${termo}`;
    document.querySelector('#create-condo-form button[type="submit"]').textContent = `Criar ${termo}`;

    // 2. Chama a função da UI, passando o segmentoId para ela lidar com os campos
    ui.openCreateCondoModal(state.allGroups, segmentoId);
}

async function handleCreateCondo(event) {
    event.preventDefault(); //
    const form = event.target; //
    const termoSingular = utils.getTermSingular(); //

    // Lógica para coletar dados do formulário (mantida)
    const condoData = {
        nome: form.elements['create-condo-nome'].value.trim(), //
        nome_fantasia: undefined,
        cnpj: undefined,
        grupo_id: form.elements['create-condo-group'].value ? parseInt(form.elements['create-condo-group'].value, 10) : null, //
        empresa_id: state.currentUserProfile.empresa_id //
    };
    if (state.currentUserProfile?.empresa?.segmento_id === 1) { //
        condoData.nome_fantasia = form.elements['create-condo-nome-fantasia'].value.trim() || null; //
        condoData.cnpj = form.elements['create-condo-cnpj'].value.trim() || null; //
    } else {
        condoData.nome_fantasia = condoData.nome;
    }
    Object.keys(condoData).forEach(key => condoData[key] === undefined && delete condoData[key]); //

    if (!condoData.nome) return alert("O campo 'Nome' é obrigatório."); //

    try {

        const { data: newCondo, error: createError } = await api.createCondoInDBAndReturn(condoData); //

        // Se a API retornar um erro, paramos aqui
        if (createError) throw createError;
        // --- FIM DA CORREÇÃO ---

        // 2. Fecha o modal e avisa o usuário
        ui.closeCreateCondoModal(); //
        alert(`${termoSingular} criado com sucesso!`); //

        // 3. Adiciona a nova entidade (o objeto 'newCondo' correto) ao 'state' local
        state.condominios.push(newCondo); //

        // 4. Renderiza (redesenha) a lista
        render.renderCondoList(state.condominios, state.allGroups); //

        // 5. Atualiza os dropdowns em todo o app
        ui.populateDropdowns(state.condominios, state.taskTypes, state.allUsers, state.allGroups, state.currentUserProfile); //

    } catch (error) {
        alert(`Erro ao criar ${termoSingular}: ` + error.message); //
    }
}

// Função auxiliar para desenhar a notificação no ícone da aba (Favicon)
function updateFavicon(count) {
    const favicon = document.getElementById('favicon');
    if (!favicon) return;

    const img = new Image();
    img.src = 'favicon/favicon-96x96.png'; 
    img.crossOrigin = "anonymous";

    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');

        ctx.drawImage(img, 0, 0, 32, 32);

        if (count > 0) {
            const x = 22, y = 10, radius = 8;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            ctx.font = 'bold 10px sans-serif';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const text = count > 9 ? '9+' : count.toString();
            ctx.fillText(text, x, y + 1);
            
            document.title = `(${count}) TasKCom`;
        } else {
            document.title = 'TasKCom - Gestão de Tarefas';
        }

        favicon.href = canvas.toDataURL('image/png');
    };
}

    async function verificarNotificacoes() {
    if (!state.currentUserProfile) return;

    try {
        // 1. Busca a contagem
        const { count, error } = await supabaseClient
            .from('notificacoes')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', state.currentUserProfile.id)
            .eq('lida', false);

        if (error) throw error;

        // 2. Atualiza UI Interna
        const badge = document.getElementById('notification-badge');
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }

        // 3. Atualiza Favicon e Badge
        if (typeof updateFavicon === 'function') updateFavicon(count);
        if ('setAppBadge' in navigator) {
            if (count > 0) navigator.setAppBadge(count).catch(() => {});
            else navigator.clearAppBadge().catch(() => {});
        }

        // 4. Toca o Som (Se permitido e se houver novidade)
        if (
            typeof state.lastNotifiedCount === 'number' &&
            count > state.lastNotifiedCount &&
            state.audioUnlocked
        ) {
            const sound = document.getElementById('notification-sound');
            if (sound) {
                sound.currentTime = 0;
                sound.play().catch(e => console.warn("Som bloqueado pelo navegador (falta interação):", e));
            }
        }

        state.lastNotifiedCount = count;

    } catch (error) {
        console.error("Erro ao verificar notificações:", error);
    }
}

function unlockAudio() {
    const sound = document.getElementById('notification-sound');
    if (sound) {
        sound.play().then(() => {
            sound.pause(); // 🔇 Imediatamente pausa
            sound.currentTime = 0;
            console.log("Áudio desbloqueado com sucesso.");
            state.audioUnlocked = true;
        }).catch(e => {
            console.warn("Falha ao desbloquear áudio:", e);
        });
    }
}

// --- FUNÇÕES DE AÇÃO DA TAREFA (RESTAURADAS) ---

function handleOpenEditTaskModal(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    // 1. Garante que os dropdowns (Usuários, Tipos) estejam preenchidos
    ui.populateDropdowns(state.condominios, state.taskTypes, state.allUsers, state.allGroups, state.currentUserProfile);

    // 2. Preenche os campos do formulário
    const form = document.getElementById('edit-task-form');
    if (form) {
        document.getElementById('edit-task-id').value = task.id;
        document.getElementById('edit-task-title').value = task.titulo;
        document.getElementById('edit-task-desc').value = task.descricao || '';
        
        const dataFormatada = task.data_conclusao_prevista ? task.data_conclusao_prevista.split('T')[0] : '';
        document.getElementById('edit-task-due-date').value = dataFormatada;

        // Selects simples
        const typeSelect = document.getElementById('edit-task-type');
        if (typeSelect) typeSelect.value = task.tipo_tarefa_id;

        const assigneeSelect = document.getElementById('edit-task-assignee');
        if (assigneeSelect) assigneeSelect.value = task.responsavel_id;

        // --- CORREÇÃO DO CONDOMÍNIO (Preenche ambos os campos) ---
        const condoInput = document.getElementById('edit-task-condominio');
        if (condoInput) condoInput.value = task.condominio_id;
        
        const condoSearch = document.getElementById('edit-task-condo-search');
        if (condoSearch) {
            // Tenta achar o nome na lista de condomínios carregada
            const condo = state.condominios.find(c => c.id == task.condominio_id);
            // Se achar, usa o nome. Se não, usa o nome que veio com a tarefa (fallback)
            condoSearch.value = condo ? (condo.nome_fantasia || condo.nome) : (task.condominio_nome_view || '');
        }
    }

    // 3. Carrega Histórico (Sem travar a UI)
    // 3. Carrega Histórico Detalhado
    const historyList = document.getElementById('task-history-list');
    if (historyList) {
        historyList.innerHTML = '<p style="color: #6b7280; font-style: italic;">Carregando...</p>';
        
        api.fetchTaskHistory(taskId).then(history => {
             if (!history || history.length === 0) {
                historyList.innerHTML = '<p style="color: #6b7280;">Nenhum histórico.</p>';
            } else {
                historyList.innerHTML = history.map(h => {
                    const date = new Date(h.created_at).toLocaleString('pt-BR');
                    
                    // Lógica de fallback para o nome do usuário
                    let userName = h.usuario_nome; 
                    if (!userName && state.allUsers) {
                        const userFound = state.allUsers.find(u => u.id === h.usuario_id);
                        if (userFound) userName = userFound.nome_completo;
                    }
                    userName = userName || 'Sistema'; 
                    
                    let text = '';

                    if (h.evento === 'Criação') {
                        const criadorNoJson = h.detalhes?.criado_por;
                        const designadoNoJson = h.detalhes?.designado_para;

                        // Define o nome final do criador
                        const nomeCriadorFinal = criadorNoJson || userName;

                        text = `Criado por <strong>${nomeCriadorFinal}</strong>`;

                        // --- LÓGICA DE COMPARAÇÃO ---
                        // Só mostra "designado para" se existir E se for DIFERENTE do criador
                        if (designadoNoJson && designadoNoJson !== nomeCriadorFinal) {
                             text += ` e designado para <strong>${designadoNoJson}</strong>`;
                        }
                        // ----------------------------
                    } 
                    else if (h.evento === 'Re-designação') {
                        const de = h.detalhes?.de || '?';
                        const para = h.detalhes?.para || '?';
                        text = `Re-designado de <em>${de}</em> para <strong>${para}</strong> por ${userName}`;
                    }
                    else if (h.evento === 'Alteração de Status') {
                         const para = h.detalhes?.para || 'novo status';
                         text = `Status alterado para <strong>${para}</strong> por ${userName}`;
                    }
                    else if (h.detalhes && h.detalhes.de && h.detalhes.para) {
                         text = `${h.evento}: de ${h.detalhes.de} para ${h.detalhes.para} (por ${userName})`;
                    }
                    else {
                        text = `${h.evento} (por ${userName})`;
                    }

                    return `<div style="border-bottom:1px solid #eee;padding:8px 5px;font-size:0.85em;line-height:1.4;">
                                <span style="color:#666;font-size:0.9em;">${date}</span><br>
                                ${text}
                            </div>`;
                }).join('');
            }
        });
    }

    // 4. Abre o modal (Simplesmente muda o display)
    const modal = document.getElementById('edit-task-modal');
    if (modal) modal.style.display = 'flex';
}

async function handleToggleTaskStatus(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    const currentStatus = task.status;
    // Define o novo status visualmente para feedback imediato (opcional, mas bom para UX)
    const newStatus = currentStatus === 'pending' ? 'completed' : 'pending';

    try {
        // Chama a API
        await api.toggleStatusInDB(taskId, currentStatus); //

        // Atualiza o estado local
        task.status = newStatus;
        
        // Se completou, atualiza a data de conclusão localmente para refletir na UI
        if (newStatus === 'completed') {
            task.data_conclusao = new Date().toISOString();
        } else {
            task.data_conclusao = null;
        }

        // Redesenha a lista
        state.tasksToDisplayForPdf = render.renderTasks(state); //

    } catch (error) {
        console.error("Erro ao alterar status:", error);
        alert("Não foi possível alterar o status da tarefa.");
    }
}

async function handleDeleteTask(taskId, taskTitle) {
    if (confirm(`Tem certeza que deseja excluir a tarefa "${taskTitle}"?`)) {
        try {
            await api.deleteTaskInDB(taskId); //
            
            // Remove a tarefa da lista local
            state.tasks = state.tasks.filter(t => t.id !== taskId);
            
            // Redesenha a lista
            state.tasksToDisplayForPdf = render.renderTasks(state); //
            alert("Tarefa excluída com sucesso.");

        } catch (error) {
            console.error("Erro ao excluir tarefa:", error);
            alert("Erro ao excluir tarefa: " + error.message);
        }
    }
}


async function handleTaskListClick(event) {
    event.stopPropagation(); 

    // Tenta encontrar o botão mais próximo
    const button = event.target.closest('button');
    
    // Se não clicou em um botão, não faz nada
    if (!button) return;

    // --- 1. LÓGICA DO BOTÃO "CARREGAR MAIS" ---
    if (button.id === 'load-more-btn') {
        const btnOriginalText = button.textContent;
        button.textContent = "Carregando...";
        button.disabled = true;

        const filters = { ...state.activeFilters };
        const searchTerm = document.getElementById('search-term-input').value.trim();
        filters.searchTerm = searchTerm;
        if (filters.status === 'all') filters.status = null;
        
        const currentCount = state.tasks.length;

        try {
            const newTasks = await api.searchTasks(filters, state.currentUserProfile, 20, currentCount); 
            if (newTasks.length > 0) {
                state.tasks = [...state.tasks, ...newTasks];
                state.displayLimit += 20;
                state.tasksToDisplayForPdf = render.renderTasks(state);
            } else {
                button.remove();
                alert("Não há mais tarefas para carregar.");
            }
        } catch (error) {
            console.error("Erro ao carregar mais tarefas:", error);
            button.textContent = btnOriginalText;
            button.disabled = false;
        }
        return;
    }

    // --- 2. LÓGICA DAS AÇÕES DE TAREFA (Editar, Concluir, Excluir) ---
    const action = button.dataset.action;
    const taskIdRaw = button.dataset.taskid; 
    const taskId = taskIdRaw ? parseInt(taskIdRaw, 10) : null;

    if (!action || !taskId) return;

    if (action === 'edit-task') {
        handleOpenEditTaskModal(taskId);
    } 
    else if (action === 'toggle-task-status') {
        handleToggleTaskStatus(taskId);
    } 
    else if (action === 'delete-task') {
        const task = state.tasks.find(t => t.id === taskId);
        if (task) {
            handleDeleteTask(taskId, task.titulo);
        }
    }
}

function handleUserListClick(event) {
    const button = event.target.closest('.task-action-btn');
    if (!button) return;
    const userId = button.dataset.userid;
    const action = button.dataset.action;
    if (action === 'edit-user') handleOpenEditUserModal(userId);
    if (action === 'toggle-user-status') handleToggleUserStatus(userId);
}

function handleCondoListClick(event) {
    const button = event.target.closest('.task-action-btn');
    if (!button) return;
    const condoId = parseInt(button.dataset.condoid, 10);
    const action = button.dataset.action;
    if (action === 'edit-condo') handleOpenEditCondoModal(condoId);
    if (action === 'delete-condo') handleDeleteCondo(condoId);
}

function handleTaskTypeListClick(event) {
    const button = event.target.closest('.task-action-btn');
    if (!button) return;
    const typeId = parseInt(button.dataset.typeid, 10);
    const action = button.dataset.action;
    if (action === 'edit-task-type') handleEditTaskType(typeId);
    if (action === 'delete-task-type') handleDeleteTaskType(typeId);
}

function handleGroupListClick(event) {
    const button = event.target.closest('.task-action-btn');
    if (!button) return;
    const groupId = parseInt(button.dataset.groupid, 10);
    const groupName = button.dataset.groupname;
    const action = button.dataset.action;
    if (action === 'edit-group') handleEditGroup(groupId, groupName);
    if (action === 'delete-group') handleDeleteGroup(groupId, groupName);
}

function handleCargoListClick(event) {
    const button = event.target.closest('.task-action-btn');
    if (!button) return;
    const cargoId = parseInt(button.dataset.cargoid, 10);
    const cargoName = button.dataset.cargoname;
    const action = button.dataset.action;
    if (action === 'edit-cargo') handleEditCargo(cargoId, cargoName);
    if (action === 'delete-cargo') handleDeleteCargo(cargoId, cargoName);
}

// --- FUNÇÃO CENTRAL DE BUSCA (COM FILTRO 'TODAS') ---
async function executeTaskSearch() {
    const filters = { ...state.activeFilters };
    const searchTerm = document.getElementById('search-term-input').value.trim();
    filters.searchTerm = searchTerm;
    state.activeFilters.searchTerm = searchTerm;

    // Lógica do filtro "Todas"
    if (filters.status === 'all') filters.status = null;

    const list = document.getElementById('task-list');
    if (list) list.innerHTML = '<p style="text-align:center; color:#6b7280;">Buscando tarefas...</p>';

    try {
        // --- RESET DA PAGINAÇÃO ---
        state.displayLimit = 20; // Reinicia o contador visual
        
        // Busca APENAS as primeiras 20 tarefas (página 1)
        const tasks = await api.searchTasks(filters, state.currentUserProfile, 20, 0); // limit 20, offset 0
        
        state.tasks = tasks; // Substitui a lista atual
        
        // Renderiza
        state.tasksToDisplayForPdf = render.renderTasks(state);

    } catch (error) {
        if (list) list.innerHTML = `<p style="text-align:center; color:#ef4444;">Erro ao buscar tarefas: ${error.message}</p>`;
    }
}

// Função para recarregar o dashboard com os filtros atuais
async function refreshDashboard() {
    const userId = document.getElementById('dashboard-user-filter')?.value;
    const dateStart = document.getElementById('dashboard-date-start')?.value;
    const dateEnd = document.getElementById('dashboard-date-end')?.value;

    try {
        const kpiData = await api.fetchDashboardKPIs(userId, dateStart, dateEnd);
        render.renderDashboard(state, kpiData); //
    } catch (err) {
        console.error("Erro ao atualizar dashboard:", err);
    }
}

function setupPasswordToggle(toggleId, inputId) {
    const toggleBtn = document.getElementById(toggleId);
    const passwordInput = document.getElementById(inputId);

    if (toggleBtn && passwordInput) {
        toggleBtn.addEventListener('click', () => {
            const isHidden = passwordInput.type === 'password';
            passwordInput.type = isHidden ? 'text' : 'password';
            toggleBtn.textContent = isHidden ? '👁️' : '🙈';
        });
    }
}


// --- SETUP INICIAL E LISTENERS ---
 function setupEventListeners() {

     if (listenersInitialized) return;
    listenersInitialized = true;

    const unlockAudio = () => {
        const sound = document.getElementById('notification-sound');
        if (sound) {
            sound.volume = 0; // Mudo
            sound.play().then(() => {
                sound.pause();
                sound.currentTime = 0;
                sound.volume = 1; // Restaura volume
                state.audioUnlocked = true; // Marca como desbloqueado
                console.log("Sistema de áudio desbloqueado para Android.");
            }).catch(e => console.log("Tentativa de desbloqueio de áudio falhou:", e));
        }
        // Remove o listener após a primeira vez
        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('touchstart', unlockAudio);

        // 2. Ativa a função (ISSO FALTAVA NO SEU TRECHO)
        document.addEventListener('click', unlockAudio);
        document.addEventListener('touchstart', unlockAudio);
        
        // --- FIM DO BLOCO DE ÁUDIO ---
    };
  

    document.addEventListener('click', unlockAudio, { once: true });

    document.getElementById('nav-super-admin')?.addEventListener('click', async () => {
        try {
            ui.showView('super-admin-view');
            const todasAsEmpresas = await api.fetchAllCompaniesForSuperAdmin();
            state.todasAsEmpresas = todasAsEmpresas; // <-- ARMAZENA OS DADOS
            render.renderSuperAdminDashboard(todasAsEmpresas);
        } catch (error) {
            alert("Acesso negado ou erro ao carregar dados: " + error.message);
            ui.showView('view-tasks-view');
        }
    });

    // --- (Novo listener para o botão de busca) ---
    document.getElementById('search-tasks-btn')?.addEventListener('click', executeTaskSearch);
    // Adiciona listener para a tecla "Enter" no campo de busca
    document.getElementById('search-term-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Impede o envio do formulário (caso exista)
            executeTaskSearch();
        }
    });

    document.getElementById('super-admin-table-body')?.addEventListener('click', async (event) => { //
        const editButton = event.target.closest('.btn-edit'); //
        if (editButton) {
            const empresaId = parseInt(editButton.dataset.empresaId, 10); //
            // Graças ao novo SQL, o objeto 'empresa' agora contém 'plano_id'
            const empresa = state.todasAsEmpresas.find(e => e.id === empresaId); //

            if (empresa) {
                try {
                    // 1. Busca a lista de todos os planos
                    const planos = await api.fetchAllPlans(); //

                    // 2. Popula o dropdown de planos
                    const planoSelect = document.getElementById('edit-empresa-plano');
                    planoSelect.innerHTML = ''; // Limpa "Carregando..."
                    planos.forEach(plano => {
                        const option = document.createElement('option');
                        option.value = plano.id;
                        option.textContent = plano.nome;
                        planoSelect.appendChild(option);
                    });

                    // 3. Preenche o modal com os dados da empresa
                    document.getElementById('edit-empresa-id').value = empresa.id; //
                    document.getElementById('edit-empresa-nome').value = empresa.nome_empresa; //
                    document.getElementById('edit-empresa-cnpj').value = empresa.cnpj_cpf; //
                    document.getElementById('edit-empresa-status').value = empresa.status_assinatura; //

                    // --- INÍCIO DA CORREÇÃO ---
                    // Define o valor do select usando o 'plano_id' que já veio no objeto 'empresa'
                    planoSelect.value = empresa.plano_id || ''; // Garante que seleciona o plano correto
                    // (A chamada extra ao supabaseClient.from('empresas')... foi removida)
                    // --- FIM DA CORREÇÃO ---
                    document.getElementById('edit-empresa-logo-url').value = empresa.logo_url || ''; // <<<--- ADICIONE ESTA LINHA
                    // 4. Mostra o modal
                    document.getElementById('edit-empresa-modal').style.display = 'flex'; //

                } catch (error) {
                    alert("Erro ao carregar dados para edição: " + error.message);
                }
            }
        }
    });

    document.getElementById('access-denied-logout-btn')?.addEventListener('click', logout);

    document.getElementById('edit-empresa-form')?.addEventListener('submit', async (event) => { //
        event.preventDefault(); //
        const form = event.target; //
        const empresaId = parseInt(form.elements['edit-empresa-id'].value, 10); //

        // --- INÍCIO DA ALTERAÇÃO ---
        const dadosAtualizados = {
            nome_empresa: form.elements['edit-empresa-nome'].value, //
            cnpj: form.elements['edit-empresa-cnpj'].value, //
            status_assinatura: form.elements['edit-empresa-status'].value, //
            plano_id: parseInt(form.elements['edit-empresa-plano'].value, 10), // <-- DADO ADICIONADO
            logo_url: form.elements['edit-empresa-logo-url'].value.trim() || null // <<<--- ADICIONE ESTA LINHA
        };
        // --- FIM DA ALTERAÇÃO ---

        try {
            await api.updateCompanyBySuperAdmin(empresaId, dadosAtualizados); //
            alert('Empresa atualizada com sucesso!'); //
            document.getElementById('edit-empresa-modal').style.display = 'none'; //
            // Recarrega a lista para mostrar os dados atualizados
            document.getElementById('nav-super-admin').click(); //
        } catch (error) {
            alert('Falha ao atualizar a empresa: ' + error.message); //
        }
    });

    document.getElementById('edit-empresa-modal-close-btn')?.addEventListener('click', () => {
        document.getElementById('edit-empresa-modal').style.display = 'none';
    });
    document.getElementById('edit-empresa-modal-cancel-btn')?.addEventListener('click', () => {
        document.getElementById('edit-empresa-modal').style.display = 'none';
    });

    // --- INÍCIO DA CORREÇÃO (LOGIN COM ENTER) ---
    // Permite fazer login apertando ENTER nos campos de email ou senha
    const loginInputs = ['email', 'password'];
    
    loginInputs.forEach(id => {
        const inputElement = document.getElementById(id);
        if (inputElement) {
            inputElement.addEventListener('keypress', (event) => {
                // Se a tecla pressionada for ENTER
                if (event.key === 'Enter') {
                    event.preventDefault(); // Evita comportamentos padrão estranhos
                    // Simula um clique no botão de entrar
                    document.getElementById('login-btn')?.click();
                }
            });
        }
    });
    // --- FIM DA CORREÇÃO ---

    // --- Autenticação ---
    document.getElementById('login-btn')?.addEventListener('click', login);
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    setupPasswordToggle('toggle-password', 'password'); // Tela de Login
    setupPasswordToggle('toggle-new-password', 'change-new-password'); // Modal Alterar Senha
    setupPasswordToggle('toggle-confirm-password', 'change-confirm-password');
    document.getElementById('forgot-password-link')?.addEventListener('click', handleForgotPassword);
    document.getElementById('record-desc-btn')?.addEventListener('click', handleAudioTranscription);

    // --- Navegação Principal e de Utilidades ---
    document.getElementById('nav-create')?.addEventListener('click', () => ui.showView('create-task-view'));
    document.getElementById('nav-view')?.addEventListener('click', () => ui.showView('view-tasks-view'));
    document.getElementById('nav-dashboard')?.addEventListener('click', () => ui.showView('dashboard-view'));
    document.getElementById('nav-admin')?.addEventListener('click', () => ui.showView('admin-menu-view'));
    document.getElementById('change-password-btn')?.addEventListener('click', ui.openChangePasswordModal);

    // --- Navegação Interna do Admin ---
    document.getElementById('admin-menu-view')?.addEventListener('click', (event) => {
        const button = event.target.closest('.admin-menu-btn');
        if (button && button.dataset.view) {
            ui.showView(button.dataset.view);
        }
    });
    document.getElementById('main-container').addEventListener('click', (event) => {
        const backButton = event.target.closest('.btn-back');
        if (backButton && backButton.dataset.view) {
            ui.showView(backButton.dataset.view);
        }
    });

    // --- Formulários ---
    document.getElementById('task-form')?.addEventListener('submit', handleCreateTask);

    // --- CORREÇÃO: Listener unificado com validação para edição de tarefa ---
    document.getElementById('edit-task-form')?.addEventListener('submit', async (event) => {
        // 1. Previne o envio padrão para podermos validar
        // (Se a função handleUpdateTask também tiver preventDefault, não tem problema chamar aqui antes)
        
        const assigneeId = document.getElementById('edit-task-assignee').value;
        const condominioId = document.getElementById('edit-task-condominio').value; 

        // 2. Executa a Nova Validação (Síndico x Condomínio)
        if (!validarVinculoSindico(assigneeId, condominioId)) {
            event.preventDefault(); // Cancela o envio se falhar
            return; // Para a execução
        }

        // 3. Se passou na validação, chama a função original de atualização
        handleUpdateTask(event);
    });
    // -----------------------------------------------------------------------

    document.getElementById('create-user-form')?.addEventListener('submit', handleCreateUser);
    document.getElementById('edit-user-form')?.addEventListener('submit', handleUpdateUser);
    document.getElementById('edit-condo-form')?.addEventListener('submit', handleUpdateCondo);
    document.getElementById('create-condo-form')?.addEventListener('submit', handleCreateCondo);
    document.getElementById('task-type-form')?.addEventListener('submit', handleCreateOrUpdateTaskType);
    document.getElementById('group-form')?.addEventListener('submit', handleCreateOrUpdateGroup);
    document.getElementById('cargo-form')?.addEventListener('submit', handleCreateOrUpdateCargo);
    document.getElementById('change-password-form')?.addEventListener('submit', handleUpdatePassword);
    document.getElementById('set-password-form')?.addEventListener('submit', handleSetPassword);
    // --- LISTENERS RESTAURADOS PARA "VER TAREFAS" ---
    const filters = ['filter-status', 'filter-assignee', 'filter-date-start', 'filter-date-end', 'filter-task-type', 'filter-group'];
    filters.forEach(id => {
        document.getElementById(id)?.addEventListener('change', (e) => {
            state.displayLimit = 20;
            const filterMap = {
                'filter-status': 'status',
                'filter-assignee': 'assigneeId',
                'filter-date-start': 'dateStart',
                'filter-date-end': 'dateEnd',
                'filter-task-type': 'taskTypeId',
                'filter-group': 'groupId'
            };
            state.activeFilters[filterMap[id]] = e.target.value;
            // state.tasksToDisplayForPdf = render.renderTasks(state);
            executeTaskSearch();
        });
    });

    document.getElementById('clear-filters')?.addEventListener('click', () => {
        state.displayLimit = 20; //
        const filterBarForm = document.getElementById('filter-bar')?.closest('div'); //
        if (filterBarForm) {
            Array.from(filterBarForm.querySelectorAll('select, input[type="date"]')).forEach(input => input.value = '');
        }
        document.getElementById('filter-condo-search').value = ''; //

        // --- INÍCIO DA CORREÇÃO ---
        // 1. Limpa o novo campo de busca por palavra-chave
        document.getElementById('search-term-input').value = ''; //

        // 2. Reseta o 'state' (incluindo o searchTerm)
        state.activeFilters = { searchTerm: '', condominioId: '', status: 'in_progress', dateStart: '', dateEnd: '', assigneeId: '', taskTypeId: '', groupId: '' }; //
        // --- FIM DA CORREÇÃO ---

        document.getElementById('filter-status').value = 'in_progress'; //

        // Executa a busca com os filtros limpos (que trará as tarefas "Em Andamento")
        executeTaskSearch(); //
    });

    // --- Listeners do Dashboard (Atualizados) ---
    document.getElementById('dashboard-user-filter')?.addEventListener('change', refreshDashboard);
    document.getElementById('dashboard-date-start')?.addEventListener('change', refreshDashboard);
    document.getElementById('dashboard-date-end')?.addEventListener('change', refreshDashboard);

    document.getElementById('export-pdf-btn')?.addEventListener('click', handleExportToPDF);
    document.getElementById('template-select')?.addEventListener('change', handleTemplateSelect);
    document.getElementById('import-condo-btn')?.addEventListener('click', () => document.getElementById('condo-csv-input').click());
    document.getElementById('condo-csv-input')?.addEventListener('change', handleCondoImport);
    document.getElementById('download-template-btn')?.addEventListener('click', handleDownloadTemplate);

    // --- Outros Listeners ---
    document.getElementById('add-condo-btn')?.addEventListener('click', handleOpenCreateCondoModal);
    document.getElementById('add-user-btn')?.addEventListener('click', handleOpenCreateUserModal);

    // (Listeners de fechar modais)
    document.getElementById('create-user-modal-close-btn')?.addEventListener('click', ui.closeCreateUserModal);
    document.getElementById('create-user-modal-cancel-btn')?.addEventListener('click', ui.closeCreateUserModal);
    document.getElementById('create-condo-modal-close-btn')?.addEventListener('click', ui.closeCreateCondoModal);
    document.getElementById('create-condo-modal-cancel-btn')?.addEventListener('click', ui.closeCreateCondoModal);
    document.getElementById('edit-task-modal-close-btn')?.addEventListener('click', ui.closeEditModal);
    document.getElementById('edit-task-modal-cancel-btn')?.addEventListener('click', ui.closeEditModal);
    document.getElementById('edit-user-modal-close-btn')?.addEventListener('click', ui.closeEditUserModal);
    document.getElementById('edit-user-modal-cancel-btn')?.addEventListener('click', ui.closeEditUserModal);
    document.getElementById('edit-condo-modal-close-btn')?.addEventListener('click', ui.closeEditCondoModal);
    document.getElementById('edit-condo-modal-cancel-btn')?.addEventListener('click', ui.closeEditCondoModal);
    document.getElementById('change-password-close-btn')?.addEventListener('click', ui.closeChangePasswordModal);
    document.getElementById('change-password-cancel-btn')?.addEventListener('click', ui.closeChangePasswordModal);

    // --- Listeners para o Modal de Instruções ---
    document.getElementById('open-instructions-link')?.addEventListener('click', (event) => {
        event.preventDefault(); // Impede o recarregamento da página
        ui.openInstructionsModal();
    });

    document.getElementById('instructions-modal-close-btn')?.addEventListener('click', ui.closeInstructionsModal);
    document.getElementById('instructions-modal-ok-btn')?.addEventListener('click', ui.closeInstructionsModal);

    // Padrão à prova de falhas para Event Delegation nas listas dinâmicas
    document.getElementById('task-list')?.removeEventListener('click', handleTaskListClick);
    document.getElementById('task-list')?.addEventListener('click', handleTaskListClick);
    document.getElementById('user-list')?.removeEventListener('click', handleUserListClick);
    document.getElementById('user-list')?.addEventListener('click', handleUserListClick);
    document.getElementById('condo-list')?.removeEventListener('click', handleCondoListClick);
    document.getElementById('condo-list')?.addEventListener('click', handleCondoListClick);
    document.getElementById('task-type-list')?.removeEventListener('click', handleTaskTypeListClick);
    document.getElementById('task-type-list')?.addEventListener('click', handleTaskTypeListClick);
    document.getElementById('group-list')?.removeEventListener('click', handleGroupListClick);
    document.getElementById('group-list')?.addEventListener('click', handleGroupListClick);
    document.getElementById('cargo-list')?.removeEventListener('click', handleCargoListClick);
    document.getElementById('cargo-list')?.addEventListener('click', handleCargoListClick);

    // --- Listeners para o Modal de Notificações ---
    document.getElementById('notification-bell-container')?.addEventListener('click', async () => {
        const { data: notifications, error } = await supabaseClient
            .from('notificacoes_detalhadas')
            .select('*')
            .eq('user_id', state.currentUserProfile.id)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) {
            console.error("Erro ao buscar notificações:", error);
            return;
        }

        const listContainer = document.getElementById('notifications-list');
        if (!listContainer) return;

        if (notifications && notifications.length > 0) {
            listContainer.innerHTML = notifications.map(n => {
                const data = new Date(n.created_at).toLocaleString('pt-BR');
                return `
                    <div class="notification-item ${n.lida ? '' : 'unread'}" data-task-id="${n.tarefa_id}" data-notification-id="${n.id}">
                        <p>${n.mensagem}</p>
                        <small>${data}</small>
                    </div>
                `;
            }).join('');
        } else {
            listContainer.innerHTML = '<p style="text-align: center; color: #6b7280;">Nenhuma notificação recente.</p>';
        }

        ui.openNotificationsModal();

        // Limpa o contador visual, marca como lidas E ATUALIZA O FAVICON
        const badge = document.getElementById('notification-badge');
        if (badge) badge.style.display = 'none';
        state.unreadNotifications = 0;
        updateFavicon(0); // <-- ATUALIZA O FAVICON PARA O NORMAL

        const unreadIds = notifications.filter(n => !n.lida).map(n => n.id);
        if (unreadIds.length > 0) {
            await api.markNotificationAsRead(unreadIds);
        }
    });

    document.getElementById('notifications-modal-close-btn')?.addEventListener('click', ui.closeNotificationsModal);
    document.getElementById('notifications-modal-ok-btn')?.addEventListener('click', ui.closeNotificationsModal);

    // --- Listener para o Sino de Notificações ---
    document.getElementById('notification-bell-container')?.addEventListener('click', async () => {
        // Busca as 10 notificações mais recentes não lidas do usuário
        const { data: notifications, error } = await supabaseClient
            .from('notificacoes_detalhadas') // Usando a view para ter mais detalhes
            .select('*')
            .eq('user_id', state.currentUserProfile.id)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) {
            console.error("Erro ao buscar notificações:", error);
            return;
        }

        const listContainer = document.getElementById('notifications-list');
        if (!listContainer) return;

        if (notifications && notifications.length > 0) {
            listContainer.innerHTML = notifications.map(n => {
                const data = new Date(n.created_at).toLocaleString('pt-BR');
                return `
                    <div class="notification-item ${n.lida ? '' : 'unread'}" data-task-id="${n.tarefa_id}" data-notification-id="${n.id}">
                        <p>${n.mensagem}</p>
                        <small>${data}</small>
                    </div>
                `;
            }).join('');
        } else {
            listContainer.innerHTML = '<p style="text-align: center; color: #6b7280;">Nenhuma notificação recente.</p>';
        }

        // Abre o modal
        ui.openNotificationsModal();

        // Limpa o contador visual e marca as notificações como lidas no banco
        const badge = document.getElementById('notification-badge');
        if (badge) badge.style.display = 'none';
        state.unreadNotifications = 0;
        updateFavicon(0);

        const unreadIds = notifications.filter(n => !n.lida).map(n => n.id);
        if (unreadIds.length > 0) {
            await api.markNotificationAsRead(unreadIds);
        }
    });

    // Listener para cliques DENTRO da lista de notificações
    // Listener para cliques DENTRO da lista de notificações
    document.getElementById('notifications-list')?.addEventListener('click', async (event) => {
        const item = event.target.closest('.notification-item');
        if (item && item.dataset.taskId) {
            const taskId = item.dataset.taskId;
            const notificationId = item.dataset.notificationId;
            
            // 1. Fecha o modal e mostra a tela
            ui.closeNotificationsModal(); //
            ui.showView('view-tasks-view'); //
            
            try {
                // 2. Busca a tarefa específica no banco (Dados frescos)
                const task = await api.fetchTaskById(taskId); //
                
                if (task) {
                    // 3. Força a lista a mostrar APENAS essa tarefa (Modo Foco)
                    state.tasks = [task]; //
                    
                    // 4. Renderiza usando os dados de condomínio que JÁ estão no state
                    // (Não recarregamos fetchInitialData aqui para evitar limpar os condomínios)
                    state.tasksToDisplayForPdf = render.renderTasks(state); //
                    
                    // 5. Destaca visualmente o card
                    setTimeout(() => {
                        const cardToFocus = document.querySelector(`.task-card .btn-edit[data-taskid="${taskId}"]`)?.closest('.task-card');
                        if (cardToFocus) {
                            cardToFocus.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            cardToFocus.classList.add('highlight');
                            setTimeout(() => cardToFocus.classList.remove('highlight'), 2000);
                        }
                    }, 100);
                }

                // 6. Marca a notificação como lida (se existir ID)
                if (notificationId) {
                    await api.markNotificationAsRead([notificationId]); //
                    await verificarNotificacoes(); // Atualiza o contador
                }

            } catch (error) {
                console.error("Erro ao carregar tarefa da notificação:", error);
                alert("Não foi possível carregar a tarefa. Ela pode ter sido excluída.");
            }
        }
    });

    // --- CORREÇÃO PARA ÁUDIO NO ANDROID ---
    // Toca um som mudo no primeiro clique para desbloquear o Autoplay
    // document.addEventListener('click', unlockAudio);
    // document.addEventListener('touchstart', unlockAudio); // Essencial para celular

    document.addEventListener('click', async () => {
        if (Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    }, { once: true });

    // --- LÓGICA DE DEPURAÇÃO (Remover depois) ---
    document.getElementById('btn-debug-notification')?.addEventListener('click', async () => {
        // 1. Tenta tocar o som
        const sound = document.getElementById('notification-sound');
        if (sound) {
            sound.currentTime = 0;
            sound.play().then(() => alert("Som tocou!")).catch(e => alert("Erro som: " + e.message));
        }

        // 2. Tenta disparar notificação visual
        if (Notification.permission !== 'granted') {
            alert("Permissão não concedida: " + Notification.permission);
            await Notification.requestPermission();
        }

        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) {
                reg.showNotification('Teste TaskCom', {
                    body: 'Se você está vendo isso, o sistema funciona!',
                    icon: '/favicon/favicon-96x96.png',
                    vibrate: [200, 100, 200]
                }).catch(e => alert("Erro SW showNotification: " + e.message));
            } else {
                alert("Service Worker não encontrado! Verifique se sw.js está na raiz.");
            }
        } else {
            alert("Navegador não suporta Service Worker.");
        }
    });

    // Evento global para troca de view
    window.addEventListener('viewChanged', handleViewChange);
}

// O restante da inicialização... */
async function startApp() {
    setupEventListeners(); //
    ui.setupPWAInstallHandlers(); //

    const { data: { session } } = await supabaseClient.auth.getSession(); //

    if (session) {

        // Etapa 1: Verificar o status do acesso (mantido)
        const acessoLiberado = await api.verificarStatusAcesso(); //
        if (!acessoLiberado) {
            document.getElementById('main-container').style.display = 'none';
            document.getElementById('access-denied-overlay').style.display = 'flex'; //
            return;
        }

        if (appInitialized) return; //
        appInitialized = true; //

        try {
            // --- INÍCIO DA CORREÇÃO DO LOOP DE LOGIN ---

            // 1. Busca PRIMEIRO o perfil do usuário (sem o join da empresa)
            const { data: userProfile, error: profileError } = await supabaseClient
                .from("usuarios")
                .select("*, cargo: cargo_id(nome_cargo, is_admin, tem_permissoes_admin, is_client_role)") //
                .eq("id", session.user.id) //
                .single(); //

            if (profileError) throw profileError; //

            // 2. Busca SEGUNDO os dados da empresa (incluindo a logo_url)
            const { data: empresaData, error: empresaError } = await supabaseClient
                .from("empresas")
                .select("nome_empresa, segmento_id, logo_url") //
                .eq("id", userProfile.empresa_id) // Usa o ID que acabamos de buscar
                .single();

            if (empresaError) throw empresaError;

            // 3. Junta os dados manualmente
            userProfile.empresa = empresaData;

            // --- FIM DA CORREÇÃO DO LOOP DE LOGIN ---

            // Verificação de usuário ativo (mantida)
            if (!userProfile.ativo) { //
                alert('Sua conta está inativa. Por favor, verifique seu e-mail de confirmação ou contate o administrador.');
                await logout(); //
                return;
            }

            // Lógica de permissões (mantida)
            const hasAdminPermissions = userProfile.cargo?.is_admin === true || userProfile.cargo?.tem_permissoes_admin === true;
            const isClientRole = userProfile.cargo?.is_client_role === true;

            const initialData = await api.fetchInitialData( //
                userProfile.empresa_id,
                userProfile.id,
                hasAdminPermissions,
                isClientRole
            );

            // Lógica de merge do Super Admin (mantida)
            const mergedProfile = {
                ...userProfile, //
                ...initialData.currentUserProfile, //
                is_super_admin: session.user.app_metadata?.is_super_admin === true //
            };
            state.currentUserProfile = mergedProfile; //
            initialData.currentUserProfile = mergedProfile; //

            // Verificação de 'NO_PROFILE' (mantida)
            if (initialData.error === 'NO_PROFILE') { //
                alert('Seu perfil não foi encontrado. Entre em contato com o suporte ou tente novamente.');
                return;
            }

            Object.assign(state, initialData); //
            ui.aplicarTerminologia(state.terminologia); //
            ui.setupRoleBasedUI(state.currentUserProfile); //

            // --- INÍCIO DA VERIFICAÇÃO DE PLANO (LÓGICA DO BOTÃO DE ÁUDIO) ---
            const recordBtn = document.getElementById('record-desc-btn');
            const descTextarea = document.getElementById('task-desc'); //

            // Garante que state.plano e state.plano.nome existam
            if (recordBtn && descTextarea && state.plano && state.plano.nome) { //

                const userPlan = state.plano.nome.toLowerCase();

                if (userPlan === 'plano profissional' || userPlan === 'plano master') {

                    // Mostra o botão
                    recordBtn.style.setProperty('display', 'block', 'important');

                    // Atualiza o placeholder
                    descTextarea.placeholder = 'Digite a descrição ou clique no 🎙️...';
                } else {
                    // Esconde o botão
                    recordBtn.style.setProperty('display', 'none', 'important');
                    // Garante o placeholder padrão (que agora bate com o HTML)
                    descTextarea.placeholder = 'Digite a descrição...';
                }
            } else if (recordBtn) {
                // Garante que o botão fique escondido
                recordBtn.style.setProperty('display', 'none', 'important');
            }
            // --- FIM DA VERIFICAÇÃO DE PLANO ---

            // --- INÍCIO DO "RESTO" QUE ESTAVA FALTANDO ---

            // Lógica de auto-seleção de condomínio (do app.v3.js original)
            if (state.condominios && state.condominios.length === 1) { //
                const singleCondo = state.condominios[0];
                const hiddenInput = document.getElementById('task-condominio');
                const searchInput = document.getElementById('task-condo-search');

                if (hiddenInput && searchInput) {
                    hiddenInput.value = singleCondo.id;
                    searchInput.value = singleCondo.nome_fantasia || singleCondo.nome;
                }
            } else {
                const hiddenInput = document.getElementById('task-condominio');
                const searchInput = document.getElementById('task-condo-search');
                if (hiddenInput) hiddenInput.value = '';
                if (searchInput) {
                    searchInput.value = '';
                }
            }

            // Define o filtro de status padrão na UI
            document.getElementById('filter-status').value = state.activeFilters.status; //

            // Define o nome do usuário na UI
            const userDisplayName = document.getElementById('user-display-name'); //
            if (userDisplayName) {
                userDisplayName.textContent = `Usuário: ${userProfile.nome_completo}`;
            }

            // Popula todos os dropdowns do sistema
            ui.populateDropdowns(state.condominios, state.taskTypes, state.allUsers, state.allGroups, state.currentUserProfile); //
            ui.populateTemplatesDropdown(state.taskTemplates); //

            // Inicializa os seletores com busca (dropdowns pesquisáveis)
            const filterCondoDropdown = ui.createSearchableDropdown(
                'filter-condo-search', 'filter-condo-options', 'filter-condominio-id', //
                state.condominios,
                (selectedValue) => {
                    state.displayLimit = 20; //
                    state.activeFilters.condominioId = selectedValue; //
                    executeTaskSearch(); // Chama a nova busca
                }
            );

            ui.createSearchableDropdown(
                'task-condo-search', 'task-condo-options', 'task-condominio', //
                state.condominios,
                (selectedValue) => {
                    document.getElementById('task-condominio').value = selectedValue;
                }
            );

            // --- CORREÇÃO: Inicializa o dropdown de Condomínio no Modal de EDIÇÃO ---
            ui.createSearchableDropdown(
                'edit-task-condo-search',   // ID do input visual de busca no modal de edição
                'edit-task-condo-options',  // ID da lista de opções (<ul> ou <div>) no HTML
                'edit-task-condominio',     // ID do input hidden que guarda o ID real
                state.condominios,          // Lista de dados
                (selectedValue) => {
                    // Callback: Atualiza o input hidden quando o usuário clica numa opção
                    document.getElementById('edit-task-condominio').value = selectedValue;
                }
            );

            // Conecta o botão "Limpar Filtros" ao dropdown pesquisável
            const clearFiltersBtn = document.getElementById('clear-filters'); //
            if (clearFiltersBtn && filterCondoDropdown) {
                clearFiltersBtn.addEventListener('click', () => { //
                    filterCondoDropdown.clear();
                });
            }

            // Mostra a UI principal
            ui.show('main-container'); //
            const lastView = sessionStorage.getItem('lastActiveView');
            ui.showView(lastView || 'create-task-view'); //
            if (lastView) sessionStorage.removeItem('lastActiveView');

            // Executa a busca inicial de tarefas (com filtros padrão)
            executeTaskSearch(); //

            // Inicia o "ouvinte" de notificações
            await verificarNotificacoes(); //
            const notificationChannel = supabaseClient
                .channel('public:notificacoes:user_id=eq.' + state.currentUserProfile.id) //
                /*.on(
                    'postgres_changes',
                    { event: 'INSERT', schema: 'public', table: 'notificacoes' }, //
                    async (payload) => {
                        console.log('Notificação em tempo real recebida!', payload); //*/
                        .on(
                        'postgres_changes',
                        { event: 'INSERT', schema: 'public', table: 'notificacoes' },
                        async (payload) => {
                            console.log('Notificação em tempo real recebida!', payload);
                            
                           const mensagemReal = payload.new.mensagem; 
                
                            // --- NOTIFICAÇÃO AGRESSIVA PARA ANDROID ---
                            if (mensagemReal && Notification.permission === 'granted') {
                                
                                // Função interna para disparar
                                const showAndroidNotification = async () => {
                                    try {
                                        // Tenta pegar o Service Worker ATIVO
                                        const registration = await navigator.serviceWorker.getRegistration();
                                        
                                        const options = {
                                            body: mensagemReal,
                                            icon: '/favicon/favicon-96x96.png', // Caminho absoluto
                                            badge: '/favicon/favicon-96x96.png',
                                            vibrate: [200, 100, 200, 100, 200], // Vibração longa
                                            tag: 'taskcom-alert', // Tag fixa para substituir a anterior se acumular
                                            renotify: true, // <<<--- OBRIGATÓRIO: Força o som/vibração mesmo se já tiver notificação
                                            requireInteraction: false, // Sai sozinho após alguns segundos (padrão mobile)
                                            data: { url: '/' }
                                        };

                                        if (registration && registration.active) {
                                            await registration.showNotification('TasKCom', options);
                                        } else {
                                            // Fallback se o SW não estiver pronto
                                            new Notification('TasKCom', options);
                                        }
                                    } catch (err) {
                                        console.error("Falha na notificação Android:", err);
                                        // Tenta o método básico se o avançado falhar
                                        new Notification('TasKCom', { body: mensagemReal });
                                    }
                                };

                                showAndroidNotification();
                            }
                            // ---------------------------------------------
                        try {
                            // Recarrega todos os dados (exceto tarefas)
                            const freshData = await api.fetchInitialData( //
                                state.currentUserProfile.empresa_id,
                                state.currentUserProfile.id,
                                state.currentUserProfile.cargo?.is_admin === true || state.currentUserProfile.cargo?.tem_permissoes_admin === true,
                                state.currentUserProfile.cargo?.is_client_role === true
                            );
                            Object.assign(state, freshData); //
                            await verificarNotificacoes(); //

                            // Atualiza a lista de tarefas se o usuário estiver olhando para ela
                            if (document.getElementById('view-tasks-view')?.style.display === 'flex') { //
                                executeTaskSearch(); //
                            }
                        } catch (error) {
                            console.error("Falha ao recarregar dados em tempo real:", error);
                        }
                    }
                )
                .subscribe(); //
            setInterval(verificarNotificacoes, 60000); //

            // --- FIM DO "RESTO" QUE ESTAVA FALTANDO ---

        } catch (error) {
            // Bloco Catch: Se qualquer coisa acima falhar, faz logout
            console.error("Erro crítico durante a inicialização:", error);
            await logout(); //
        }
    } else {
        // Se não houver sessão, mostra a tela de login
        appInitialized = false; //
        sessionStorage.clear();
        ui.show('login-screen'); //
    }
}

// Disparo da aplicação
window.addEventListener('DOMContentLoaded', startApp);