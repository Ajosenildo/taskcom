// js/app.v2.js - VERSÃO FINAL, COMPLETA E VERIFICADA

import { supabaseClient } from './supabaseClient.js';
import { login, logout, checkSession } from './auth.v3.js';
import * as ui from './ui.v3.js';
import * as api from './api.v3.js';
import * as render from './render.v3.js';
import * as utils from './utils.js';

let deferredPrompt; 

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installButton = document.getElementById('install-app-btn');
    if(installButton) installButton.style.display = 'block';

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

const state = {
    tasks: [], taskTemplates: [], condominios: [], taskTypes: [],
    allUsers: [], currentUserProfile: null, allCargos: [], allGroups: [], userGroupAssignments: [],
    activeFilters: {
        condominioId: '', status: 'active',
        dateStart: '', dateEnd: '', assigneeId: '',
        taskTypeId: '', groupId: ''
    },
    chartInstances: { status: null, condo: null, assignee: null },
    tasksToDisplayForPdf: [],
    STATUSES: {
        completed: { key: 'completed', text: 'Concluída', icon: '✔️', color: '#10b981' },
        in_progress: { key: 'in_progress', text: 'Em Andamento', icon: '🔵', color: '#3b82f6' },
        overdue: { key: 'overdue', text: 'Atrasada', icon: '🟠', color: '#f59e0b' },
        deleted: { key: 'deleted', text: 'Excluída', icon: '❌', color: '#ef4444' }
    },
    unreadNotifications: 0, 
    audioUnlocked: false,
    lastNotifiedCount: 0
};

// --- FUNÇÕES DE ORQUESTRAÇÃO E MANIPULADORES (HANDLERS) ---

async function handleCreateTask(event) {
    event.preventDefault();
    try {
        const form = event.target;
        const title = form.elements['task-title'].value.trim();
        const assigneeId = form.elements['task-assignee'].value;
        const typeId = form.elements['task-type'].value;
        const condominioId = document.getElementById('task-condominio').value;
        const dueDate = form.elements['task-due-date'].value;

        if (!title || !typeId || !condominioId || !dueDate || !assigneeId) {
            return alert('Todos os campos obrigatórios precisam ser preenchidos.');
        }

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

        await api.createTaskInDB(taskData);

        if (form.elements['save-as-template'].checked) {
            await api.createTemplateInDB({
                titulo: title,
                tipo_tarefa_id: parseInt(typeId),
                empresa_id: state.currentUserProfile.empresa_id,
                criador_id: state.currentUserProfile.id
            });
        }
        form.reset();
        document.getElementById('task-condo-search').value = '';
        alert('Tarefa criada com sucesso!');

        const freshData = await api.fetchInitialData(
            state.currentUserProfile.empresa_id,
            state.currentUserProfile.id,
            state.currentUserProfile.cargo?.is_admin === true
        );
        // Atualiza o estado local com a nova tarefa e/ou modelo
        Object.assign(state, freshData);

        // Atualiza os menus de seleção que podem ter mudado (ex: modelos)
        ui.populateTemplatesDropdown(state.taskTemplates);
        
    } catch(error) {
        // ========================================================================
        // LÓGICA DE MENSAGEM DE ERRO APRIMORADA
        // ========================================================================
        if (error.message && error.message.includes('modelos_tarefa_empresa_id_titulo_key')) {
            // Se o erro for de duplicidade de modelo, mostra a mensagem personalizada.
            alert('Erro ao criar tarefa: O título desta tarefa já está salvo como um modelo. Desmarque a opção "Salvar como modelo" ou use um título diferente.');
        } else {
            // Para qualquer outro erro, mostra a mensagem padrão.
            alert("Ocorreu um erro ao criar a tarefa: " + error.message);
        }
        // ========================================================================
    }
}

function handleViewChange(event) {
    const { viewId } = event.detail;
    try {
        // Lógica de renderização principal
        if (viewId === 'view-tasks-view') {
            state.tasksToDisplayForPdf = render.renderTasks(state);
        } else if (viewId === 'dashboard-view') {
            render.renderDashboard(state);
        }

        // Lógica de renderização para as novas telas de Admin
        // Agora renderiza apenas o necessário, tornando o app mais eficiente
        if (viewId === 'admin-users-view') {
            render.renderUserList(state.allUsers, state.currentUserProfile, state.allCargos, state.allGroups, state.userGroupAssignments);
        } else if (viewId === 'admin-cargos-view') {
            render.renderCargoList(state.allCargos);
        } else if (viewId === 'admin-groups-view') {
            render.renderGroupList(state.allGroups);
        } else if (viewId === 'admin-types-view') {
            render.renderTaskTypeList(state.taskTypes);
        } else if (viewId === 'admin-condos-view') {
            render.renderCondoList(state.condominios, state.allGroups);
        }
    } catch (error) {
        console.error(`Erro fatal ao renderizar a view '${viewId}':`, error);
        alert(`Ocorreu um erro ao tentar exibir a tela '${viewId}'.`);
    }
}

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

    try {
        await api.updateTaskInDB(taskId, dadosParaAtualizar);
        const updatedTaskData = await api.fetchTaskById(taskId);
        const taskIndex = state.tasks.findIndex(t => t.id == taskId);
        if (taskIndex !== -1) {
            state.tasks[taskIndex] = updatedTaskData;
        }
        ui.closeEditModal();
        state.tasksToDisplayForPdf = render.renderTasks(state);
        alert('Tarefa atualizada com sucesso!');
    } catch (error) {
        alert(`Falha ao salvar alterações: ${error.message}`);
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

async function handleDeleteTask(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    if (window.confirm(`Tem certeza que deseja marcar a tarefa "${task.titulo}" como excluída?`)) {
        try {
            await api.deleteTaskInDB(taskId);
            const taskIndex = state.tasks.findIndex(t => t.id === taskId);
            if (taskIndex !== -1) {
                state.tasks[taskIndex].status = 'deleted';
            }
            state.tasksToDisplayForPdf = render.renderTasks(state);
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
        // 1. Cria o usuário no banco de dados
        await api.createUser({ email, password, nome_completo: nome, cargo_id: cargoId });
        ui.closeCreateUserModal();
        alert('Usuário criado com sucesso!');

        // 2. Busca todos os dados atualizados para garantir consistência
        const freshData = await api.fetchInitialData(
            state.currentUserProfile.empresa_id,
            state.currentUserProfile.id,
            state.currentUserProfile.cargo?.is_admin === true
        );
        // 3. Atualiza o estado local com os novos dados
        Object.assign(state, freshData);

        // 4. Redesenha apenas a lista de usuários, sem recarregar a página
        render.renderUserList(state.allUsers, state.currentUserProfile, state.allCargos, state.allGroups, state.userGroupAssignments);

    } catch(error) {
        alert('Erro ao criar usuário: ' + error.message);
    }
}

async function handleOpenEditModal(taskId) {
    const task = state.tasks.find(t => t.id == taskId);
    if (!task) return;
    ui.openEditModal(task, [], state.currentUserProfile);
    try {
        const [assignableUsers, historyEvents] = await Promise.all([
            api.fetchAllUsersForAssignment(),
            api.fetchTaskHistory(taskId)
        ]);
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
        await utils.exportTasksToPDF(
            state.tasksToDisplayForPdf, state.condominios, state.taskTypes,
            state.STATUSES, includeDesc, includeHistory,
            reportOwnerName, empresaNome, emitterName
        );
    } catch (error) {
        alert("Ocorreu um erro crítico ao gerar o PDF: " + error.message);
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
    const selectedGroupIds = Array.from(form.querySelectorAll('input[name="grupos"]:checked')).map(cb => parseInt(cb.value, 10));

    try {
        // 1. Atualiza o usuário e suas associações no banco
        await api.updateUserInDB(userId, updatedUserData);
        await api.updateUserGroupAssignments(userId, selectedGroupIds);
        ui.closeEditUserModal();
        alert("Usuário atualizado com sucesso!");

        // 2. Busca todos os dados atualizados
        const freshData = await api.fetchInitialData(
            state.currentUserProfile.empresa_id,
            state.currentUserProfile.id,
            state.currentUserProfile.cargo?.is_admin === true
        );
        // 3. Atualiza o estado local
        Object.assign(state, freshData);

        // 4. Redesenha apenas a lista de usuários
        render.renderUserList(state.allUsers, state.currentUserProfile, state.allCargos, state.allGroups, state.userGroupAssignments);

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
            // 1. Atualiza o status no banco de dados
            await api.toggleUserStatusInDB(userId, userToToggle.ativo);
            
            // 2. Encontra o índice do usuário no nosso estado local
            const userIndex = state.allUsers.findIndex(u => u.id === userId);
            if (userIndex !== -1) {
                // 3. Inverte o status 'ativo' no estado local
                state.allUsers[userIndex].ativo = !userToToggle.ativo;
            }

            // 4. Redesenha apenas a lista de usuários, sem recarregar a página
            render.renderUserList(state.allUsers, state.currentUserProfile, state.allCargos, state.allGroups, state.userGroupAssignments);

        } catch (error) {
            alert(`Erro ao ${action} o usuário: ` + error.message);
        }
    }
}

async function handleOpenEditUserModal(userId) {
    const userToEdit = state.allUsers.find(u => u.id === userId);
    if (!userToEdit) return;
    try {
        const groupAssignments = await api.fetchUserGroupAssignments(userId);
        ui.openEditUserModal(userToEdit, state.allCargos, state.allGroups, groupAssignments);
    } catch (error) {
        alert("Não foi possível carregar os dados para edição: " + error.message);
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
    const condo = state.condominios.find(c => c.id === condoId);
    if (!condo) return;

    if (confirm(`Tem certeza que deseja excluir o condomínio "${condo.nome_fantasia || condo.nome}"?`)) {
        try {
            await api.deleteCondoInDB(condoId);
            alert('Condomínio excluído com sucesso!');

            // Busca os dados atualizados
            const freshData = await api.fetchInitialData(
                state.currentUserProfile.empresa_id,
                state.currentUserProfile.id,
                state.currentUserProfile.cargo?.is_admin === true
            );
            // Atualiza o estado local
            Object.assign(state, freshData);

            // Redesenha a lista e os menus de seleção pelo app
            render.renderCondoList(state.condominios, state.allGroups);
            ui.populateDropdowns(state.condominios, state.taskTypes, state.allUsers, state.allGroups, state.currentUserProfile);

        } catch (error) {
            if (error.code === '23503') {
                alert("Este condomínio não pode ser excluído por haver tarefas vinculadas.");
            } else {
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
        empresa_id: state.currentUserProfile.empresa_id
    };
    if (!typeData.nome_tipo) return alert("O nome do tipo de tarefa é obrigatório.");

    try {
        if (typeId) {
            await api.updateTaskTypeInDB(typeId, typeData);
            alert('Tipo de tarefa atualizado com sucesso!');
        } else {
            await api.createTaskTypeInDB(typeData);
            alert('Tipo de tarefa criado com sucesso!');
        }

        // Limpa o formulário
        form.reset();
        document.getElementById('task-type-id').value = '';
        document.getElementById('task-type-submit-btn').textContent = 'Adicionar Tipo';
        
        // Busca os dados atualizados
        const freshData = await api.fetchInitialData(
            state.currentUserProfile.empresa_id,
            state.currentUserProfile.id,
            state.currentUserProfile.cargo?.is_admin === true
        );
        // Atualiza o estado local
        Object.assign(state, freshData);

        // Redesenha a lista e também os menus de seleção por todo o app
        render.renderTaskTypeList(state.taskTypes);
        ui.populateDropdowns(state.condominios, state.taskTypes, state.allUsers, state.allGroups, state.currentUserProfile);

    } catch (error) {
        // ========================================================================
        // LÓGICA DE MENSAGEM DE ERRO APRIMORADA
        // ========================================================================
        if (error.message && error.message.includes('tipos_tarefa_empresa_id_nome_tipo_key')) {
            // Se o erro for de duplicidade, mostra a sua mensagem personalizada.
            alert("Este tipo de tarefa já foi criado, use outro nome.");
        } else {
            // Para qualquer outro erro, mostra a mensagem padrão.
            alert('Erro ao salvar tipo de tarefa: ' + error.message);
        }
        // ========================================================================
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

        // Limpa e reseta o formulário
        form.reset();
        document.getElementById('group-id').value = '';
        document.getElementById('group-submit-btn').textContent = 'Adicionar Grupo';
        
        // Busca os dados atualizados
        const freshData = await api.fetchInitialData(
            state.currentUserProfile.empresa_id,
            state.currentUserProfile.id,
            state.currentUserProfile.cargo?.is_admin === true
        );
        // Atualiza o estado local
        Object.assign(state, freshData);

        // Redesenha apenas a lista de grupos
        render.renderGroupList(state.allGroups);

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
            // 1. Deleta o grupo no banco de dados
            await api.deleteGroupInDB(groupId);
            alert('Grupo excluído com sucesso!');

            // 2. Busca os dados atualizados
            const freshData = await api.fetchInitialData(
                state.currentUserProfile.empresa_id,
                state.currentUserProfile.id,
                state.currentUserProfile.cargo?.is_admin === true
            );
            // 3. Atualiza o estado local
            Object.assign(state, freshData);

            // 4. Redesenha apenas a lista de grupos
            render.renderGroupList(state.allGroups);

        } catch (error) {
            alert('Erro ao excluir grupo: ' + error.message);
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
        await api.requestPasswordReset(email);
        alert("Se uma conta com este e-mail existir, um link para redefinir a senha foi enviado.");
    } catch (error) {
        alert("Ocorreu um erro ao tentar enviar o e-mail de redefinição: " + error.message);
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
    const type = state.taskTypes.find(t => t.id === typeId);
    if (!type) return;

    if (confirm(`Tem certeza que deseja excluir o tipo de tarefa "${type.nome_tipo}"?`)) {
        try {
            // 1. Deleta no banco
            await api.deleteTaskTypeInDB(typeId);
            alert('Tipo de tarefa excluído com sucesso!');

            // 2. Busca os dados atualizados
            const freshData = await api.fetchInitialData(
                state.currentUserProfile.empresa_id,
                state.currentUserProfile.id,
                state.currentUserProfile.cargo?.is_admin === true
            );
            // 3. Atualiza o estado local
            Object.assign(state, freshData);

            // 4. Redesenha a lista e os menus de seleção
            render.renderTaskTypeList(state.taskTypes);
            ui.populateDropdowns(state.condominios, state.taskTypes, state.allUsers, state.allGroups, state.currentUserProfile);

        } catch (error) {
            if (error.code === '23503') {
                alert('Impossível excluir! Este tipo de tarefa ainda está vinculado a uma ou mais tarefas.');
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
        empresa_id: state.currentUserProfile.empresa_id
    };
    if (!cargoData.nome_cargo) return alert("O nome do cargo é obrigatório.");

    try {
        if (cargoId) {
            await api.updateCargoInDB(cargoId, cargoData);
            alert('Cargo atualizado com sucesso!');
        } else {
            await api.createCargoInDB(cargoData);
            alert('Cargo criado com sucesso!');
        }

        // Limpa e reseta o formulário
        form.reset();
        document.getElementById('cargo-id').value = '';
        document.getElementById('cargo-submit-btn').textContent = 'Adicionar Cargo';

        // Busca os dados atualizados em segundo plano
        const freshData = await api.fetchInitialData(
            state.currentUserProfile.empresa_id,
            state.currentUserProfile.id,
            state.currentUserProfile.cargo?.is_admin === true
        );
        // Atualiza o estado local
        Object.assign(state, freshData);

        // Redesenha apenas a lista de cargos, sem recarregar a página
        render.renderCargoList(state.allCargos);

    } catch (error) {
        if (error.message.includes('cargos_empresa_id_nome_cargo_key')) {
            alert('Erro: Cargo já existente!');
        } else {
            alert('Erro ao salvar cargo: ' + error.message);
        }
    }
}

function handleEditCargo(cargoId, cargoName) {
    const cargo = state.allCargos.find(c => c.id === cargoId);
    if (!cargo) return;
    document.getElementById('cargo-id').value = cargo.id;
    document.getElementById('cargo-nome').value = cargo.nome_cargo;
    document.getElementById('cargo-submit-btn').textContent = 'Salvar Alterações';
    document.getElementById('cargo-nome').focus();
}

async function handleDeleteCargo(cargoId, cargoName) {
    if (confirm(`Tem certeza que deseja excluir o cargo "${cargoName}"?`)) {
        try {
            // 1. Deleta o cargo no banco de dados
            await api.deleteCargoInDB(cargoId);
            alert('Cargo excluído com sucesso!');

            // 2. Busca os dados atualizados
            const freshData = await api.fetchInitialData(
                state.currentUserProfile.empresa_id,
                state.currentUserProfile.id,
                state.currentUserProfile.cargo?.is_admin === true
            );
            // 3. Atualiza o estado local
            Object.assign(state, freshData);

            // 4. Redesenha apenas a lista de cargos
            render.renderCargoList(state.allCargos);

        } catch (error) {
            if(error.code === '23503'){
                alert('Impossível excluir! Este cargo está vinculado a um ou mais usuários.');
            } else {
                alert('Erro ao excluir cargo: ' + error.message);
            }
        }
    }
}

async function handleUpdateCondo(event) {
    event.preventDefault();
    const form = event.target;
    const condoId = parseInt(form.elements['edit-condo-id'].value, 10);
    const condoData = {
        nome: form.elements['edit-condo-nome'].value,
        nome_fantasia: form.elements['edit-condo-nome-fantasia'].value,
        cnpj: form.elements['edit-condo-cnpj'].value || null,
        grupo_id: form.elements['edit-condo-group'].value ? parseInt(form.elements['edit-condo-group'].value, 10) : null
    };

    try {
        await api.updateCondoInDB(condoId, condoData);
        ui.closeEditCondoModal();
        alert('Condomínio atualizado com sucesso!');

        // Busca os dados atualizados
        const freshData = await api.fetchInitialData(
            state.currentUserProfile.empresa_id,
            state.currentUserProfile.id,
            state.currentUserProfile.cargo?.is_admin === true
        );
        // Atualiza o estado local
        Object.assign(state, freshData);

        // Redesenha a lista e os menus de seleção pelo app
        render.renderCondoList(state.condominios, state.allGroups);
        ui.populateDropdowns(state.condominios, state.taskTypes, state.allUsers, state.allGroups, state.currentUserProfile);

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
  ui.openCreateCondoModal(state.allGroups);
}

async function handleCreateCondo(event) {
    event.preventDefault();
    const form = event.target;
    const condoData = {
        nome: form.elements['create-condo-nome'].value.trim(),
        nome_fantasia: form.elements['create-condo-nome-fantasia'].value.trim(),
        cnpj: form.elements['create-condo-cnpj'].value.trim() || null,
        grupo_id: form.elements['create-condo-group'].value ? parseInt(form.elements['create-condo-group'].value, 10) : null,
        empresa_id: state.currentUserProfile.empresa_id
    };
    if (!condoData.nome || !condoData.nome_fantasia) return alert("Preencha todos os campos obrigatórios.");

    try {
        await api.createCondoInDB(condoData);
        ui.closeCreateCondoModal();
        alert("Condomínio criado com sucesso!");

        // Busca os dados atualizados
        const freshData = await api.fetchInitialData(
            state.currentUserProfile.empresa_id,
            state.currentUserProfile.id,
            state.currentUserProfile.cargo?.is_admin === true
        );
        // Atualiza o estado local
        Object.assign(state, freshData);

        // Redesenha a lista e os menus de seleção pelo app
        render.renderCondoList(state.condominios, state.allGroups);
        ui.populateDropdowns(state.condominios, state.taskTypes, state.allUsers, state.allGroups, state.currentUserProfile);

    } catch (error) {
        alert("Erro ao criar condomínio: " + error.message);
    }
}

async function verificarNotificacoes() {
    const { data: count, error } = await supabaseClient.rpc('contar_notificacoes_nao_lidas');

    if (error) {
        console.error("Erro ao verificar notificações:", error);
        return;
    }

    const badge = document.getElementById('notification-badge');
    state.unreadNotifications = count;

    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }

    updateFavicon(count);

    if (
        typeof state.lastNotifiedCount === 'number' &&
        count > state.lastNotifiedCount &&
        state.audioUnlocked
    ) {
        const sound = document.getElementById('notification-sound');
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => console.warn("Erro ao tocar som de notificação:", e));
        }
    }

    // ADICIONE ESTA LINHA NO FINAL DA FUNÇÃO
    state.lastNotifiedCount = count;
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

function updateFavicon(count) {
    const favicon = document.getElementById('favicon');
    if (!favicon) return;

    // Se não houver notificações, restaura o ícone original e para a execução.
    if (count === 0) {
        favicon.href = '/favicon/favicon-96x96.png';
        return;
    }

    // Cria um objeto de imagem para garantir que o favicon original seja carregado antes de desenharmos
    const img = new Image();
    img.src = '/favicon/favicon-96x96.png';

    // Quando a imagem do favicon original for carregada, o desenho começa
    img.onload = () => {
        // Cria um canvas (uma tela de desenho) invisível
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');

        // 1. Desenha a imagem original do favicon no canvas
        ctx.drawImage(img, 0, 0, 32, 32);

        // 2. Prepara o texto da notificação (ex: "1", "2", ..., "9+")
        const text = count > 9 ? '9+' : count.toString();
        
        // 3. Configurações do círculo vermelho (badge)
        ctx.beginPath();
        ctx.arc(22, 10, 8, 0, 2 * Math.PI); // Posição (x,y), raio, etc.
        ctx.fillStyle = 'red';
        ctx.fill();

        // 4. Configurações do texto do número
        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // 5. Desenha o número sobre o círculo vermelho
        ctx.fillText(text, 22, 10);

        // 6. Converte o desenho do canvas em uma imagem e atualiza o favicon
        favicon.href = canvas.toDataURL('image/png');
    };
}

function handleTaskListClick(event) {
    console.log("--- Clique detectado na lista de tarefas ---");
    
    // Pega o botão mais próximo que foi clicado
    const button = event.target.closest('.task-action-btn');
    
    if (!button) {
        console.log("O clique não foi em um botão de ação. Ignorando.");
        return;
    }
    
    const taskId = button.dataset.taskid;
    const action = button.dataset.action;

    console.log(`Botão de ação clicado! Ação: '${action}', ID da Tarefa: '${taskId}'`);

    // Estrutura if/else if para garantir que apenas uma ação seja executada
    if (action === 'edit-task') {
        console.log("Ação 'edit-task' reconhecida. Chamando a função handleOpenEditModal...");
        handleOpenEditModal(parseInt(taskId, 10));
    } else if (action === 'toggle-task-status') {
        console.log("Ação 'toggle-task-status' reconhecida. Chamando a função handleToggleStatus...");
        handleToggleStatus(parseInt(taskId, 10));
    } else if (action === 'delete-task') {
        console.log("Ação 'delete-task' reconhecida. Chamando a função handleDeleteTask...");
        handleDeleteTask(parseInt(taskId, 10));
    } else {
        console.log("Ação não reconhecida no botão.");
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
    
    document.addEventListener('click', unlockAudio, { once: true });
    
    // --- Autenticação ---
    document.getElementById('login-btn')?.addEventListener('click', login);
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    /* document.getElementById('toggle-password')?.addEventListener('click', () => {
        const passwordInput = document.getElementById('password');
        const isHidden = passwordInput.type === 'password';
        passwordInput.type = isHidden ? 'text' : 'password';
        document.getElementById('toggle-password').textContent = isHidden ? '👁️' : '🙈';
    });*/
    setupPasswordToggle('toggle-password', 'password'); // Tela de Login
    setupPasswordToggle('toggle-new-password', 'change-new-password'); // Modal Alterar Senha
    setupPasswordToggle('toggle-confirm-password', 'change-confirm-password');
    document.getElementById('forgot-password-link')?.addEventListener('click', handleForgotPassword);
    
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
    document.getElementById('edit-task-form')?.addEventListener('submit', handleUpdateTask);
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

    document.getElementById('clear-filters')?.addEventListener('click', () => {
        const filterBarForm = document.getElementById('filter-bar')?.closest('div'); // Encontra o formulário ou div pai
        if (filterBarForm) {
            Array.from(filterBarForm.querySelectorAll('select, input[type="date"]')).forEach(input => input.value = '');
        }
        document.getElementById('filter-condo-search').value = '';
        state.activeFilters = { condominioId: '', status: 'active', dateStart: '', dateEnd: '', assigneeId: '', taskTypeId: '', groupId: '' };
        document.getElementById('filter-status').value = 'active'; // Força o status a voltar para "Ativas"
        state.tasksToDisplayForPdf = render.renderTasks(state);
    });

    document.getElementById('dashboard-user-filter')?.addEventListener('change', () => {
        render.renderDashboard(state);
    });
    document.getElementById('dashboard-date-start')?.addEventListener('change', () => render.renderDashboard(state)); // <-- ADICIONE ESTA LINHA
    document.getElementById('dashboard-date-end')?.addEventListener('change', () => render.renderDashboard(state));

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
    document.getElementById('notifications-list')?.addEventListener('click', (event) => {
        const item = event.target.closest('.notification-item');
        if (item && item.dataset.taskId) {
            const taskId = item.dataset.taskId;
            
            // Fecha o modal e muda para a tela de visualização de tarefas
            ui.closeNotificationsModal();
            ui.showView('view-tasks-view');
            
            // Encontra o card da tarefa correspondente na tela
            const cardToFocus = document.querySelector(`.task-card .btn-edit[data-taskid="${taskId}"]`)?.closest('.task-card');

            if (cardToFocus) {
                // Rola a tela até o card
                cardToFocus.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // Adiciona a classe de destaque
                cardToFocus.classList.add('highlight');

                // Remove a classe após a animação para que possa ser usada novamente
                setTimeout(() => {
                    cardToFocus.classList.remove('highlight');
                }, 2000); // 2000ms = 2 segundos, a duração da animação
            } else {
                console.warn(`Card da tarefa com ID ${taskId} não encontrado na tela.`);
            }
        }
    });
    
    // Evento global para troca de view
    window.addEventListener('viewChanged', handleViewChange);
}

// --- FUNÇÃO PRINCIPAL DE INICIALIZAÇÃO ---
async function startApp() {
    setupEventListeners();
    ui.setupPWAInstallHandlers();
    
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (session) {
        if (appInitialized) return;
        appInitialized = true;

        try {
            const { data: userProfile, error: profileError } = await supabaseClient
                .from("usuarios")
                .select("*, cargo: cargo_id(nome_cargo, is_admin), empresa:empresa_id(nome_empresa)")
                .eq("id", session.user.id)
                .single();

            if (profileError) throw profileError;
            if (!userProfile) throw new Error("Perfil de usuário não encontrado.");
            
            state.currentUserProfile = userProfile;
            const initialData = await api.fetchInitialData(
                userProfile.empresa_id,
                userProfile.id,
                userProfile.cargo?.is_admin === true
            );
            Object.assign(state, initialData);

            state.unreadNotifications = initialData.unreadCount || 0;
                updateFavicon(state.unreadNotifications);
                if (state.unreadNotifications > 0) {
                    // ... (código do badge) ...
                }

            ui.setupRoleBasedUI(state.currentUserProfile);
            const userDisplayName = document.getElementById('user-display-name');
            if (userDisplayName) {
                userDisplayName.textContent = `Usuário: ${userProfile.nome_completo}`;
            }
            
            ui.populateDropdowns(state.condominios, state.taskTypes, state.allUsers, state.allGroups, state.currentUserProfile);
            ui.populateTemplatesDropdown(state.taskTemplates);

            const filterCondoDropdown = ui.createSearchableDropdown(
                'filter-condo-search', 'filter-condo-options', 'filter-condominio-id',
                state.condominios,
                (selectedValue) => {
                    state.activeFilters.condominioId = selectedValue;
                    console.log('%c[app.v2.js] DADOS ANTES DE RENDERIZAR:', 'color: blue; font-weight: bold;', {
                totalTarefasNoEstado: state.tasks.length,
                primeiraTarefa: state.tasks.length > 0 ? state.tasks[0] : 'NENHUMA TAREFA RECEBIDA'
            });
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

            // Renderização inicial
            state.tasksToDisplayForPdf = render.renderTasks(state);

            ui.show('main-container');
            const lastView = sessionStorage.getItem('lastActiveView');
            ui.showView(lastView || 'create-task-view');

            if (lastView) sessionStorage.removeItem('lastActiveView');
            
            // ... (código de notificações e outros) ...
            await verificarNotificacoes();
            // --- Listener de Notificações em Tempo Real ---
            const notificationChannel = supabaseClient
            .channel('public:notificacoes:user_id=eq.' + state.currentUserProfile.id)
            .on(
              'postgres_changes',
              { event: 'INSERT', schema: 'public', table: 'notificacoes' },
              async (payload) => {

                verificarNotificacoes();
    console.log('Nova notificação recebida!', payload);

    // Mostra o alerta visual e toca o som
    state.unreadNotifications++;
    updateFavicon(state.unreadNotifications);
    const badge = document.getElementById('notification-badge');
    if (badge) {
        badge.textContent = state.unreadNotifications;
        badge.style.display = 'block';
    }
    
    const sound = document.getElementById('notification-sound');
    if (sound && state.audioUnlocked) {
        sound.play().catch(e => console.warn("Erro ao tocar som:", e));
    }
    
    // ========================================================================
    // LÓGICA ROBUSTA PARA ATUALIZAÇÃO EM TEMPO REAL
    // Em vez de adicionar apenas uma tarefa, recarregamos todos os dados
    // para garantir consistência total (tarefas, condomínios, etc.)
    // ========================================================================
    try {
        const freshData = await api.fetchInitialData(
            state.currentUserProfile.empresa_id,
            state.currentUserProfile.id,
            state.currentUserProfile.cargo?.is_admin === true
        );
        Object.assign(state, freshData); // Atualiza todo o estado local
        
        console.log("Dados atualizados em tempo real.");
        
        // Se o usuário estiver na tela de tarefas, redesenha a lista com os dados completos
        if (document.getElementById('view-tasks-view').style.display === 'flex') {
            state.tasksToDisplayForPdf = render.renderTasks(state);
        }

            } catch (error) {
                console.error("Falha ao recarregar dados em tempo real:", error);
            }
    }
            )
            .subscribe();

            setInterval(verificarNotificacoes, 60000); 

        } catch (error) {
            console.error("Erro crítico durante a inicialização:", error);
            await logout();
        }
    } else {
        appInitialized = false;
        sessionStorage.clear();
        ui.show('login-screen');
    }
}

// Disparo da aplicação
window.addEventListener('DOMContentLoaded', startApp);