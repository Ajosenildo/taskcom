// js/render.js (Versão Definitiva e Corrigida)
import { state } from './state.js';
import * as utils from './utils.js';
//import * as utils from './utils.js'; // Importa TUDO de utils.js como um objeto chamado 'utils'
// import { createOrUpdateChart, getTermSingular } from './utils.js';
// A linha de import do 'state' continua igual:


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

 // Em js/render.v3.js
export function renderSuperAdminDashboard(empresas) {
    const tableBody = document.getElementById('super-admin-table-body'); //
    if (!tableBody) return; //

    tableBody.innerHTML = ''; //

    if (!empresas || empresas.length === 0) { //
        // --- INÍCIO DA ALTERAÇÃO ---
        // Colspan agora é 9
        tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Nenhuma empresa encontrada.</td></tr>';
        // --- FIM DA ALTERAÇÃO ---
        return;
    }

    empresas.forEach(empresa => { //
        const row = document.createElement('tr');

        // Formata a data (lógica mantida)
        let dataCadastroFormatada = 'N/A';
        if (empresa.data_cadastro) {
            dataCadastroFormatada = new Date(empresa.data_cadastro).toLocaleDateString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric'
            });
        }

        // --- INÍCIO DA ALTERAÇÃO ---
        // Adicionamos a nova célula para empresa.segmento_nome
        row.innerHTML = `
            <td>
                <div>${empresa.nome_empresa}</div>
                <small class="text-muted">${empresa.cnpj_cpf || 'N/A'}</small>
            </td>
            <td>${empresa.status_detalhado || 'N/A'}</td>
            <td>${empresa.plano_nome || 'N/A'}</td>
            <td>${empresa.segmento_nome || 'N/A'}</td> <td>${dataCadastroFormatada}</td>
            <td>${empresa.admin_email || 'N/A'}</td>
            <td>${empresa.admin_telefone || 'N/A'}</td>
            <td>${empresa.qtd_usuarios || 0}</td>
            <td>
                <button class="task-action-btn btn-edit btn-icon" data-empresa-id="${empresa.id}">✏️</button>
            </td>
        `;
        // --- FIM DA ALTERAÇÃO ---
        
        tableBody.appendChild(row); //
    });
}
// Em js/render.v3.js
export function renderTasks(state) {
    const { tasks, condominios, taskTypes, STATUSES, activeFilters, currentUserProfile, displayLimit } = state; // Adicionado displayLimit
    const list = document.getElementById('task-list');
    if (!list) return [];
    list.innerHTML = '';

    // ... (toda a sua lógica de filtragem continua exatamente igual até a ordenação)
    
    let tasksToDisplay = tasks.map(task => ({ ...task, visualStatusInfo: getVisualStatus(task, STATUSES) }));
    // (cole aqui toda a sua lógica de filtro, if/else if, etc., até a linha do sort)
    if (currentUserProfile && currentUserProfile.empresa_id) {
        tasksToDisplay = tasksToDisplay.filter(t => t.empresa_id === currentUserProfile.empresa_id);
    }
    
    if (activeFilters.status === 'deleted') {
        tasksToDisplay = tasksToDisplay.filter(t => t.status === 'deleted');
    } else if (activeFilters.status === 'active') { 
        tasksToDisplay = tasksToDisplay.filter(t => t.status === 'pending');
    } else {
        tasksToDisplay = tasksToDisplay.filter(t => t.status !== 'deleted');
        if (activeFilters.status && activeFilters.status !== 'active') { 
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
        const condosInGroup = condominios.filter(c => c.grupo_id == activeFilters.groupId).map(c => c.id);
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
    // Fim da lógica de filtragem

    const tasksToRenderOnScreen = tasksToDisplay.slice(0, displayLimit);

    if (tasksToRenderOnScreen.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:#6b7280;">Nenhuma tarefa encontrada.</p>';
    } else {
        tasksToRenderOnScreen.forEach(task => {
            // ... (toda a sua lógica de criar o card da tarefa continua igual)
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

    // Adiciona o botão "Carregar Mais" se houver mais tarefas a serem exibidas
    if (tasksToDisplay.length > tasksToRenderOnScreen.length) {
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.id = 'load-more-btn'; // Damos um ID para o botão
        loadMoreBtn.className = 'load-more-btn';
        loadMoreBtn.textContent = `Carregar Mais ${Math.min(20, tasksToDisplay.length - tasksToRenderOnScreen.length)} Tarefas`;
        list.appendChild(loadMoreBtn);
    }

    return tasksToDisplay;
}

export function renderUserList(allUsers, currentUserProfile, allCargos, allGroups, userGroupAssignments, allCondos, allCondoAssignments) {
    const userListDiv = document.getElementById('user-list');
    if (!userListDiv) return;
    userListDiv.innerHTML = '';
    if (!allUsers || allUsers.length === 0) {
        userListDiv.innerHTML = '<p>Nenhum usuário encontrado.</p>';
        return;
    }

    allUsers.forEach(user => {
        // Busca o cargo (usamos 'allCargos' que já tem 'is_client_role' da API)
        const cargo = user.cargo; // 'user.cargo' já é o objeto vindo da API
        const cargoInfo = cargo 
            ? { nome: cargo.nome_cargo, classe: `user-role-${cargo.nome_cargo.toLowerCase().replace(/\s+/g, '-')}` }
            : { nome: 'Desconhecido', classe: '' };
        if (cargo?.nome_cargo === 'Administrador') cargoInfo.classe = 'user-role-admin';

        // --- INÍCIO DA ALTERAÇÃO (Lógica de Grupos e Condomínios) ---
        let associationsHtml = '';

        if (cargo && cargo.is_client_role) {
            // Se for CLIENTE, mostra os CONDOMÍNIOS
            const userCondos = (allCondoAssignments || [])
                .filter(assignment => assignment.usuario_id === user.id)
                .map(assignment => {
                    const condo = allCondos.find(c => c.id === assignment.condominio_id);
                    return condo ? (condo.nome_fantasia || condo.nome) : '';
                })
                .filter(Boolean);
            
            associationsHtml = `<div class="user-groups"><small>Condomínios: ${userCondos.length > 0 ? userCondos.join(', ') : 'Nenhum'}</small></div>`;
        
        } else {
            // Se for funcionário, mostra os GRUPOS
            const userGroups = (userGroupAssignments || [])
                .filter(assignment => assignment.usuario_id === user.id)
                .map(assignment => {
                    const group = allGroups.find(g => g.id === assignment.grupo_id);
                    return group ? group.nome_grupo : '';
                })
                .filter(Boolean);
            
            associationsHtml = `<div class="user-groups"><small>Grupos: ${userGroups.length > 0 ? userGroups.join(', ') : 'Nenhum'}</small></div>`;
        }
        // --- FIM DA ALTERAÇÃO ---

        const userCard = document.createElement('div');
        userCard.className = `user-card ${!user.ativo ? 'inactive' : ''}`; //

        // Lógica dos botões (mantida)
        let actionsHtml = '';
        if (currentUserProfile && currentUserProfile.id !== user.id) { //
            const buttonText = user.ativo ? 'Desativar' : 'Reativar'; //
            const buttonClass = user.ativo ? 'btn-status-deactivate' : 'btn-status-reactivate'; //
            
            actionsHtml = `
                <div class="user-card-actions">
                    <button class="task-action-btn btn-edit" data-action="edit-user" data-userid="${user.id}">Editar</button>
                    <button class="task-action-btn ${buttonClass}" data-action="toggle-user-status" data-userid="${user.id}">
                        ${buttonText}
                    </button>
                </div>
            `;
        }

        userCard.innerHTML = `
          <div class="user-info">
            <strong>${user.nome_completo || user.email}</strong>
            <small>Status: ${user.ativo ? 'Ativo' : 'Inativo'}</small>
            ${associationsHtml} </div>
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
    utils.createOrUpdateChart('statusChart', 'doughnut', statusData, chartInstances, 'status');

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
    utils.createOrUpdateChart('assigneeChart', 'bar', assigneeData, chartInstances, 'assignee', { indexAxis: 'y' });

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
    utils.createOrUpdateChart('condoChart', 'bar', condoData, chartInstances, 'condo');
}


export function renderCondoList(condominios, grupos) {
    console.log("[renderCondoList] Iniciando. Dados recebidos:", condominios); // DEBUG 1
    
    const condoListDiv = document.getElementById('condo-list');
    if (!condoListDiv) {
        console.error("[renderCondoList] ERRO: Div 'condo-list' não encontrada!"); // DEBUG 2
        return;
    }

    console.log("[renderCondoList] Limpando HTML anterior..."); // DEBUG 3
    condoListDiv.innerHTML = ''; // Limpa a lista

    if (!condominios || condominios.length === 0) {
        const termoSingular = utils.getTermSingular(); // Assume que utils está importado
        let mensagem = '';
        if (termoSingular.endsWith('a')) {
            mensagem = `<p>Nenhuma ${termoSingular} cadastrada.</p>`;
        } else {
            mensagem = `<p>Nenhum ${termoSingular} cadastrado.</p>`;
        }
        condoListDiv.innerHTML = mensagem;
        console.log("[renderCondoList] Lista vazia, exibindo mensagem padrão."); // DEBUG 4
        return;
    }

    console.log(`[renderCondoList] Renderizando ${condominios.length} itens...`); // DEBUG 5
    condominios.forEach(condo => {
        // DEBUG 6: Loga o nome de cada item antes de desenhar
        console.log(`[renderCondoList] Desenhando item: ${condo.nome_fantasia || condo.nome} (ID: ${condo.id})`); 
        
        const grupo = grupos.find(g => g.id === condo.grupo_id);
        const card = document.createElement('div');
        card.className = 'condo-card';
        card.innerHTML = `
            <div class="condo-info">
                <strong>${condo.nome_fantasia || condo.nome}</strong> 
                <small>${grupo ? `Grupo: ${grupo.nome_grupo}` : 'Sem grupo'}</small>
            </div>
            <div class="user-card-actions">
                <button class="task-action-btn btn-edit" data-action="edit-condo" data-condoid="${condo.id}">Editar</button>
                <button class="task-action-btn btn-delete" data-action="delete-condo" data-condoid="${condo.id}">Excluir</button>
            </div>
        `;
        condoListDiv.appendChild(card);
    });
    console.log("[renderCondoList] Renderização concluída."); // DEBUG 7
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
    historyListDiv.innerHTML = '<p><small>Nenhum evento registrado para esta tarefa.</small></p>';
    if (!events || events.length === 0) return;

    historyListDiv.innerHTML = events.map(event => {
        const eventDate = new Date(event.created_at).toLocaleString('pt-BR');
        const user = state.allUsers.find(u => u.id === event.usuario_id);
        const actorName = user ? user.nome_completo : 'Usuário do Sistema'; // Quem realizou a ação

        let fullEventDescription = '';

        if (event.evento === 'Criação') {
            const creatorName = event.detalhes?.criado_por || actorName;
            const assigneeName = event.detalhes?.designado_para || 'Não definido';

            // ========================================================================
            // INÍCIO DA CORREÇÃO - LÓGICA CONDICIONAL
            // ========================================================================
            // Verifica se o criador e o designado são a mesma pessoa
            if (creatorName === assigneeName) {
                // Se forem iguais, mostra a frase simples
                fullEventDescription = `${eventDate}: Tarefa criada por <strong>${creatorName}</strong>`;
            } else {
                // Se forem diferentes, mostra a frase completa
                fullEventDescription = `${eventDate}: Tarefa criada por <strong>${creatorName}</strong> e designada para <strong>${assigneeName}</strong>`;
            }
            // ========================================================================
            // FIM DA CORREÇÃO
            // ========================================================================

        } else {
            // Lógica para os OUTROS eventos (continua a mesma)
            let actionDetails = '';
            if (event.evento === 'Re-designação') {
                const de = event.detalhes?.de || 'Ninguém';
                const para = event.detalhes?.para || 'Não definido';
                actionDetails = `re-designada de <strong>${de}</strong> para <strong>${para}</strong>`;
            } else if (event.evento === 'Alteração de Status') {
                const statusKeyDe = event.detalhes?.de || null;
                const statusKeyPara = event.detalhes?.para || 'desconhecido';
                const statusTextDe = statusKeyDe ? (state.STATUSES[statusKeyDe]?.text || statusKeyDe) : null;
                const statusTextPara = state.STATUSES[statusKeyPara]?.text || statusKeyPara;
                if (statusTextDe) {
                    actionDetails = `teve o status alterado de <strong>${statusTextDe}</strong> para <strong>${statusTextPara}</strong>`;
                } else {
                    actionDetails = `teve o status definido como <strong>${statusTextPara}</strong>`;
                }
            } else {
                actionDetails = event.evento;
            }
            fullEventDescription = `${eventDate}: Tarefa ${actionDetails} por <strong>${actorName}</strong>`;
        }
        
        return `<p><small>${fullEventDescription}</small></p>`;
    }).join('');
}