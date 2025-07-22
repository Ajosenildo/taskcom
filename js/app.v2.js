// js/app.js - O Maestro da Aplicação

import { supabaseClient } from './supabaseClient.js';
import { login, logout, checkSession } from './auth.js';
import * as ui from './ui.v2.js';
import * as api from './api.v2.js';
import * as render from './render.js';
import * as utils from './utils.js';

let deferredPrompt; // Guarda o evento de instalação

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installButton = document.getElementById('install-app-btn');
    if(installButton) installButton.style.display = 'block'; // Mostra o botão

    installButton.addEventListener('click', async () => {
        installButton.style.display = 'none';
        deferredPrompt.prompt(); // Mostra o prompt de instalação
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        deferredPrompt = null;
    });
});

// --- ESTADO GLOBAL DA APLICAÇÃO ---
let appInitialized = false; // <-- esta já existe
let listenersInitialized = false; // <-- ADICIONE ESTA LINHA
let isPasswordUpdateInProgress = false;

const state = {
    tasks: [], taskTemplates: [], condominios: [], taskTypes: [],
    allUsers: [], currentUserProfile: null, allCargos: [], allGroups: [], userGroupAssignments: [],
    activeFilters: {
        condominioId: '', status: 'active',
        dateStart: '', dateEnd: '', assigneeId: '',
        taskTypeId: '', groupId: ''
    },
    chartInstances: { status: null, condo: null },
    tasksToDisplayForPdf: [],
    STATUSES: {
        completed: { key: 'completed', text: 'Concluída', icon: '✔️', color: '#10b981' },
        in_progress: { key: 'in_progress', text: 'Em Andamento', icon: '🔵', color: '#3b82f6' },
        overdue: { key: 'overdue', text: 'Atrasada', icon: '🟠', color: '#f59e0b' },
        deleted: { key: 'deleted', text: 'Excluída', icon: '❌', color: '#ef4444' }
    },

    unreadNotifications: 0 
};

/**
 * Espera um elemento HTML aparecer na página antes de continuar.
 * @param {string} selector O seletor CSS do elemento (ex: '#meu-id').
 * @param {number} timeout O tempo máximo de espera em milissegundos.
 * @returns {Promise<Element>} Uma promessa que resolve com o elemento encontrado.
 */
function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(interval);
                resolve(element);
            }
        }, 100); // Verifica a cada 100ms

        // Define um tempo limite para evitar uma espera infinita
        setTimeout(() => {
            clearInterval(interval);
            reject(new Error(`Elemento '${selector}' não foi encontrado na página após ${timeout}ms.`));
        }, timeout);
    });
}

async function initializeApp() {
    try {
        // A busca e validação do perfil já foram feitas em 'startApp'.
        // Agora, focamos em buscar os dados da empresa.
        appInitialized = true;

        const empresaId = state.currentUserProfile.empresa_id;
        if (!empresaId) {
            throw new Error("Seu usuário não está vinculado a uma empresa. Contate o suporte.");
        }

        const initialData = await api.fetchInitialData(empresaId);
        Object.assign(state, initialData);
        
        console.log("Dados da empresa carregados com sucesso! Renderizando componentes...");
        
        // As chamadas abaixo agora usam o estado já populado e seguro.
        ui.populateDropdowns(state.condominios, state.taskTypes, state.allUsers, state.allGroups);
        ui.populateTemplatesDropdown(state.taskTemplates);
        
        const userDisplay = document.getElementById('user-display-name');
        if (userDisplay && state.currentUserProfile) {
            userDisplay.textContent = `Usuário: ${state.currentUserProfile.nome_completo}`;
        }

        const filterCondoDropdown = ui.createSearchableDropdown(
            'filter-condo-search', 'filter-condo-options', 'filter-condominio-id',
            state.condominios,
            (selectedValue) => {
                state.activeFilters.condominioId = selectedValue;
                state.tasksToDisplayForPdf = render.renderTasks(state);
            }
        );

        ui.createSearchableDropdown(
            'task-condo-search', 'task-condo-options', 'task-condominio',
            state.condominios,
            (selectedValue) => {
                document.getElementById('task-condominio').value = selectedValue;
            }
        );
        
        const clearFiltersBtn = document.getElementById('clear-filters');
        if(clearFiltersBtn && filterCondoDropdown) {
            clearFiltersBtn.addEventListener('click', () => {
                filterCondoDropdown.clear();
            });
        }
        
        // Renderiza a tela de tarefas que é a padrão.
        state.tasksToDisplayForPdf = render.renderTasks(state);

    } catch (error) {
        console.error("Erro fatal ao inicializar os dados da aplicação:", error);
        alert("Erro fatal ao inicializar: " + error.message + ". Você será deslogado.");
        await logout();
    }
}

// --- FUNÇÕES DE ORQUESTRAÇÃO ---

async function handleCreateTask(event) {
    event.preventDefault();
    
    // O bloco 'try' começa aqui para capturar qualquer erro, desde o início.
    try {
        console.log("--- DEBUG: A função handleCreateTask foi chamada! ---");
        const form = event.target;

        // Coleta os valores de todos os campos do formulário
        const title = form.elements['task-title'].value.trim();
        const assigneeId = form.elements['task-assignee'].value;
        const typeId = form.elements['task-type'].value;
        const condominioId = document.getElementById('task-condominio').value;
        const dueDate = form.elements['task-due-date'].value;

        // Validação para garantir que nenhum campo obrigatório esteja vazio
        if (!title || !typeId || !condominioId || !dueDate || !assigneeId) {
            return alert('Todos os campos obrigatórios (Título, Designar para, Tipo, Condomínio, Data) precisam ser preenchidos.');
        }

        // Monta o objeto de dados da tarefa para enviar ao banco
        const taskData = {
            titulo: title,
            descricao: form.elements['task-desc'].value,
            data_conclusao_prevista: dueDate,
            condominio_id: parseInt(condominioId),
            tipo_tarefa_id: parseInt(typeId),
            status: form.elements['create-as-completed'].checked ? 'completed' : 'pending',
            criador_id: state.currentUserProfile.id,
            responsavel_id: assigneeId,
            empresa_id: state.currentUserProfile.empresa_id
        };

        // Envia os dados para a API
        await api.createTaskInDB(taskData);

        // Opcional: Salva como modelo se a caixa estiver marcada
        if (form.elements['save-as-template'].checked) {
            await api.createTemplateInDB({
                titulo: title,
                tipo_tarefa_id: parseInt(typeId),
                empresa_id: state.currentUserProfile.empresa_id,
                criador_id: state.currentUserProfile.id
            });
        }

        form.reset();
        document.getElementById('task-condo-search').value = ''; // Limpa o campo de busca de condomínio
        alert('Tarefa criada com sucesso!');
        sessionStorage.setItem('lastActiveView', 'tasks-view');
        location.reload();

    } catch(error) {
        // Se qualquer erro ocorrer no bloco try, ele será capturado e exibido aqui.
        console.error("ERRO FATAL CAPTURADO EM handleCreateTask:", error);
        alert("Ocorreu um erro fatal ao processar a criação da tarefa. Detalhes: " + error.message);
    }
}


function handleViewChange(event) {
    const { viewId } = event.detail;
   // console.log(`Renderizando conteúdo para a view: ${viewId}`);

    try {
        if (viewId === 'tasks-view') {
            // Apenas renderiza a lista de tarefas se a view de tarefas for selecionada
            state.tasksToDisplayForPdf = render.renderTasks(state);
        } else if (viewId === 'dashboard-view') {
            // Apenas renderiza o dashboard se ele for selecionado
            render.renderDashboard(state);
        } else if (viewId === 'admin-view') {
            // Apenas renderiza as listas de admin se a tela de admin for selecionada
            render.renderUserList(state.allUsers, state.currentUserProfile, state.allCargos, state.allGroups, state.userGroupAssignments);
            render.renderCondoList(state.condominios, state.allGroups);
            render.renderTaskTypeList(state.taskTypes);
            render.renderCargoList(state.allCargos);
            render.renderGroupList(state.allGroups);
        }
    } catch (error) {
        console.error(`Erro fatal ao renderizar a view '${viewId}':`, error);
        alert(`Ocorreu um erro ao tentar exibir a tela '${viewId}'. A aplicação pode se tornar instável. Por favor, atualize a página (F5). Detalhes do erro: ${error.message}`);
    }
}

/* async function handleUpdateTask(event) {
    event.preventDefault();
    const form = event.target;
    const taskId = form.elements['edit-task-id'].value;
    try {
        await api.updateTaskInDB(taskId, {
            titulo: form.elements['edit-task-title'].value,
            descricao: form.elements['edit-task-desc'].value,
            data_conclusao_prevista: form.elements['edit-task-due-date'].value,
            tipo_tarefa_id: parseInt(form.elements['edit-task-type'].value),
            condominio_id: parseInt(form.elements['edit-task-condominio'].value),
            responsavel_id: form.elements['edit-task-assignee'].value
        });

        // --- INÍCIO DA CORREÇÃO ---
        
        // 1. Dê um feedback positivo para o usuário
        alert('Tarefa atualizada com sucesso!');
        
        // 2. Feche o modal
        ui.closeEditModal();
        
        // 3. Recarregue a página para mostrar os dados atualizados de forma confiável
        location.reload();

        // --- FIM DA CORREÇÃO ---

    } catch (error) {
        // Adicionamos um log de erro mais detalhado para nós
        console.error("Erro ao tentar atualizar a tarefa:", error);
        alert('Erro ao salvar alterações: ' + error.message);
    }
}
*/

// Arquivo: js/app.v2.js -> Substitua pela versão de diagnóstico

async function handleUpdateTask(event) {
    event.preventDefault();
    const form = event.target;
    const taskId = form.elements['edit-task-id'].value;
    const dadosParaAtualizar = {
        titulo: form.elements['edit-task-title'].value,
        descricao: form.elements['edit-task-desc'].value,
        data_conclusao_prevista: form.elements['edit-task-due-date'].value,
        tipo_tarefa_id: parseInt(form.elements['edit-task-type'].value),
        condominio_id: parseInt(form.elements['edit-task-condominio'].value),
        responsavel_id: form.elements['edit-task-assignee'].value
    };

    console.log("--- ENVIANDO ATUALIZAÇÃO ---", dadosParaAtualizar);

    try {
        // Agora a chamada à API nos retorna o objeto completo
        const { error } = await api.updateTaskInDB(taskId, dadosParaAtualizar);

        // VERIFICAÇÃO CRÍTICA: Esta é a lógica que faltava!
        // Se o Supabase retornou um objeto de erro, nós o tratamos aqui.
        if (error) {
            throw error; // Joga o erro para que o bloco CATCH o pegue e exiba.
        }

        // Este código só será executado se NÃO houver erro.
        alert('Tarefa atualizada com sucesso!');
        ui.closeEditModal();
        sessionStorage.setItem('lastActiveView', 'tasks-view');
        location.reload();

    } catch (error) {
        // Agora, este bloco mostrará a mensagem de erro REAL do banco de dados.
        console.error("ERRO REAL DETECTADO AO SALVAR:", error);
        alert(`Falha ao salvar alterações: ${error.message}`);
    }
}

async function handleToggleStatus(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    try {
        await api.toggleStatusInDB(taskId, task.status);
        sessionStorage.setItem('lastActiveView', 'tasks-view');
        location.reload();
    } catch (error) {
        alert('Erro ao atualizar status: ' + error.message);
    }
}

async function handleDeleteTask(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    if (window.confirm(`Tem certeza que deseja marcar a tarefa "${task.titulo}" como excluída?`)) {
        try {
            await api.deleteTaskInDB(taskId);
            sessionStorage.setItem('lastActiveView', 'tasks-view');
            location.reload();
        } catch (error) {
            alert('Erro ao excluir tarefa: ' + error.message);
        }
    }
}

async function handleCreateUser(event) {
    event.preventDefault();
    const form = event.target;
    const nome = form.elements['create-user-name'].value.trim();
    const email = form.elements['create-user-email'].value.trim();
    const password = form.elements['create-user-password'].value.trim();
    const cargoId = parseInt(form.elements['create-user-role'].value, 10);
    if (!nome || !email || !password || isNaN(cargoId)) return alert('Todos os campos são obrigatórios.');
    if (password.length < 6) return alert("A senha provisória deve ter no mínimo 6 caracteres.");
    try {
        await api.createUser({ email, password, nome_completo: nome, cargo_id: cargoId });
        alert('Usuário criado com sucesso!');
        ui.closeCreateUserModal();
        sessionStorage.setItem('lastActiveView', 'admin-view');
        location.reload();
    } catch(error) {
        console.error('Erro ao criar usuário:', error);
        alert('Erro ao criar usuário: ' + error.message);

        if (error.message.includes('A user with this email address has already been registered')) {
            alert('Já existe um usuário com este e-mail cadastrado.');
        } else {
            alert('Erro ao criar usuário: ' + error.message);
        }
    }
}

async function handleOpenEditModal(taskId) {
    const task = state.tasks.find(t => t.id == taskId);
    if (!task) return;

    // Mostra o modal imediatamente com os dados básicos
    // mas ainda não se preocupa com a lista de usuários do dropdown
    ui.openEditModal(task, [], state.currentUserProfile);

    try {
        // EM PARALELO, BUSCA DUAS COISAS:
        const [assignableUsers, historyEvents] = await Promise.all([
            api.fetchAllUsersForAssignment(), // <-- NOSSA NOVA FUNÇÃO EM AÇÃO!
            api.fetchTaskHistory(taskId)
        ]);
        
        // AGORA, ATUALIZA O MODAL com a lista completa de usuários
        const assigneeSelect = document.getElementById('edit-task-assignee');
        if (assigneeSelect) {
            assigneeSelect.innerHTML = ''; // Limpa o dropdown
            assignableUsers.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.nome_completo;
                assigneeSelect.appendChild(option);
            });
            // Mantém o responsável atual selecionado
            assigneeSelect.value = task.responsavel_id;
        }

        // E renderiza o histórico
        render.renderTaskHistory(historyEvents);

    } catch (error) {
        console.error("Erro ao carregar dados para o modal de edição:", error);
        alert("Não foi possível carregar todos os dados da tarefa.");
    }
}

function handleOpenCreateUserModal() {
    ui.openCreateUserModal(state.allCargos);
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

async function handleExportToPDF() {
    try {
        // A função agora é mais simples. Ela não busca mais o histórico.
        // Ela apenas reúne os parâmetros e chama a função em utils.js.

        if (state.tasksToDisplayForPdf.length === 0) {
            return alert("Não há tarefas na lista atual para exportar.");
        }

        const includeDesc = document.getElementById('pdf-include-desc').checked;
        const includeHistory = document.getElementById('pdf-include-history').checked;

        const empresaNome = state.currentUserProfile?.empresa?.nome_empresa || 'Relatório Geral';

        let reportOwnerName = null;
        if (state.currentUserProfile && !state.currentUserProfile.cargo?.is_admin) {
            reportOwnerName = state.currentUserProfile.nome_completo;
        }
        
        const emitterName = state.currentUserProfile?.nome_completo || 'Usuário Desconhecido';
        // A chamada agora tem um 'await' porque a função no utils.js se tornará assíncrona.
        await utils.exportTasksToPDF(
            state.tasksToDisplayForPdf,
            state.condominios,
            state.taskTypes,
            state.STATUSES,
            includeDesc,
            includeHistory,
            // Não passamos mais o 'historyData' daqui
            reportOwnerName,
            empresaNome,
            emitterName // <-- NOVO PARÂMETRO: Enviando o nome do emissor.
        );

    } catch (error) {
        console.error("ERRO CRÍTICO ao tentar gerar o PDF:", error);
        alert("Ocorreu um erro crítico ao gerar o PDF. Verifique o console (F12) para detalhes. Mensagem: " + error.message);
    }
}

async function handleUpdateUser(event) {
    event.preventDefault();
    const form = event.target;
    const userId = form.elements['edit-user-id'].value;
    const updatedUserData = {
        nome_completo: form.elements['edit-user-name'].value,
        cargo_id: parseInt(form.elements['edit-user-role'].value, 10),
    };
    // Pega todos os IDs dos checkboxes de grupo que foram marcados
    const selectedGroupIds = Array.from(form.querySelectorAll('input[name="grupos"]:checked')).map(cb => parseInt(cb.value, 10));

    try {
        await api.updateUserInDB(userId, updatedUserData);
        await api.updateUserGroupAssignments(userId, selectedGroupIds);
        alert("Usuário atualizado com sucesso!");
        ui.closeEditUserModal();
        sessionStorage.setItem('lastActiveView', 'admin-view');
        location.reload();
    } catch(error) {
        alert("Erro ao atualizar usuário: " + error.message);
    }
}

async function handleToggleUserStatus(userId) {
    const userToToggle = state.allUsers.find(u => u.id === userId);
    if (!userToToggle) return;

    const action = userToToggle.ativo ? "desativar" : "reativar";
    if (confirm(`Tem certeza que deseja ${action} o usuário ${userToToggle.nome_completo}?`)) {
        try {
            await api.toggleUserStatusInDB(userId, userToToggle.ativo);
            
            // CORREÇÃO: Adicione esta linha para recarregar a página
            sessionStorage.setItem('lastActiveView', 'admin-view');
            location.reload();

        } catch (error) {
            alert(`Erro ao ${action} o usuário: ` + error.message);
        }
    }
}

async function handleOpenEditUserModal(userId) {
    const userToEdit = state.allUsers.find(u => u.id === userId);
    if (!userToEdit) {
        console.error("Usuário não encontrado para edição.");
        return;
    }

    try {
        // A busca de cargos foi removida daqui. Usamos a lista do 'state'.
        const groupAssignments = await api.fetchUserGroupAssignments(userId);
        
        ui.openEditUserModal(
            userToEdit, 
            state.allCargos, // <-- Usando a lista segura do 'state'
            state.allGroups,
            groupAssignments
        );

    } catch (error) {
        alert("Não foi possível carregar os dados para edição: " + error.message);
        console.error(error);
    }
}

async function handleCreateOrUpdateCondo(event) {
    event.preventDefault();
    const form = event.target;
    const condoId = form.elements['condo-id'].value;
    const empresa_id = state.currentUserProfile?.empresa_id;

    if (!empresa_id) {
    alert('Erro: empresa_id não encontrado no perfil do usuário.');
    return;
    }

    const condoData = {
    nome: form.elements['condo-nome'].value,
    nome_fantasia: form.elements['condo-nome-fantasia'].value,
    cnpj: form.elements['condo-cnpj'].value || null,
    // empresa_id: empresa_id
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
        if (error.code === '23505') { // Código de erro para violação de 'UNIQUE constraint'
            alert('Erro: O CNPJ informado já está cadastrado.');
        } else {
            alert('Erro ao salvar condomínio: ' + error.message);
        }
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
    const condo = state.condominios.find(c => c.id === condoId);
    if (!condo) return;

    if (confirm(`Tem certeza que deseja excluir o condomínio "${condo.nome_fantasia}"?`)) {
        try {
            await api.deleteCondoInDB(condoId);
            sessionStorage.setItem('lastActiveView', 'admin-view');
            location.reload(); // Recarrega os dados para atualizar a lista
        } catch (error) {
            // console.error("Erro ao excluir condomínio:", error);

            // CORREÇÃO: Verifica o código de erro específico do PostgreSQL
            if (error.code === '23503') { // '23503' é o código para violação de chave estrangeira
                // Mostra a sua mensagem personalizada e amigável
                alert("Este condomínio não pode ser excluído por haver tarefas vinculadas.");
            } else {
                // Para qualquer outro erro, mostra a mensagem padrão
                alert('Erro ao excluir condomínio: ' + error.message);
            }
        }
    }
}

async function handleCreateOrUpdateTaskType(event) {
    event.preventDefault();
    const form = event.target;
    const typeId = form.elements['task-type-id'].value;
    const typeData = {
        nome_tipo: form.elements['task-type-nome'].value.trim(),
        cor: form.elements['task-type-cor'].value,
        empresa_id: state.currentUserProfile.empresa_id // <-- Adiciona o ID da empresa
    };

    if (!typeData.nome_tipo) {
        return alert("O nome do tipo de tarefa é obrigatório.");
    }

    try {
        if (typeId) {
            await api.updateTaskTypeInDB(typeId, typeData);
            alert('Tipo de tarefa atualizado com sucesso!');
        } else {
            await api.createTaskTypeInDB(typeData);
            alert('Tipo de tarefa criado com sucesso!');
        }
        form.reset();
        document.getElementById('task-type-id').value = '';
        document.getElementById('task-type-submit-btn').textContent = 'Adicionar Tipo';
        sessionStorage.setItem('lastActiveView', 'admin-view');
        location.reload();
    } catch (error) {
        console.error('Erro ao salvar tipo de tarefa:', error);
        alert('Erro ao salvar tipo de tarefa: ' + error.message);
    }
}

function handleCondoImport(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    Papa.parse(file, {
        header: true, // Essencial que a planilha tenha cabeçalhos: nome,nome_fantasia,cnpj,nome_grupo
        skipEmptyLines: true,
        complete: async (results) => {
            const condosFromSheet = results.data;
            if (condosFromSheet.length === 0) {
                return alert("Nenhum dado encontrado na planilha.");
            }

            // Cria um "mapa de consulta" para encontrar IDs de grupo rapidamente
            const groupNameToIdMap = new Map(state.allGroups.map(g => [g.nome_grupo.toLowerCase(), g.id]));

            // Prepara os dados para inserção, adicionando empresa_id e o grupo_id correto
            const condosToInsert = condosFromSheet.map(condo => {
                const groupName = condo.nome_grupo?.trim().toLowerCase();
                const groupId = groupName ? groupNameToIdMap.get(groupName) : null;
                
                if (groupName && !groupId) {
                    console.warn(`Aviso: O grupo "${condo.nome_grupo}" da planilha não foi encontrado no sistema e será ignorado para o condomínio "${condo.nome_fantasia}".`);
                }

                return {
                    nome: condo.nome,
                    nome_fantasia: condo.nome_fantasia,
                    cnpj: condo.cnpj || null,
                    empresa_id: state.currentUserProfile.empresa_id,
                    grupo_id: groupId // Atribui o ID do grupo encontrado ou null
                };
            });
            
            if (confirm(`Você tem certeza que deseja importar ${condosToInsert.length} novos condomínios?`)) {
                try {
                    await api.bulkInsertCondos(condosToInsert);
                    alert("Condomínios importados com sucesso!");
                    sessionStorage.setItem('lastActiveView', 'admin-view');
                    location.reload(); // Recarrega tudo para mostrar a nova lista
                } catch (error) {
                    alert("Ocorreu um erro ao importar os condomínios: " + error.message);
                }
            }
        },
        error: (error) => {
            console.error("Erro ao ler a planilha:", error);
            alert("Ocorreu um erro ao ler o arquivo da planilha.");
        }
    });
    
    // Limpa o valor do input para permitir selecionar o mesmo arquivo novamente
    event.target.value = '';
}

async function handleCreateOrUpdateGroup(event) {
    event.preventDefault();
    const form = event.target;
    const groupId = form.elements['group-id'].value;
    const groupData = { 
        nome_grupo: form.elements['group-name'].value,
        empresa_id: state.currentUserProfile.empresa_id 
    };

    try {
        if (groupId) {
            await api.updateGroupInDB(groupId, groupData);
            alert('Grupo atualizado com sucesso!');
        } else {
            await api.createGroupInDB(groupData);
            alert('Grupo criado com sucesso!');
        }
        form.reset();
        document.getElementById('group-id').value = '';
        document.getElementById('group-submit-btn').textContent = 'Adicionar Grupo';
        sessionStorage.setItem('lastActiveView', 'admin-view');
        location.reload();
    } catch (error) {
        alert('Erro ao salvar grupo: ' + error.message);
    }
}

function handleEditGroup(groupId, groupName) {
    document.getElementById('group-id').value = groupId;
    document.getElementById('group-name').value = groupName;
    document.getElementById('group-submit-btn').textContent = 'Salvar Alterações';
    document.getElementById('group-name').focus();
}

async function handleDeleteGroup(groupId, groupName) {
    if (confirm(`Tem certeza que deseja excluir o grupo "${groupName}"?`)) {
        try {
            await api.deleteGroupInDB(groupId);
            sessionStorage.setItem('lastActiveView', 'admin-view');
            location.reload();
        } catch (error) {
            alert('Erro ao excluir grupo: ' + error.message);
        }
    }
}

function handleDownloadTemplate() {
    // Define o cabeçalho do CSV
    const csvHeader = "nome,nome_fantasia,cnpj,nome_grupo";
    // Define o nome do arquivo
    const filename = "modelo-importacao-condominios.csv";

    // Cria um 'Blob', que é um objeto de arquivo na memória
    const blob = new Blob([csvHeader], { type: 'text/csv;charset=utf-8;' });

    // Cria um link temporário na memória
    const link = document.createElement("a");
    if (link.download !== undefined) { 
        const url = URL.createObjectURL(blob); // Cria uma URL para o nosso arquivo em memória
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click(); // Simula um clique no link, o que inicia o download
        document.body.removeChild(link); // Remove o link temporário
    }
}

async function handleForgotPassword(event) {
    event.preventDefault();
    const email = prompt("Por favor, digite o e-mail da sua conta para enviarmos o link de redefinição de senha:");

    if (!email) {
        return; // Usuário cancelou
    }

    try {
        await api.requestPasswordReset(email);
        alert("Se uma conta com este e-mail existir, um link para redefinir a senha foi enviado.");
    } catch (error) {
        console.error("Erro ao solicitar redefinição de senha:", error);
        alert("Ocorreu um erro ao tentar enviar o e-mail de redefinição: " + error.message);
    }
}

// --- SETUP INICIAL E LISTENERS ---
 
function setupEventListeners() {
    if (listenersInitialized) return;
    console.log("Configurando event listeners pela primeira vez...");
    // --- Autenticação e Navegação Principal ---
    document.getElementById('login-btn')?.addEventListener('click', login);
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    document.getElementById('toggle-password')?.addEventListener('click', () => {
        const passwordInput = document.getElementById('password');
        const toggleBtn = document.getElementById('toggle-password');
        const isHidden = passwordInput.type === 'password';
        passwordInput.type = isHidden ? 'text' : 'password';
        toggleBtn.textContent = isHidden ? '👁️' : '🙈';
    });

    // Navegação Principal
    document.getElementById('nav-tasks')?.addEventListener('click', () => ui.showView('tasks-view'));
    document.getElementById('nav-dashboard')?.addEventListener('click', () => ui.showView('dashboard-view'));
    document.getElementById('nav-admin')?.addEventListener('click', () => ui.showView('admin-view'));
    
    // Modais e Formulários
    document.getElementById('change-password-btn')?.addEventListener('click', ui.openChangePasswordModal);
    document.getElementById('task-form')?.addEventListener('submit', handleCreateTask);
    document.getElementById('edit-task-form')?.addEventListener('submit', handleUpdateTask);
    document.getElementById('create-user-form')?.addEventListener('submit', handleCreateUser);
    document.getElementById('edit-user-form')?.addEventListener('submit', handleUpdateUser);
    document.getElementById('task-type-form')?.addEventListener('submit', handleCreateOrUpdateTaskType);
    document.getElementById('group-form')?.addEventListener('submit', handleCreateOrUpdateGroup);
    document.getElementById('cargo-form')?.addEventListener('submit', handleCreateOrUpdateCargo);
    document.getElementById('change-password-form')?.addEventListener('submit', handleUpdatePassword);
    document.getElementById('set-password-form')?.addEventListener('submit', handleSetPassword);
    document.getElementById('add-user-btn')?.addEventListener('click', handleOpenCreateUserModal);
    document.getElementById('add-condo-btn')?.addEventListener('click', handleOpenCreateCondoModal);
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
    document.getElementById('edit-condo-form')?.addEventListener('submit', handleUpdateCondo);
    document.getElementById('create-condo-form')?.addEventListener('submit', handleCreateCondo);
    document.getElementById('change-password-close-btn')?.addEventListener('click', ui.closeChangePasswordModal);
    document.getElementById('change-password-cancel-btn')?.addEventListener('click', ui.closeChangePasswordModal);
    document.getElementById('open-instructions-link')?.addEventListener('click', (event) => {
        event.preventDefault();
        ui.openInstructionsModal();
    });
    document.getElementById('instructions-modal-close-btn')?.addEventListener('click', ui.closeInstructionsModal);
    document.getElementById('instructions-modal-ok-btn')?.addEventListener('click', ui.closeInstructionsModal);
    
    // Filtros e outros
    document.getElementById('clear-filters')?.addEventListener('click', () => {
        state.activeFilters = { condominioId: '', status: 'active', dateStart: '', dateEnd: '', assigneeId: '' };
        document.getElementById('filter-bar')?.reset();
        document.getElementById('filter-condo-search').value = '';
        state.tasksToDisplayForPdf = render.renderTasks(state);
    });
    document.getElementById('export-pdf-btn')?.addEventListener('click', handleExportToPDF);
    document.getElementById('template-select')?.addEventListener('change', handleTemplateSelect);
    document.getElementById('import-condo-btn')?.addEventListener('click', () => document.getElementById('condo-csv-input').click());
    document.getElementById('condo-csv-input')?.addEventListener('change', handleCondoImport);
    document.getElementById('download-template-btn')?.addEventListener('click', handleDownloadTemplate);
    document.getElementById('forgot-password-link')?.addEventListener('click', handleForgotPassword);

    const filters = ['filter-status', 'filter-assignee', 'filter-date-start', 'filter-date-end', 'filter-task-type', 'filter-group'];
    filters.forEach(id => {
        document.getElementById(id)?.addEventListener('change', (e) => {
            const filterMap = {
                'filter-status': 'status', 
                'filter-assignee': 'assigneeId', 
                'filter-date-start': 'dateStart', 
                'filter-date-end': 'dateEnd',
                'filter-task-type': 'taskTypeId',
                'filter-group': 'groupId'
            };
            state.activeFilters[filterMap[id]] = e.target.value;
            state.tasksToDisplayForPdf = render.renderTasks(state);
        });
    });

    // Event Delegation para listas dinâmicas
    document.getElementById('task-list')?.addEventListener('click', (event) => {
        const button = event.target.closest('.task-action-btn');
        if (!button) return;
        const taskId = parseInt(button.dataset.taskid, 10);
        const action = button.dataset.action;
        if (action === 'edit-task') handleOpenEditModal(taskId);
        if (action === 'toggle-task-status') handleToggleStatus(taskId);
        if (action === 'delete-task') handleDeleteTask(taskId);
    });
    document.getElementById('user-list')?.addEventListener('click', (event) => {
        const button = event.target.closest('.task-action-btn');
        if (!button) return;
        const userId = button.dataset.userid;
        const action = button.dataset.action;
        if (action === 'edit-user') handleOpenEditUserModal(userId);
        if (action === 'toggle-user-status') handleToggleUserStatus(userId);
    });
    document.getElementById('condo-list')?.addEventListener('click', (event) => {
        const button = event.target.closest('.task-action-btn');
        if (!button) return;
        const condoId = parseInt(button.dataset.condoid, 10);
        const action = button.dataset.action;
        if (action === 'edit-condo') handleOpenEditCondoModal(condoId);
        if (action === 'delete-condo') handleDeleteCondo(condoId);
    });
    document.getElementById('task-type-list')?.addEventListener('click', (event) => {
        const button = event.target.closest('.task-action-btn');
        if (!button) return;
        const typeId = parseInt(button.dataset.typeid, 10);
        const action = button.dataset.action;
        if (action === 'edit-task-type') handleEditTaskType(typeId);
        if (action === 'delete-task-type') handleDeleteTaskType(typeId);
    });
    document.getElementById('group-list')?.addEventListener('click', (event) => {
        const button = event.target.closest('.task-action-btn');
        if (!button) return;
        const groupId = parseInt(button.dataset.groupid, 10);
        const groupName = button.dataset.groupname;
        const action = button.dataset.action;
        if (action === 'edit-group') handleEditGroup(groupId, groupName);
        if (action === 'delete-group') handleDeleteGroup(groupId, groupName);
    });
    document.getElementById('cargo-list')?.addEventListener('click', (event) => {
        const button = event.target.closest('.task-action-btn');
        if (!button) return;
        const cargoId = parseInt(button.dataset.cargoid, 10);
        const cargoName = button.dataset.cargoname;
        const action = button.dataset.action;
        if (action === 'edit-cargo') handleEditCargo(cargoId, cargoName);
        if (action === 'delete-cargo') handleDeleteCargo(cargoId, cargoName);
    });

   document.getElementById('notification-bell-container')?.addEventListener('click', async () => {
        const modal = document.getElementById('notifications-modal');
        const list = document.getElementById('notifications-list');
        
        if (!modal || !list) return;

        // 1. ALTERAÇÃO: Removemos o filtro '.eq('lida', false)' para buscar
        // as últimas 10 notificações, lidas ou não.
        const { data: notifications, error } = await supabaseClient
        .from('notificacoes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

        if (error) return alert("Erro ao buscar notificações: " + error.message);

        // 2. ALTERAÇÃO: Adicionamos uma lógica para aplicar a classe 'unread'
        // se a notificação ainda não foi lida (n.lida === false).
        list.innerHTML = notifications.length > 0
        ? notifications.map(n => {
            const isUnreadClass = n.lida === false ? 'unread' : '';
            return `
              <div class="notification-item ${isUnreadClass}" data-task-id="${n.tarefa_id}" data-notification-id="${n.id}" style="cursor: pointer;">
                <p>${n.mensagem}</p>
                <small>${new Date(n.created_at).toLocaleString('pt-BR')}</small>
              </div>
            `;
          }).join('')
        : '<p>Nenhuma notificação recente.</p>';
    
        modal.style.display = 'flex';
        });

    // ADICIONE este novo listener para a lista de notificações
    document.getElementById('notifications-list')?.addEventListener('click', (event) => {
        const notificationItem = event.target.closest('.notification-item');
        if (!notificationItem) return;

        const taskId = parseInt(notificationItem.dataset.taskId, 10);
        const notificationId = parseInt(notificationItem.dataset.notificationId, 10);

        if (taskId && notificationId) {
            // 1. Marca a notificação específica como lida (sem esperar)
            api.markNotificationAsRead(notificationId);

            // 2. Fecha o modal de notificações
            document.getElementById('notifications-modal').style.display = 'none';

            // 3. Abre o modal da tarefa correspondente
            handleOpenEditModal(taskId);

            // 4. Roda a verificação de notificações novamente para atualizar o contador do sino
            verificarNotificacoes();
        }
    });

    // Adicione também o listener para fechar o novo modal
    document.getElementById('notifications-modal-close-btn')?.addEventListener('click', () => {
        document.getElementById('notifications-modal').style.display = 'none';
    });
    
    // Listeners de eventos globais da janela/documento
    window.addEventListener('viewChanged', handleViewChange);
    document.getElementById('ios-install-close-btn')?.addEventListener('click', () => {
        document.getElementById('ios-install-banner').style.display = 'none';
    });

    listenersInitialized = true;
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
    const type = state.taskTypes.find(t => t.id === typeId);
    if (!type) return;
    if (confirm(`Tem certeza que deseja excluir o tipo de tarefa "${type.nome_tipo}"?`)) {
        try {
            await api.deleteTaskTypeInDB(typeId);
            sessionStorage.setItem('lastActiveView', 'admin-view');
            location.reload();
        } catch (error) {
            console.error("Erro ao excluir tipo de tarefa:", error);
            // CORREÇÃO: Verifica o código de erro do PostgreSQL
            if (error.code === '23503') { // '23503' é o código para violação de chave estrangeira
                alert('Impossível excluir! Este tipo de tarefa ainda está vinculado a uma ou mais tarefas (incluindo as já excluídas).');
            } else {
                alert('Erro ao excluir tipo de tarefa: ' + error.message);
            }
        }
    }
}

async function handleCreateOrUpdateCargo(event) {
    event.preventDefault();
    const form = event.target;
    const cargoId = form.elements['cargo-id'].value;
    const cargoData = {
        nome_cargo: form.elements['cargo-nome'].value,
        empresa_id: state.currentUserProfile.empresa_id // <-- Adiciona o ID da empresa
    };

    if (!cargoData.nome_cargo) {
        return alert("O nome do cargo é obrigatório.");
    }

    try {
        if (cargoId) {
            // Atualiza o cargo existente
            await api.updateCargoInDB(cargoId, cargoData);
            alert('Cargo atualizado com sucesso!');
        } else {
            // Cria um novo cargo
            await api.createCargoInDB(cargoData);
            alert('Cargo criado com sucesso!');
        }
        form.reset();
        document.getElementById('cargo-id').value = '';
        document.getElementById('cargo-submit-btn').textContent = 'Adicionar Cargo';
        sessionStorage.setItem('lastActiveView', 'admin-view');
        location.reload(); // Recarrega os dados para mostrar a atualização
    } catch (error) {
        // --- INÍCIO DA CORREÇÃO ---
        
        // Log para nossa depuração
        console.error("Erro ao salvar cargo:", error);

        // Verificamos se a mensagem de erro contém o nome da nossa restrição de chave única.
        if (error && error.message.includes('cargos_empresa_id_nome_cargo_key')) {
            // Se sim, mostramos a mensagem personalizada.
            alert('Erro: Cargo já existente!');
        } else {
            // Se não, mostramos a mensagem de erro genérica.
            alert('Erro ao salvar cargo: ' + error.message);
        }
        
        // --- FIM DA CORREÇÃO ---
    }
}

function handleEditCargo(cargoId) {
    // Busca o objeto 'cargo' completo na nossa lista 'state.allCargos'
    const cargo = state.allCargos.find(c => c.id === cargoId);
    if (!cargo) {
        console.error("Cargo não encontrado para edição:", cargoId);
        return;
    }

    // Preenche os campos do formulário com os dados do cargo
    document.getElementById('cargo-id').value = cargo.id;
    document.getElementById('cargo-nome').value = cargo.nome_cargo;
    
    // CORREÇÃO: Altera o texto do botão para "Salvar Alterações"
    document.getElementById('cargo-submit-btn').textContent = 'Salvar Alterações';
    
    // Move o foco do cursor para o campo de nome para facilitar a edição
    document.getElementById('cargo-nome').focus();
}

async function handleDeleteCargo(cargoId, cargoName) {
    if (confirm(`Tem certeza que deseja excluir o cargo "${cargoName}"?`)) {
        try {
            await api.deleteCargoInDB(cargoId);
            sessionStorage.setItem('lastActiveView', 'admin-view');
            location.reload();
        } catch (error) {
            if(error.code === '23503'){
                alert('Impossível excluir! Este cargo está vinculado a um ou mais usuários.');
            } else {
                alert('Erro ao excluir cargo: ' + error.message);
            }
        }
    }
}

document.getElementById('set-password-form')?.addEventListener('submit', handleSetPassword);

// Event Delegation para listas dinâmicas
document.getElementById('task-list')?.addEventListener('click', (event) => {
    const button = event.target.closest('.task-action-btn');
    if (!button) return;

    const taskId = parseInt(button.dataset.taskid, 10);
    const action = button.dataset.action;

    if (action === 'edit-task') handleOpenEditModal(taskId);
    if (action === 'toggle-task-status') handleToggleStatus(taskId);
    if (action === 'delete-task') handleDeleteTask(taskId);
});

document.getElementById('user-list')?.addEventListener('click', (event) => {
    const button = event.target.closest('.task-action-btn');
    if (!button) return;
    const userId = button.dataset.userid;
    const action = button.dataset.action;
    if (action === 'edit-user') handleOpenEditUserModal(userId);
    if (action === 'toggle-user-status') handleToggleUserStatus(userId);
});

async function handleUpdateCondo(event) {
    event.preventDefault();
    const form = event.target;
    const condoId = parseInt(form.elements['edit-condo-id'].value, 10);

    // Objeto com os dados do formulário
    const condoData = {
        nome: form.elements['edit-condo-nome'].value,
        nome_fantasia: form.elements['edit-condo-nome-fantasia'].value,
        cnpj: form.elements['edit-condo-cnpj'].value || null,
        // CORREÇÃO: Adiciona a leitura do grupo selecionado no modal
        grupo_id: form.elements['edit-condo-group'].value ? parseInt(form.elements['edit-condo-group'].value, 10) : null
    };
    
    try {
        // Envia os dados atualizados para a API
        await api.updateCondoInDB(condoId, condoData);
        alert('Condomínio atualizado com sucesso!');
        ui.closeEditCondoModal();

        // ATUALIZAÇÃO INSTANTÂNEA NA TELA (Sua lógica, que está correta):
        // Encontra o índice do condomínio no nosso 'state'
        const index = state.condominios.findIndex(c => c.id === condoId);
        if (index !== -1) {
            // Atualiza o objeto no state com os novos dados
            state.condominios[index] = { ...state.condominios[index], ...condoData };
            // Manda redesenhar a lista de condomínios com a informação atualizada
            render.renderCondoList(state.condominios, state.allGroups);
        } else {
            // Se não encontrou, recarrega tudo por segurança
            sessionStorage.setItem('lastActiveView', 'admin-view');
            location.reload();
        }

    } catch(error) {
        alert('Erro ao atualizar condomínio: ' + error.message);
    }
}

function handleOpenEditCondoModal(condoId) {
    const condo = state.condominios.find(c => c.id === condoId);
    if (condo) {
        ui.openEditCondoModal(condo, state.allGroups);
    }
}

async function handleSetPassword(event) {
    event.preventDefault();
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (newPassword.length < 6) {
        return alert('A senha deve ter no mínimo 6 caracteres.');
    }
    if (newPassword !== confirmPassword) {
        return alert('As senhas não coincidem.');
    }

    const { data, error } = await supabaseClient.auth.updateUser({
        password: newPassword
    });

    if (error) {
        return alert("Erro ao atualizar senha: " + error.message);
    }

    try {
        await api.activateUser(data.user.id);
        alert("Senha definida e usuário ativado com sucesso! Você será redirecionado para fazer o login.");
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

    if (newPassword.length < 6) {
        return alert('A nova senha deve ter no mínimo 6 caracteres.');
    }
    if (newPassword !== confirmPassword) {
        return alert('As senhas não coincidem.');
    }

    isPasswordUpdateInProgress = true;
    ui.closeChangePasswordModal();

    try {
        const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
        if (error) {
            throw error;
        }
    } catch (err) {
        isPasswordUpdateInProgress = false; 
        console.error("Erro ao atualizar a senha:", err);

        if (err.message.includes('New password should be different from the old password')) {
            alert("Esta senha já foi usada anteriormente. Por favor, tente outra senha.");
        } else {
            alert("Não foi possível alterar a senha. Erro: " + err.message);
        }
    }
}

function handleOpenCreateCondoModal() {
  // A correção é usar a lista de grupos que já está no estado da aplicação ('state.allGroups'),
  // que já foi filtrada corretamente pela empresa do usuário logado.
  ui.openCreateCondoModal(state.allGroups);
}

async function handleCreateCondo(event) {
    event.preventDefault();
    const form = event.target;

    const nome = form.elements['create-condo-nome'].value.trim();
    const fantasia = form.elements['create-condo-nome-fantasia'].value.trim();
    const cnpj = form.elements['create-condo-cnpj'].value.trim();
    const grupoId = form.elements['create-condo-group'].value;

    if (!nome || !fantasia) return alert("Preencha todos os campos obrigatórios.");

    // Busca o perfil do usuário logado para obter o ID da empresa
    const userProfile = JSON.parse(sessionStorage.getItem('userProfile'));
    if (!userProfile || !userProfile.empresa_id) {
        return alert("Erro: Não foi possível identificar a empresa do usuário. Tente fazer o login novamente.");
    }

    const condoData = {
        nome: nome,
        nome_fantasia: fantasia,
        cnpj: cnpj || null,
        grupo_id: grupoId ? parseInt(grupoId, 10) : null,
        empresa_id: userProfile.empresa_id // <-- A INFORMAÇÃO QUE FALTAVA
    };

    try {
        await api.createCondoInDB(condoData);
        alert("Condomínio criado com sucesso!");
        ui.closeCreateCondoModal();
        sessionStorage.setItem('lastActiveView', 'admin-view');
        location.reload(); // Recarrega os dados para mostrar o novo condomínio na lista
    } catch (error) {
        console.error("Erro ao criar condomínio:", error);
        alert("Erro ao criar condomínio: " + error.message);
    }
}
// -------

// Listener para evento personalizado
window.addEventListener('showAdminView', () => render.renderUserList(state.allUsers, state.currentUserProfile));

// Arquivo: js/app.v2.js -> Adicione esta nova função

async function verificarNotificacoes() {
    // Chama nossa nova função 'contadora' no banco
    const { data: count, error } = await supabaseClient.rpc('contar_notificacoes_nao_lidas');

    if (error) {
        console.error("Erro ao verificar notificações:", error);
        return;
    }

   //  console.log(`Verificação: ${count} notificações não lidas.`);
    
    // Atualiza o estado e o emblema visual do sino
    state.unreadNotifications = count;
    const badge = document.getElementById('notification-badge');

    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
}

function unlockAudio() {
  const sound = document.getElementById('notification-sound');
  if (sound && sound.paused) {
    sound.play().catch(() => {}); // Tenta tocar para "acordar" o áudio
    sound.pause(); // Pausa imediatamente, o usuário não vai ouvir
  }
  console.log("Contexto de áudio ativado pela interação do usuário.");
  // O listener que chama esta função será removido automaticamente.
}

async function startApp() {
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('touchend', unlockAudio, { once: true });
    setupEventListeners();
    ui.setupPWAInstallHandlers();
    
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (session) {
        // =======================================================================
        // LÓGICA DE INICIALIZAÇÃO ÚNICA E SEGURA
        // =======================================================================
        if (appInitialized) return;
        appInitialized = true;

        try {
            console.log("Sessão válida. Iniciando aplicação...");

            const { data: userProfile, error: profileError } = await supabaseClient
                .from("usuarios")
                .select("*, cargo: cargo_id(nome_cargo, is_admin), empresa:empresa_id(nome_empresa)")
                .eq("id", session.user.id)
                .single();

            if (profileError) throw profileError;
            if (!userProfile) throw new Error("Perfil de usuário não encontrado.");
            if (!userProfile.ativo) {
                alert("Seu usuário está inativo. Contate o administrador.");
                return await logout();
            }
            if (!userProfile.empresa_id) throw new Error("Usuário não vinculado a uma empresa.");

            const initialData = await api.fetchInitialData(userProfile.empresa_id);

            // =======================================================================
            // PONTO DE VERIFICAÇÃO 1: O QUE VEIO DA API?
           // console.log("--- VERIFICANDO DADOS RECEBIDOS DA API ---");
           // console.log("Tipos de Tarefa recebidos:", initialData.taskTypes);
            // =======================================================================

            state.currentUserProfile = userProfile;
            Object.assign(state, initialData);
            sessionStorage.setItem("userProfile", JSON.stringify(userProfile));

            // =======================================================================
            // PONTO DE VERIFICAÇÃO 2: O QUE ESTÁ NO ESTADO ANTES DE RENDERIZAR?
           // console.log("--- VERIFICANDO ESTADO ANTES DE RENDERIZAR ---");
           // console.log("state.taskTypes:", state.taskTypes);
            // =======================================================================

            console.log("Dados carregados. Renderizando a aplicação...");

           ui.setupRoleBasedUI(state.currentUserProfile);
            document.getElementById('user-display-name').textContent = `Usuário: ${userProfile.nome_completo}`;

            // =======================================================================
            // INÍCIO DA CORREÇÃO - CONFIGURAÇÃO DOS DROPDOWNS
            // =======================================================================
           //  console.log("Configurando todos os dropdowns da aplicação...");

            // 1. Popula os dropdowns simples (Tipos de Tarefa, Responsáveis, etc.)
            ui.populateDropdowns(state.condominios, state.taskTypes, state.allUsers, state.allGroups);
            ui.populateTemplatesDropdown(state.taskTemplates);

            // 2. Configura os seletores de condomínio com busca (lógica que estava faltando)
            const filterCondoDropdown = ui.createSearchableDropdown(
                'filter-condo-search', 'filter-condo-options', 'filter-condominio-id',
                state.condominios,
                (selectedValue) => {
                    state.activeFilters.condominioId = selectedValue;
                    state.tasksToDisplayForPdf = render.renderTasks(state);
                }
            );

            // Esta é a chamada que faltava para o formulário de CRIAR TAREFA
            ui.createSearchableDropdown(
                'task-condo-search', 'task-condo-options', 'task-condominio',
                state.condominios,
                (selectedValue) => {
                    // Apenas garante que o valor do input oculto seja atualizado
                    document.getElementById('task-condominio').value = selectedValue;
                }
            );
            
            // Adiciona o listener para o botão de limpar filtros
            const clearFiltersBtn = document.getElementById('clear-filters');
            if(clearFiltersBtn && filterCondoDropdown) {
                clearFiltersBtn.addEventListener('click', () => {
                    filterCondoDropdown.clear(); // Limpa o dropdown de filtro
                    // Reseta os outros filtros também, se necessário
                    document.getElementById('filter-bar')?.reset();
                    Object.assign(state.activeFilters, {
                        condominioId: '', status: 'active', dateStart: '', dateEnd: '',
                        assigneeId: '', taskTypeId: '', groupId: ''
                    });
                    state.tasksToDisplayForPdf = render.renderTasks(state);

                });
            }
            
            state.tasksToDisplayForPdf = render.renderTasks(state);

            ui.show('main-container');

            const lastView = sessionStorage.getItem('lastActiveView');
            if (lastView) {
                // Se encontrarmos uma anotação, abra a tela que estava salva.
                ui.showView(lastView);
                // Limpa a anotação para não ficar preso nessa tela para sempre.
                sessionStorage.removeItem('lastActiveView');
            } else {
                // Se não houver anotação, abra na tela padrão de tarefas.
                ui.showView('tasks-view');
            }
            // 2. Verificamos as notificações assim que a página carrega.
            verificarNotificacoes();

            // 3. Configuramos um 'timer' para verificar a cada 30 segundos.
            setInterval(verificarNotificacoes, 30000); // 30000 milissegundos = 30 segundos

        } catch (error) {
            console.error("Erro crítico durante a inicialização:", error);
            alert(`Ocorreu um erro crítico ao carregar a aplicação: ${error.message}`);
            await logout();
        }
        
        const notificationChannel = supabaseClient
      .channel('public:notificacoes:user_id=eq.' + state.currentUserProfile.id)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificacoes' },
        (payload) => {
          console.log('Nova notificação recebida!', payload);
          
          // ======================================================
          // INÍCIO DO BLOCO QUE TOCA O SOM E VIBRA
          // Verifique se o seu código tem esta parte.
          // ======================================================
          
          // 1. Encontra o elemento de áudio
          const sound = document.getElementById('notification-sound');
          if (sound) {
              // Garante que o som toque do início
              sound.currentTime = 0;
              // Toca o som
              sound.play().catch(e => console.error("Erro ao tocar som:", e));
          }

          // 2. Vibra o dispositivo (se suportado)
          if (navigator.vibrate) {
            navigator.vibrate(200); // Vibra por 200ms
          }
          
          // ======================================================
          // FIM DO BLOCO QUE TOCA O SOM E VIBRA
          // ======================================================

          // 3. Atualiza o contador e o emblema visual do sino
          // Esta parte deve continuar como está
          state.unreadNotifications++;
          const badge = document.getElementById('notification-badge');
          if (badge) {
            badge.textContent = state.unreadNotifications;
            badge.style.display = 'block';
          }
        }
      )
      .subscribe((status) => {
        // ... (resto do seu código)
      });

        } else {
        appInitialized = false;
        sessionStorage.clear();
        ui.show('login-screen');
        }

        // Listener para eventos futuros de login/logout após a carga inicial
        supabaseClient.auth.onAuthStateChange((event, newSession) => {
        if (event === 'SIGNED_OUT' && appInitialized) {
            console.log("Sessão encerrada pelo servidor ou outra aba. Recarregando a página.");
            
            // CORREÇÃO:
            // NÃO chame logout() aqui. Apenas recarregue a página.
            // A página recarregada não terá sessão e o próprio startApp mostrará a tela de login.
            location.reload();
        }
        });

        /* const notificationChannel = supabaseClient
      .channel('public:notificacoes:user_id=eq.' + userProfile.id)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificacoes' },
        (payload) => {
          console.log('Nova notificação recebida!', payload);
          
          // ======================================================
          // INÍCIO DO BLOCO QUE TOCA O SOM E VIBRA
          // Verifique se o seu código tem esta parte.
          // ======================================================
          
          // 1. Encontra o elemento de áudio
          const sound = document.getElementById('notification-sound');
          if (sound) {
              // Garante que o som toque do início
              sound.currentTime = 0;
              // Toca o som
              sound.play().catch(e => console.error("Erro ao tocar som:", e));
          }

          // 2. Vibra o dispositivo (se suportado)
          if (navigator.vibrate) {
            navigator.vibrate(200); // Vibra por 200ms
          }
          
          // ======================================================
          // FIM DO BLOCO QUE TOCA O SOM E VIBRA
          // ======================================================

          // 3. Atualiza o contador e o emblema visual do sino
          // Esta parte deve continuar como está
          state.unreadNotifications++;
          const badge = document.getElementById('notification-badge');
          if (badge) {
            badge.textContent = state.unreadNotifications;
            badge.style.display = 'block';
          }
        }
      )
      .subscribe((status) => {
        // ... (resto do seu código)
      });*/
    
}

// Evento que dispara a aplicação
window.addEventListener('DOMContentLoaded', startApp);