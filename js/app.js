// js/app.js - O Maestro da Aplicação

import { supabaseClient } from './supabaseClient.js';
import { login, logout, checkSession } from './auth.js';
import * as ui from './ui.js';
import * as api from './api.js';
import * as render from './render.js';
import * as utils from './utils.js';

let deferredPrompt; // Guarda o evento de instalação

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installButton = document.getElementById('install-app-btn');
  if(installButton) {
    installButton.style.display = 'inline-block'; // Mostra o botão
  }
});

// --- ESTADO GLOBAL DA APLICAÇÃO ---
let appInitialized = false; // <-- esta já existe
let listenersInitialized = false; // <-- ADICIONE ESTA LINHA

const state = {
    tasks: [], taskTemplates: [], condominios: [], taskTypes: [],
    allUsers: [], currentUserProfile: null, allCargos: [], allGroups: [],
    activeFilters: {
        condominioId: '', status: 'active',
        dateStart: '', dateEnd: '', assigneeId: '',
        taskTypeId: ''
    },
    chartInstances: { status: null, condo: null },
    tasksToDisplayForPdf: [],
    STATUSES: {
        completed: { key: 'completed', text: 'Concluída', icon: '✔️', color: '#10b981' },
        in_progress: { key: 'in_progress', text: 'Em Andamento', icon: '🔵', color: '#3b82f6' },
        overdue: { key: 'overdue', text: 'Atrasada', icon: '🟠', color: '#f59e0b' },
        deleted: { key: 'deleted', text: 'Excluída', icon: '❌', color: '#ef4444' }
    }
};

// --- FUNÇÃO PRINCIPAL DE CARREGAMENTO ---
async function initializeApp() {
    try {
        // Faz uma única chamada que busca TUDO que precisamos
        const initialData = await api.fetchInitialData();
        
        // Atualiza o nosso 'state' com os dados frescos
        state.tasks = initialData.tasks;
        state.condominios = initialData.condominios;
        state.taskTypes = initialData.taskTypes;
        state.taskTemplates = initialData.taskTemplates;
        state.allUsers = initialData.allUsers;
        state.allCargos = initialData.allCargos;
        state.allGroups = initialData.allGroups;
        Object.assign(state, initialData);
        state.currentUserProfile = JSON.parse(sessionStorage.getItem('userProfile')); 
        
        console.log("Dados carregados com sucesso! Renderizando...");
        
        // Configura e desenha a interface com os dados atualizados
        ui.setupRoleBasedUI(state.currentUserProfile);
        ui.populateDropdowns(state.condominios, state.taskTypes, state.allUsers);
        ui.populateTemplatesDropdown(state.taskTemplates);
        ui.setupInstallButton();
        renderAll();

        // Inicializa os seletores com busca
        const taskCondoDropdown = ui.createSearchableDropdown(
            'task-condo-search', 'task-condo-options', 'task-condominio',
            state.condominios,
            (selectedValue) => {
                // No formulário de tarefa, apenas guardamos o valor
                document.getElementById('task-condominio').value = selectedValue;
            }
        );

        const filterCondoDropdown = ui.createSearchableDropdown(
            'filter-condo-search', 'filter-condo-options', 'filter-condominio-id',
            state.condominios,
            (selectedValue) => {
                state.activeFilters.condominioId = selectedValue;
                renderAll();
            }
        );

        // Conecta o botão "Limpar Filtros" para limpar também o novo seletor
        const clearFiltersBtn = document.getElementById('clear-filters');
        if(clearFiltersBtn && filterCondoDropdown) {
            clearFiltersBtn.addEventListener('click', () => {
                filterCondoDropdown.clear();
            });
        }

        const userDisplay = document.getElementById('user-display-name');
        if (userDisplay && state.currentUserProfile) {
            userDisplay.textContent = `Usuário: ${state.currentUserProfile.nome_completo}`;
        }

    } catch (error) {
        console.error("Erro fatal ao inicializar o aplicativo:", error);
        alert("Erro fatal ao inicializar o aplicativo: " + error.message);
    }
}

// --- FUNÇÕES DE ORQUESTRAÇÃO ---
function renderAll() {
    state.tasksToDisplayForPdf = render.renderTasks(state);
    render.renderDashboard(state);
    
    // Garanta que está passando state.allCargos aqui
    render.renderUserList(state.allUsers, state.currentUserProfile, state.allCargos);
    
    render.renderCondoList(state.condominios, state.allGroups);
    render.renderTaskTypeList(state.taskTypes);
    render.renderCargoList(state.allCargos);
    render.renderGroupList(state.allGroups);
}

// --- FUNÇÕES DE MANIPULAÇÃO DE DADOS (Handlers) ---
async function handleCreateTask(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const title = formData.get('task-title'), typeId = formData.get('task-type'), condominioId = formData.get('task-condominio'), dueDate = formData.get('task-due-date');
    if (!title || !typeId || !condominioId || !dueDate) {
        return alert('Todos os campos, exceto descrição, são obrigatórios.');
    }
    try {
        await api.createTaskInDB({
            titulo: title, descricao: formData.get('task-desc'), data_conclusao_prevista: dueDate,
            condominio_id: parseInt(condominioId), tipo_tarefa_id: parseInt(typeId),
            status: formData.get('create-as-completed') ? 'completed' : 'pending',
            criador_id: state.currentUserProfile.id, responsavel_id: state.currentUserProfile.id,
            empresa_id: state.currentUserProfile.empresa_id
        });
        if (formData.get('save-as-template')) {
            await api.createTemplateInDB({
                titulo: title, tipo_tarefa_id: parseInt(typeId),
                empresa_id: state.currentUserProfile.empresa_id, criador_id: state.currentUserProfile.id
            });
        }
        form.reset();
        initializeApp();
    } catch (error) {
        alert('Erro ao criar tarefa: ' + error.message);
    }
}

async function handleUpdateTask(event) {
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
        ui.closeEditModal();
        initializeApp();
    } catch (error) {
        alert('Erro ao salvar alterações: ' + error.message);
    }
}

async function handleToggleStatus(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    try {
        await api.toggleStatusInDB(taskId, task.status);
        initializeApp();
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
            initializeApp();
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

    if (!nome || !email || !password || isNaN(cargoId)) {
        return alert('Todos os campos são obrigatórios.');
    }
    if (password.length < 6) {
        return alert("A senha provisória deve ter no mínimo 6 caracteres.");
    }

    try {
        await api.createUser({ email, password, nome_completo: nome, cargo_id: cargoId });
        alert('Usuário criado com sucesso!');
        ui.closeCreateUserModal();
        initializeApp();
    } catch(error) {
        console.error('Erro ao criar usuário:', error);
        alert('Erro ao criar usuário: ' + error.message);
    }
}

async function handleOpenEditModal(taskId) {
    const task = state.tasks.find(t => t.id == taskId);
    if (!task) return;

    // Mostra o modal imediatamente com os dados básicos
    ui.openEditModal(task, state.allUsers, state.currentUserProfile);

    // Em paralelo, busca e renderiza o histórico
    try {
        const historyEvents = await api.fetchTaskHistory(taskId);
        render.renderTaskHistory(historyEvents);
    } catch (error) {
        console.error("Erro ao buscar histórico da tarefa:", error);
        document.getElementById('task-history-list').innerHTML = '<p>Erro ao carregar histórico.</p>';
    }
}

async function handleOpenCreateUserModal() {
    try {
        const cargos = await api.fetchRoles();
        ui.openCreateUserModal(cargos);
    } catch (error) {
        console.error("Erro ao buscar cargos:", error);
    }
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
    if (state.tasksToDisplayForPdf.length === 0) {
        return alert("Não há tarefas na lista atual para exportar.");
    }
    
    const includeDesc = document.getElementById('pdf-include-desc').checked;
    const includeHistory = document.getElementById('pdf-include-history').checked;
    
    // Pega o nome da empresa do perfil do usuário logado
    const empresaNome = state.currentUserProfile?.empresa?.nome_empresa || 'Nome da Empresa';

    let reportOwnerName = null;
    // Se o usuário logado NÃO é um admin (cargo_id diferente de 1), o relatório é dele.
    if (state.currentUserProfile && state.currentUserProfile.cargo_id !== 1) {
        reportOwnerName = state.currentUserProfile.nome_completo;
    }

    let historyData = [];
    if (includeHistory) {
        try {
            const taskIds = state.tasksToDisplayForPdf.map(t => t.id);
            historyData = await api.fetchHistoryForTasks(taskIds);
        } catch (error) {
            console.error("Erro ao buscar histórico para o PDF:", error);
            return alert("Não foi possível buscar o histórico das tarefas.");
        }
    }

    // Chama a função de gerar PDF passando todas as novas opções
    utils.exportTasksToPDF(
        state.tasksToDisplayForPdf, 
        state.condominios, 
        state.taskTypes, 
        state.STATUSES,
        includeDesc, 
        includeHistory,
        historyData,
        reportOwnerName,
        empresaNome
    );
}

async function handleUpdateUser(event) {
    event.preventDefault();
    const form = event.target;
    const userId = form.elements['edit-user-id'].value;
    const updatedUserData = {
        nome_completo: form.elements['edit-user-name'].value,
        cargo_id: parseInt(form.elements['edit-user-role'].value, 10),
    };
    try {
        await api.updateUserInDB(userId, updatedUserData);
        alert("Usuário atualizado com sucesso!");
        ui.closeEditUserModal();
        initializeApp();
    } catch (error) {
        alert("Erro ao atualizar usuário: " + error.message);
        console.error(error);
    }
}

async function handleToggleUserStatus(userId) {
    const userToToggle = state.allUsers.find(u => u.id === userId);
    if (!userToToggle) return;

    const action = userToToggle.ativo ? "desativar" : "reativar";
    if (confirm(`Tem certeza que deseja ${action} o usuário ${userToToggle.nome_completo}?`)) {
        try {
            await api.toggleUserStatusInDB(userId, userToToggle.ativo);
            initializeApp(); // Recarrega os dados para atualizar a lista
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
        const cargos = await api.fetchRoles();
        ui.openEditUserModal(userToEdit, cargos);
    } catch (error) {
        console.error("Erro ao buscar cargos para edição:", error);
        alert("Não foi possível carregar os cargos para a edição.");
    }
}

async function handleCreateOrUpdateCondo(event) {
    event.preventDefault();
    const form = event.target;
    const condoId = form.elements['condo-id'].value;
    const condoData = {
        nome: form.elements['condo-nome'].value,
        nome_fantasia: form.elements['condo-nome-fantasia'].value,
        cnpj: form.elements['condo-cnpj'].value || null, // Pega o CNPJ, ou envia nulo se estiver vazio
        empresa_id: state.currentUserProfile.empresa_id
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
        initializeApp();
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
    if (confirm(`Tem certeza que deseja excluir o condomínio "${condo.nome_fantasia}"?\nATENÇÃO: Todas as tarefas associadas a ele também serão excluídas!`)) {
        try {
            await api.deleteCondoInDB(condoId);
            initializeApp();
        } catch (error) {
            alert('Erro ao excluir condomínio: ' + error.message);
        }
    }
}

async function handleCreateOrUpdateTaskType(event) {
    event.preventDefault();
    const form = event.target;
    const typeId = form.elements['task-type-id'].value;
    const typeData = {
        nome_tipo: form.elements['task-type-nome'].value,
        cor: form.elements['task-type-cor'].value
    };

    if (!typeData.nome_tipo || !typeData.cor) {
        return alert("O nome e a cor do tipo de tarefa são obrigatórios.");
    }

    try {
        if (typeId) {
            // Atualiza o tipo de tarefa existente
            await api.updateTaskTypeInDB(typeId, typeData);
            alert('Tipo de tarefa atualizado com sucesso!');
        } else {
            // Cria um novo tipo de tarefa
            await api.createTaskTypeInDB(typeData);
            alert('Tipo de tarefa criado com sucesso!');
        }
        form.reset();
        document.getElementById('task-type-id').value = ''; // Limpa o campo oculto
        document.getElementById('task-type-submit-btn').textContent = 'Adicionar Tipo';
        initializeApp(); // Recarrega todos os dados para mostrar a atualização
    } catch (error) {
        console.error('Erro ao salvar o tipo de tarefa:', error);
        alert('Erro ao salvar o tipo de tarefa: ' + error.message);
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
                    initializeApp(); // Recarrega tudo para mostrar a nova lista
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
        initializeApp();
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
            initializeApp();
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
// Substitua esta função em seu js/app.js
function setupEventListeners() {
    if (listenersInitialized) return;
    console.log("Configurando event listeners pela primeira vez...");
    // Auth
    document.getElementById('login-btn')?.addEventListener('click', login);
    document.getElementById('logout-btn')?.addEventListener('click', logout);

    // Navegação Principal
    document.getElementById('nav-tasks')?.addEventListener('click', () => ui.showView('tasks-view'));
    document.getElementById('nav-dashboard')?.addEventListener('click', () => ui.showView('dashboard-view'));
    document.getElementById('nav-admin')?.addEventListener('click', () => ui.showView('admin-view'));

    // Formulários
    document.getElementById('task-form')?.addEventListener('submit', handleCreateTask);
    document.getElementById('edit-task-form')?.addEventListener('submit', handleUpdateTask);
    document.getElementById('create-user-form')?.addEventListener('submit', handleCreateUser);
    document.getElementById('edit-user-form')?.addEventListener('submit', handleUpdateUser);
    document.getElementById('condo-form')?.addEventListener('submit', handleCreateOrUpdateCondo);
    document.getElementById('task-type-form')?.addEventListener('submit', handleCreateOrUpdateTaskType);

    // Botões de Ação e Modais
    document.getElementById('add-user-btn')?.addEventListener('click', handleOpenCreateUserModal);
    document.getElementById('edit-task-modal-close-btn')?.addEventListener('click', ui.closeEditModal);
    document.getElementById('edit-task-modal-cancel-btn')?.addEventListener('click', ui.closeEditModal);
    document.getElementById('create-user-modal-close-btn')?.addEventListener('click', ui.closeCreateUserModal);
    document.getElementById('create-user-modal-cancel-btn')?.addEventListener('click', ui.closeCreateUserModal);
    document.getElementById('edit-user-modal-close-btn')?.addEventListener('click', ui.closeEditUserModal);
    document.getElementById('edit-user-modal-cancel-btn')?.addEventListener('click', ui.closeEditUserModal);
    document.getElementById('edit-condo-modal-close-btn')?.addEventListener('click', ui.closeEditCondoModal);
    document.getElementById('edit-condo-modal-cancel-btn')?.addEventListener('click', ui.closeEditCondoModal);

    // Filtros, Exportação e Importação
    document.getElementById('clear-filters')?.addEventListener('click', () => {
        state.activeFilters = { condominioId: '', status: 'active', dateStart: '', dateEnd: '', assigneeId: '' };
        document.getElementById('filter-bar')?.reset();
        document.getElementById('filter-condo-search').value = '';
        renderAll();
    });
    document.getElementById('export-pdf-btn')?.addEventListener('click', handleExportToPDF);
    document.getElementById('template-select')?.addEventListener('change', handleTemplateSelect);
    document.getElementById('import-condo-btn')?.addEventListener('click', () => {
        document.getElementById('condo-csv-input').click();
    });
    document.getElementById('condo-csv-input')?.addEventListener('change', handleCondoImport);
    document.getElementById('download-template-btn')?.addEventListener('click', handleDownloadTemplate);
    document.getElementById('set-password-form')?.addEventListener('submit', handleSetPassword);


    // Event Delegation para listas dinâmicas
    document.getElementById('task-list')?.addEventListener('click', (event) => {
        const button = event.target.closest('.task-action-btn');
        if (!button) return;
        const action = button.dataset.action;
        if (action === 'edit-task') handleOpenEditModal(button.dataset.taskid);
        if (action === 'toggle-task-status') handleToggleStatus(button.dataset.taskid);
        if (action === 'delete-task') handleDeleteTask(button.dataset.taskid);
    });
    document.getElementById('user-list')?.addEventListener('click', (event) => {
        const button = event.target.closest('.task-action-btn');
        if (!button) return;
        const action = button.dataset.action;
        if (action === 'edit-user') handleOpenEditUserModal(button.dataset.userid);
        if (action === 'toggle-user-status') handleToggleUserStatus(button.dataset.userid);
    });
    document.getElementById('condo-list')?.addEventListener('click', (event) => {
        const button = event.target.closest('.task-action-btn');
        if (!button) return;
        const action = button.dataset.action;
        if (action === 'edit-condo') handleEditCondo(parseInt(button.dataset.condoid, 10));
        if (action === 'delete-condo') handleDeleteCondo(parseInt(button.dataset.condoid, 10));
    });
    document.getElementById('task-type-list')?.addEventListener('click', (event) => {
        const button = event.target.closest('.task-action-btn');
        if (!button) return;
        const action = button.dataset.action;
        if (action === 'edit-task-type') handleEditTaskType(parseInt(button.dataset.typeid, 10));
        if (action === 'delete-task-type') handleDeleteTaskType(parseInt(button.dataset.typeid, 10));
    });
    document.getElementById('group-list')?.addEventListener('click', (event) => {
        const button = event.target.closest('.task-action-btn');
        if (!button) return;
        const groupId = parseInt(button.dataset.groupid, 10);
        const action = button.dataset.action;
        if (action === 'edit-group') {
            handleEditGroup(groupId, button.dataset.groupname);
        }
        if (action === 'delete-group') {
            handleDeleteGroup(groupId, button.dataset.groupname);
        }
    });

    document.getElementById('cargo-form')?.addEventListener('submit', handleCreateOrUpdateCargo);
    document.getElementById('group-form')?.addEventListener('submit', handleCreateOrUpdateGroup); // <-- Conexão para o formulário de Grupo
    
    document.getElementById('cargo-list')?.addEventListener('click', (event) => {
        const button = event.target.closest('.task-action-btn');
        if (!button) return;
        const cargoId = parseInt(button.dataset.cargoid, 10);
        const action = button.dataset.action;
        if (action === 'edit-cargo') {
            handleEditCargo(cargoId, button.dataset.cargoname);
        }
        if (action === 'delete-cargo') {
            handleDeleteCargo(cargoId, button.dataset.cargoname);
        }
    });

    document.getElementById('change-password-btn')?.addEventListener('click', () => {
    document.getElementById('change-password-modal').classList.add('is-visible');
    });

    // Listener para o formulário do modal
    document.getElementById('change-password-form')?.addEventListener('submit', handleUpdatePassword);

    // Listeners para fechar o novo modal
    document.getElementById('change-password-close-btn')?.addEventListener('click', () => {
    document.getElementById('change-password-modal').classList.remove('is-visible');
    });
    document.getElementById('change-password-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('change-password-modal').classList.remove('is-visible');
    });

    document.getElementById('forgot-password-link')?.addEventListener('click', handleForgotPassword);

    const filters = ['filter-status', 'filter-assignee', 'filter-date-start', 'filter-date-end', 'filter-task-type'];

    filters.forEach(id => {
        document.getElementById(id)?.addEventListener('change', (e) => {
            // O seletor de condomínio é tratado separadamente pela sua função customizada
            if (id === 'filter-condominio') return; 

            const filterMap = {
                'filter-status': 'status', 
                'filter-assignee': 'assigneeId', 
                'filter-date-start': 'dateStart', 
                'filter-date-end': 'dateEnd',
                'filter-task-type': 'taskTypeId' // Mapeia o novo filtro
            };
            state.activeFilters[filterMap[id]] = e.target.value;
            renderAll(); // Atualiza a tela a cada mudança
        });
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
            initializeApp();
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
    // Agora só nos preocupamos com o nome do cargo
    const cargoData = {
        nome_cargo: form.elements['cargo-nome'].value
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
        initializeApp(); // Recarrega os dados para mostrar a atualização
    } catch (error) {
        alert('Erro ao salvar cargo: ' + error.message);
    }
}

function handleEditCargo(cargoId, cargoName) {
    // Primeiro, busca o objeto 'cargo' completo na nossa lista 'state.allCargos'
    const cargo = state.allCargos.find(c => c.id === cargoId);
    if (!cargo) {
        console.error("Cargo não encontrado para edição:", cargoId);
        return;
    }

    // Agora, com o objeto 'cargo' completo, preenche o formulário
    document.getElementById('cargo-id').value = cargo.id;
    document.getElementById('cargo-nome').value = cargo.nome_cargo;
    document.getElementById('cargo-is-admin').checked = cargo.is_admin; // Esta linha agora funciona
    document.getElementById('cargo-submit-btn').textContent = 'Salvar Alterações';
    document.getElementById('cargo-nome').focus();
}

async function handleDeleteCargo(cargoId, cargoName) {
    if (confirm(`Tem certeza que deseja excluir o cargo "${cargoName}"?`)) {
        try {
            await api.deleteCargoInDB(cargoId);
            initializeApp();
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

async function handleCreateCondo(event) {
    event.preventDefault();
    const form = event.target;
    const condoData = {
        nome: form.elements['condo-nome'].value,
        nome_fantasia: form.elements['condo-nome-fantasia'].value,
        cnpj: form.elements['condo-cnpj'].value || null,
        empresa_id: state.currentUserProfile.empresa_id
    };
    try {
        await api.createCondoInDB(condoData);
        alert('Condomínio criado com sucesso!');
        form.reset();
        initializeApp();
    } catch (error) {
        if (error.code === '23505') {
            alert('Erro: O CNPJ informado já está cadastrado.');
        } else {
            alert('Erro ao salvar condomínio: ' + error.message);
        }
    }
}

async function handleUpdateCondo(event) {
    event.preventDefault();
    const form = event.target;
    const condoId = form.elements['edit-condo-id'].value;
    const condoData = {
        nome: form.elements['edit-condo-nome'].value,
        nome_fantasia: form.elements['edit-condo-nome-fantasia'].value,
        cnpj: form.elements['edit-condo-cnpj'].value || null,
        grupo_id: form.elements['edit-condo-group'].value ? parseInt(form.elements['edit-condo-group'].value, 10) : null
    };
    try {
        await api.updateCondoInDB(condoId, condoData);
        alert('Condomínio atualizado com sucesso!');
        ui.closeEditCondoModal();
        initializeApp();
    } catch(error) {
        if (error.code === '23505') {
            alert('Erro: O CNPJ informado já está cadastrado.');
        } else {
            alert('Erro ao salvar condomínio: ' + error.message);
        }
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
    const newPassword = document.getElementById('change-new-password').value;
    const confirmPassword = document.getElementById('change-confirm-password').value;

    if (newPassword.length < 6) {
        return alert('A nova senha deve ter no mínimo 6 caracteres.');
    }
    if (newPassword !== confirmPassword) {
        return alert('As senhas não coincidem.');
    }

    // A função updateUser do Supabase, quando chamada por um usuário logado,
    // atualiza a senha deste próprio usuário.
    const { error } = await supabaseClient.auth.updateUser({ 
        password: newPassword 
    });

    if (error) {
        alert("Erro ao atualizar a senha: " + error.message);
    } else {
        alert("Senha alterada com sucesso!");
        document.getElementById('change-password-modal').classList.remove('is-visible');
        document.getElementById('change-password-form').reset();
    }
}


// Listener para evento personalizado
window.addEventListener('showAdminView', () => render.renderUserList(state.allUsers, state.currentUserProfile));
// Marca que os listeners foram configurados
// INICIALIZAÇÃO DA APLICAÇÃO
window.onload = () => {
    setupEventListeners();
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'PASSWORD_RECOVERY' && session) {
            console.log("Detectado primeiro acesso por convite. Mostrando tela para definir senha.");
            ui.show('set-password-screen');
            return; 
        }
        const isMainVisible = document.getElementById('main-container')?.classList.contains('is-visible');
        if (session) {
            if (isMainVisible) return;
            const sessionOk = await checkSession();
            if (sessionOk && sessionOk.status === 'ACTIVE') {
                ui.show('main-container');
                ui.showView('tasks-view');
                initializeApp();
            } else if (sessionOk && sessionOk.status === 'INACTIVE') {
                alert("Seu usuário está inativo. Contate o administrador.");
                logout();
            }
        } else {
            sessionStorage.clear();
            ui.show('login-screen');
        }
    });
};