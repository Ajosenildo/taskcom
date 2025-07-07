// js/render.js (Versão Definitiva e Corrigida)

import { createOrUpdateChart } from './utils.js';

function getVisualStatus(task, STATUSES) {
    if (!task || !task.status) return null;
    if (task.status === 'completed') return STATUSES.completed;
    if (task.status === 'deleted') return STATUSES.deleted;
    if (task.status === 'pending') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateParts = task.data_conclusao_prevista.split('-');
        const dueDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        return dueDate < today ? STATUSES.overdue : STATUSES.in_progress;
    }
    return null;
}

export function renderTasks(state) {
    const { tasks, condominios, taskTypes, STATUSES, activeFilters } = state;
    const list = document.getElementById('task-list');
    if (!list) return [];
    list.innerHTML = '';
    
    const processedTasks = tasks.map(task => ({ ...task, visualStatus: getVisualStatus(task, STATUSES) }));
    
    let tasksToDisplay = processedTasks;
    if (activeFilters.status === 'deleted') {
        tasksToDisplay = processedTasks.filter(t => t.status === 'deleted');
    } else {
        tasksToDisplay = processedTasks.filter(t => t.status !== 'deleted');
        if (activeFilters.status !== 'active') {
            tasksToDisplay = tasksToDisplay.filter(t => t.visualStatus && t.visualStatus.key === activeFilters.status);
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
            .map(c => c.id); // Pega apenas os IDs dos condomínios

        // Depois, filtra as tarefas que pertencem a um desses condomínios
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

    if (tasksToDisplay.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:#6b7280;">Nenhuma tarefa encontrada.</p>';
    } else {
        tasksToDisplay.forEach(task => {
            const condominio = condominios.find(c => c.id == task.condominio_id);
            const type = taskTypes.find(t => t.id == task.tipo_tarefa_id);
            const visualStatus = task.visualStatus;
            const card = document.createElement('div');
            card.className = `task-card ${task.status}`;
            if (visualStatus) {
                card.style.borderLeft = `5px solid ${visualStatus.color}`;
            }
            const condoDisplayName = condominio ? (condominio.nome_fantasia || condominio.nome) : 'N/A';

            // CÓDIGO HTML COMPLETO DO CARD
            card.innerHTML = `
                <div class="task-card-header">
                  <div class="task-card-title-wrapper">
                      <strong>${task.titulo}</strong>
                      ${visualStatus ? `<div class="task-card-visual-status" style="color: ${visualStatus.color};">${visualStatus.icon} <span>${visualStatus.text}</span></div>` : ''}
                  </div>
                  <span class="task-card-type" style="background-color: ${type ? type.cor : '#6b7280'};">${type ? type.nome_tipo : 'N/A'}</span>
                </div>
                <div class="task-card-details">
                  <span>Criado em: <strong>${new Date(task.data_criacao).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</strong></span>
                  <span>Concluir até: <strong>${new Date(task.data_conclusao_prevista).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</strong></span>
                </div>
                <div class="task-card-assignee">Responsável: <strong>${task.responsavel ? task.responsavel.nome_completo : 'Não definido'}</strong></div>
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
        const cargo = allCargos.find(c => c.id === user.cargo_id);
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
    // CORREÇÃO: Desempacota o objeto 'state'
    const { tasks, condominios, STATUSES, chartInstances } = state;

    const activeTasks = tasks.filter(t => t.status === 'pending');
    let inProgressCount = 0;
    let overdueCount = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    activeTasks.forEach(task => {
        const dateParts = task.data_conclusao_prevista.split('-');
        const dueDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        if (dueDate < today) overdueCount++;
        else inProgressCount++;
    });

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const completedLastMonthCount = tasks.filter(task => {
        if (task.status !== 'completed') return false;
        const completionDate = new Date(task.data_conclusao_prevista);
        return completionDate >= oneMonthAgo;
    }).length;

    document.getElementById('kpi-in-progress').textContent = inProgressCount;
    document.getElementById('kpi-overdue').textContent = overdueCount;
    document.getElementById('kpi-completed').textContent = completedLastMonthCount;
    
    const allCompletedCount = tasks.filter(t => t.status === 'completed').length;
    const statusData = {
        labels: ['Em Andamento', 'Atrasadas', 'Concluídas'],
        datasets: [{
            data: [inProgressCount, overdueCount, allCompletedCount],
            backgroundColor: [STATUSES.in_progress.color, STATUSES.overdue.color, STATUSES.completed.color],
            hoverOffset: 4
        }]
    };
    const statusChartOptions = {
        plugins: {
            legend: { position: 'top' },
            datalabels: {
                formatter: (value, context) => {
                    if (value === 0) return '';
                    const total = context.chart.data.datasets[0].data.reduce((sum, data) => sum + data, 0);
                    if (total === 0) return '';
                    const percentage = ((value / total) * 100).toFixed(1) + '%';
                    return `${value}\n(${percentage})`;
                },
                color: '#fff', font: { weight: 'bold', size: 14 }, textAlign: 'center'
            }
        }
    };
    createOrUpdateChart('statusChart', 'doughnut', statusData, chartInstances, 'status', statusChartOptions);

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
        datasets: [{
            label: 'Tarefas Ativas',
            data: Object.values(condoCounts),
            backgroundColor: 'rgba(30, 58, 138, 0.8)'
        }]
    };
    const condoChartOptions = {
        indexAxis: 'y',
        scales: { x: { ticks: { stepSize: 1 } } },
        plugins: { legend: { display: false } }
    };
    createOrUpdateChart('condoChart', 'bar', condoData, chartInstances, 'condo', condoChartOptions);
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
    if (!cargos || cargos.length <= 1) { // Mostra a msg se tiver apenas o admin
        listDiv.innerHTML = '<p>Nenhum cargo customizado cadastrado.</p>';
        return;
    }
    cargos.forEach(cargo => {
        // Não mostra o cargo 'Administrador' na lista de edição
        if (cargo.id === 1) return;

        const card = document.createElement('div');
        card.className = 'condo-card'; // Reutilizando estilo
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
        
        // No futuro, podemos adicionar mais 'else if' para outros eventos
        // else if (event.evento === 'Alteração de Status') { ... }

        return `<p><small>${eventDate} - ${userName}: ${event.evento} ${details}</small></p>`;
    }).join('');
}