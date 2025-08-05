// js/render.js (Versão Definitiva e Corrigida)

import { createOrUpdateChart } from './utils.js';

function getVisualStatus(task, STATUSES) {
    if (!task || !task.status) return null;

    if (task.status === 'completed') return { status: STATUSES.completed, days: 0 };
    if (task.status === 'deleted') return { status: STATUSES.deleted, days: 0 };

    if (task.status === 'pending') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dateParts = task.data_conclusao_prevista.split('-');
        const dueDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);

        if (dueDate < today) {
            const diffTime = today - dueDate;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return { status: STATUSES.overdue, days: diffDays };
        } else {
            return { status: STATUSES.in_progress, days: 0 };
        }
    }
    return null;
}

 export function renderTasks(state) {
    const { tasks, condominios, taskTypes, STATUSES, activeFilters, currentUserProfile } = state; // Adicionado currentUserProfile
    const list = document.getElementById('task-list');
    if (!list) return [];
    list.innerHTML = '';

    const processedTasks = tasks.map(task => ({ ...task, visualStatusInfo: getVisualStatus(task, STATUSES) }));
    
    let tasksToDisplay = processedTasks;

    if (currentUserProfile && currentUserProfile.empresa_id) {
        tasksToDisplay = tasksToDisplay.filter(t => t.empresa_id === currentUserProfile.empresa_id);
    }

   
    if (currentUserProfile && !currentUserProfile.cargo?.is_admin) {
        const userId = currentUserProfile.id;
        tasksToDisplay = tasksToDisplay.filter(t => t.criador_id === userId || t.responsavel_id === userId);
    }
    
    if (activeFilters.status === 'deleted') {
        tasksToDisplay = tasksToDisplay.filter(t => t.status === 'deleted');
    } else {
        tasksToDisplay = tasksToDisplay.filter(t => t.status !== 'deleted');
        if (activeFilters.status !== 'active') {
            tasksToDisplay = tasksToDisplay.filter(t => t.visualStatusInfo && t.visualStatusInfo.status.key === activeFilters.status);
        }
    }

    if (activeFilters.condominioId) {
        tasksToDisplay = tasksToDisplay.filter(t => t.condominio_id == activeFilters.condominioId);
    }
    if (activeFilters.assigneeId) {
        tasksToDisplay = tasksToDisplay.filter(t => t.responsavel_id == activeFilters.assigneeId);
    }
    if (activeFilters.taskTypeId) {
        tasksToDisplay = tasksToDisplay.filter(t => t.tipo_tarefa_id == activeFilters.taskTypeId);
    }
    if (activeFilters.groupId) {
        const condosInGroup = condominios
            .filter(c => c.grupo_id == activeFilters.groupId)
            .map(c => c.id);
        tasksToDisplay = tasksToDisplay.filter(t => condosInGroup.includes(t.condominio_id));
    }
    if (activeFilters.dateStart) {
        const startDate = new Date(activeFilters.dateStart + "T00:00:00");
        tasksToDisplay = tasksToDisplay.filter(t => new Date(t.data_conclusao_prevista + "T00:00:00") >= startDate);
    }
    if (activeFilters.dateEnd) {
        const endDate = new Date(activeFilters.dateEnd + "T00:00:00");
        tasksToDisplay = tasksToDisplay.filter(t => new Date(t.data_conclusao_prevista + "T00:00:00") <= endDate);
    }

    tasksToDisplay.sort((a, b) => new Date(a.data_conclusao_prevista) - new Date(b.data_conclusao_prevista) || b.id - a.id);

    // O resto da função de renderização continua igual...
    if (tasksToDisplay.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:#6b7280;">Nenhuma tarefa encontrada.</p>';
    } else {
        tasksToDisplay.forEach(task => {
            const condominio = condominios.find(c => c.id == task.condominio_id);
            const type = taskTypes.find(t => t.id == task.tipo_tarefa_id);
            const visualStatusInfo = task.visualStatusInfo;
            const card = document.createElement('div');
            card.className = `task-card ${task.status}`;
            
            if (visualStatusInfo) {
                card.style.borderLeft = `5px solid ${visualStatusInfo.status.color}`;
            }
            
            const condoDisplayName = condominio ? (condominio.nome_fantasia || condominio.nome) : 'N/A';

            let overdueText = '';
            if (visualStatusInfo && visualStatusInfo.status.key === 'overdue' && visualStatusInfo.days > 0) {
                overdueText = ` (${visualStatusInfo.days} dia${visualStatusInfo.days > 1 ? 's' : ''} de atraso)`;
            }

            // Garante que o nome do criador e responsável venham dos campos corretos da VIEW
            const criadorNome = task.criador_nome || 'Sistema';
            const responsavelNome = task.responsavel_nome || 'Não definido';

            card.innerHTML = `
                <div class="task-card-header">
                  <div class="task-card-title-wrapper">
                      <strong>${task.titulo}</strong>
                      ${visualStatusInfo ? `<div class="task-card-visual-status" style="color: ${visualStatusInfo.status.color};">${visualStatusInfo.status.icon} <span>${visualStatusInfo.status.text}${overdueText}</span></div>` : ''}
                  </div>
                  <span class="task-card-type" style="background-color: ${type ? type.cor : '#6b7280'};">${type ? type.nome_tipo : 'N/A'}</span>
                </div>
                <div class="task-card-details">
                  <span>Criado em: <strong>${new Date(task.data_criacao).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} por ${criadorNome}</strong></span>
                  <span>Concluir até: <strong>${new Date(task.data_conclusao_prevista).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</strong></span>
                </div>
                <div class="task-card-assignee">Responsável: <strong>${responsavelNome}</strong></div>
                <p>${task.descricao || 'Nenhuma descrição.'}</p>
                <div class="task-card-condo">${condoDisplayName}</div>
                <div class="task-card-actions">
                  <button class="task-action-btn btn-edit" data-action="edit-task" data-taskid="${task.id}">Editar</button>
                  <button class="task-action-btn btn-status ${task.status === 'completed' ? 'reopen' : ''}" data-action="toggle-task-status" data-taskid="${task.id}">${task.status === 'pending' ? 'Concluir' : 'Reabrir'}</button>
                  <button class="task-action-btn btn-delete" data-action="delete-task" data-taskid="${task.id}">Excluir</button>
                </div>
            `;
            if (task.status === 'deleted' || task.status === 'completed') {
                card.querySelector('.btn-edit')?.remove();
                if (task.status === 'deleted') card.querySelector('.task-card-actions')?.remove();
            }
            list.appendChild(card);
        });
    }
    return tasksToDisplay;
}

export function renderUserList(allUsers, currentUserProfile, allCargos, allGroups, userGroupAssignments) {
    const userListDiv = document.getElementById('user-list');
    if (!userListDiv) return;
    userListDiv.innerHTML = '';
    if (!allUsers || allUsers.length === 0) {
        userListDiv.innerHTML = '<p>Nenhum usuário encontrado.</p>';
        return;
    }

    allUsers.forEach(user => {
        const cargo = (allCargos || []).find(c => c.id === user.cargo_id);
        // Define o nome e a classe CSS do cargo
        const cargoInfo = cargo 
            ? { nome: cargo.nome_cargo, classe: `user-role-${cargo.nome_cargo.toLowerCase().replace(/\s+/g, '-')}` }
            : { nome: 'Desconhecido', classe: '' };

        // Garante que o Administrador sempre tenha a classe correta para a cor vermelha
        if (cargo?.nome_cargo === 'Administrador') cargoInfo.classe = 'user-role-admin';

        const userGroups = (userGroupAssignments || [])
            .filter(assignment => assignment.usuario_id === user.id)
            .map(assignment => {
                const group = allGroups.find(g => g.id === assignment.grupo_id);
                return group ? group.nome_grupo : '';
            })
            .filter(Boolean);

        const userCard = document.createElement('div');
        userCard.className = `user-card ${!user.ativo ? 'inactive' : ''}`;

        const groupsHtml = `<div class="user-groups"><small>Grupos: ${userGroups.length > 0 ? userGroups.join(', ') : 'Nenhum'}</small></div>`;

        let actionsHtml = '';
        if (currentUserProfile && currentUserProfile.id !== user.id) {
            // CORREÇÃO: Agrupa os botões dentro de um único container
            actionsHtml = `
                <div class="user-card-actions">
                    <button class="task-action-btn btn-edit" data-action="edit-user" data-userid="${user.id}">Editar</button>
                    <button class="task-action-btn btn-status ${!user.ativo ? 'inactive' : ''}" data-action="toggle-user-status" data-userid="${user.id}">
                        ${user.ativo ? 'Desativar' : 'Reativar'}
                    </button>
                </div>
            `;
        }

        userCard.innerHTML = `
          <div class="user-info">
            <strong>${user.nome_completo || user.email}</strong>
            <small>Status: ${user.ativo ? 'Ativo' : 'Inativo'}</small>
            ${groupsHtml}
          </div>
          <div class="user-role-actions-wrapper">
            <span class="user-role ${cargoInfo.classe}">${cargoInfo.nome}</span>
            ${actionsHtml}
          </div>
        `;
        userListDiv.appendChild(userCard);
    });
}

export function renderDashboard(state) {
    const { tasks, condominios, STATUSES, chartInstances, currentUserProfile, allUsers } = state;

    // --- LEITURA E APLICAÇÃO DOS FILTROS ---
    const dashboardUserFilter = document.getElementById('dashboard-user-filter');
    const selectedUserId = dashboardUserFilter ? dashboardUserFilter.value : '';
    const startDateFilter = document.getElementById('dashboard-date-start')?.value;
    const endDateFilter = document.getElementById('dashboard-date-end')?.value;
    
    let tasksInCompany = tasks.filter(t => t.empresa_id === currentUserProfile.empresa_id);
    let tasksToRender = selectedUserId ? tasksInCompany.filter(t => t.responsavel_id === selectedUserId) : tasksInCompany;

    // --- CÁLCULO DOS INDICADORES E DADOS PARA OS GRÁFICOS ---
    
    // 1. Lógica para tarefas Ativas
    let activeTasks = tasksToRender.filter(t => t.status === 'pending');
    if (startDateFilter) { activeTasks = activeTasks.filter(t => t.data_conclusao_prevista >= startDateFilter); }
    if (endDateFilter) { activeTasks = activeTasks.filter(t => t.data_conclusao_prevista <= endDateFilter); }
    
    let inProgressCount = 0;
    let overdueCount = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const overdueTasks = []; // Array para guardar as tarefas atrasadas para o novo gráfico

    activeTasks.forEach(task => {
        const dateParts = task.data_conclusao_prevista.split('-');
        const dueDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        if (dueDate < today) {
            overdueCount++;
            overdueTasks.push(task); // Adiciona a tarefa à lista de atrasadas
        } else {
            inProgressCount++;
        }
    });

    // 2. Lógica para tarefas Concluídas
    let completedTasks = tasksToRender.filter(t => t.status === 'completed');
    if (startDateFilter) { completedTasks = completedTasks.filter(t => t.data_conclusao_prevista >= startDateFilter); }
    if (endDateFilter) { completedTasks = completedTasks.filter(t => t.data_conclusao_prevista <= endDateFilter); }
    const completedInPeriodCount = completedTasks.length;

    // --- ATUALIZAÇÃO DA INTERFACE ---

    // Atualiza KPIs
    document.getElementById('kpi-in-progress').textContent = inProgressCount;
    document.getElementById('kpi-overdue').textContent = overdueCount;
    document.getElementById('kpi-completed').textContent = completedInPeriodCount;
    
    // Atualiza Gráfico de Status
    const statusData = {
        labels: ['Em Andamento', 'Atrasadas', 'Concluídas (Período)'],
        datasets: [{ data: [inProgressCount, overdueCount, completedInPeriodCount], backgroundColor: [STATUSES.in_progress.color, STATUSES.overdue.color, STATUSES.completed.color] }]
    };
    createOrUpdateChart('statusChart', 'doughnut', statusData, chartInstances, 'status');

    // NOVO: Lógica para Gráfico de Atrasadas por Responsável
    const assigneeCounts = {};
    overdueTasks.forEach(task => {
        assigneeCounts[task.responsavel_id] = (assigneeCounts[task.responsavel_id] || 0) + 1;
    });
    
    const assigneeLabels = Object.keys(assigneeCounts).map(userId => {
        const user = allUsers.find(u => u.id === userId);
        return user ? user.nome_completo : 'Desconhecido';
    });
    
    const assigneeData = {
        labels: assigneeLabels,
        datasets: [{
            label: 'Tarefas Atrasadas',
            data: Object.values(assigneeCounts),
            backgroundColor: STATUSES.overdue.color, // Cor laranja de "Atrasadas"
            borderColor: 'rgba(217, 119, 6, 1)',
            borderWidth: 1
        }]
    };
    createOrUpdateChart('assigneeChart', 'bar', assigneeData, chartInstances, 'assignee', { indexAxis: 'y' });

    // Atualiza Gráfico de Condomínios
    const condoCounts = {};
    activeTasks.forEach(task => {
        condoCounts[task.condominio_id] = (condoCounts[task.condominio_id] || 0) + 1;
    });
    
    const condoLabels = Object.keys(condoCounts).map(id => {
        const condo = condominios.find(c => c.id == id);
        return condo ? (condo.nome_fantasia || condo.nome) : 'Desconhecido';
    });
    const condoData = {
        labels: condoLabels,
        datasets: [{ label: 'Tarefas Ativas', data: Object.values(condoCounts), backgroundColor: 'rgba(30, 58, 138, 0.8)' }]
    };
    createOrUpdateChart('condoChart', 'bar', condoData, chartInstances, 'condo');
}

export function renderCondoList(condominios, grupos) {
    const condoListDiv = document.getElementById('condo-list');
    if (!condoListDiv) return;
    condoListDiv.innerHTML = '';
    if (!condominios || condominios.length === 0) {
        condoListDiv.innerHTML = '<p>Nenhum condomínio cadastrado.</p>';
        return;
    }
    condominios.forEach(condo => {
        // Encontra o nome do grupo a partir do ID
        const grupo = grupos.find(g => g.id === condo.grupo_id);
        const card = document.createElement('div');
        card.className = 'condo-card';
        card.innerHTML = `
            <div class="condo-info">
                <strong>${condo.nome_fantasia}</strong>
                <small>${grupo ? `Grupo: ${grupo.nome_grupo}` : 'Sem grupo'}</small>
            </div>
            <div class="user-card-actions">
                <button class="task-action-btn btn-edit" data-action="edit-condo" data-condoid="${condo.id}">Editar</button>
                <button class="task-action-btn btn-delete" data-action="delete-condo" data-condoid="${condo.id}">Excluir</button>
            </div>
        `;
        condoListDiv.appendChild(card);
    });
}

export function renderTaskTypeList(taskTypes) {
    const listDiv = document.getElementById('task-type-list');
    if (!listDiv) return;
    listDiv.innerHTML = '';
    if (!taskTypes || taskTypes.length === 0) {
        return; // Não mostra nada se não houver tipos
    }
    taskTypes.forEach(type => {
        const card = document.createElement('div');
        card.className = 'condo-card'; // Reutilizando estilo
        card.innerHTML = `
            <div class="condo-info" style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 20px; height: 20px; background-color: ${type.cor}; border-radius: 5px;"></div>
                <strong>${type.nome_tipo}</strong>
            </div>
            <div class="user-card-actions">
                <button class="task-action-btn btn-edit" data-action="edit-task-type" data-typeid="${type.id}">Editar</button>
                <button class="task-action-btn btn-delete" data-action="delete-task-type" data-typeid="${type.id}">Excluir</button>
            </div>
        `;
        listDiv.appendChild(card);
    });
}

export function renderCargoList(cargos) {
    const listDiv = document.getElementById('cargo-list');
    if (!listDiv) return;
    listDiv.innerHTML = '';

    // Filtra primeiro os cargos que NÃO são de admin para depois renderizar
    const cargosParaExibir = cargos.filter(cargo => !cargo.is_admin);

    if (cargosParaExibir.length === 0) {
        listDiv.innerHTML = '<p>Nenhum cargo customizado cadastrado.</p>';
        return;
    }

    cargosParaExibir.forEach(cargo => {
        const card = document.createElement('div');
        card.className = 'condo-card';
        card.innerHTML = `
            <div class="condo-info">
                <strong>${cargo.nome_cargo}</strong>
            </div>
            <div class="user-card-actions">
                <button class="task-action-btn btn-edit" data-action="edit-cargo" data-cargoid="${cargo.id}" data-cargoname="${cargo.nome_cargo}">Editar</button>
                <button class="task-action-btn btn-delete" data-action="delete-cargo" data-cargoid="${cargo.id}" data-cargoname="${cargo.nome_cargo}">Excluir</button>
            </div>
        `;
        listDiv.appendChild(card);
    });
}

export function renderGroupList(groups) {
    const listDiv = document.getElementById('group-list');
    if (!listDiv) return;
    listDiv.innerHTML = '';
    if (!groups || groups.length === 0) {
        listDiv.innerHTML = '<p>Nenhum grupo cadastrado.</p>';
        return;
    }
    groups.forEach(group => {
        const card = document.createElement('div');
        card.className = 'condo-card'; // Reutilizando estilo
        card.innerHTML = `
            <div class="condo-info">
                <strong>${group.nome_grupo}</strong>
            </div>
            <div class="user-card-actions">
                <button class="task-action-btn btn-edit" data-action="edit-group" data-groupid="${group.id}" data-groupname="${group.nome_grupo}">Editar</button>
                <button class="task-action-btn btn-delete" data-action="delete-group" data-groupid="${group.id}" data-groupname="${group.nome_grupo}">Excluir</button>
            </div>
        `;
        listDiv.appendChild(card);
    });
}

export function renderTaskHistory(events) {
    const historyListDiv = document.getElementById('task-history-list');
    if (!historyListDiv) return;
    historyListDiv.innerHTML = '<p><small>Carregando histórico...</small></p>';

    if (!events || events.length === 0) {
        historyListDiv.innerHTML = '<p><small>Nenhum evento registrado para esta tarefa.</small></p>';
        return;
    }

    historyListDiv.innerHTML = events.map(event => {
        const eventDate = new Date(event.created_at).toLocaleString('pt-BR');
        const userName = event.usuario?.nome_completo || 'Usuário do Sistema';
        let details = '';

        // CORREÇÃO: Sintaxe da string corrigida para montar os detalhes do evento
        if (event.evento === 'Re-designação') {
            const de = event.detalhes?.de || 'Ninguém';
            const para = event.detalhes?.para || 'Não definido';
            details = `de <strong>${de}</strong> para <strong>${para}</strong>`;
        }
        
        return `<p><small>${eventDate} - ${userName}: ${event.evento} ${details}</small></p>`;
    }).join('');
}