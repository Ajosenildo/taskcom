export function show(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('is-visible'));
    const screenToShow = document.getElementById(screenId);
    if (screenToShow) {
        screenToShow.classList.add('is-visible');
    }
}

export function showView(viewId) {
    // Esconde todas as views
    document.querySelectorAll('#main-container .view').forEach(v => v.style.display = 'none');
    
    // Mostra a view desejada
    const viewToShow = document.getElementById(viewId);
    if (viewToShow) {
        viewToShow.style.display = 'flex';
    }

    // Lógica atualizada para destacar o botão de navegação correto
    document.querySelectorAll('.main-nav-redesigned .nav-btn').forEach(btn => btn.classList.remove('active'));
    
    let activeBtnId;
    if (viewId.startsWith('admin-')) {
        // Nenhuma aba principal fica ativa quando estamos em uma subtela de admin
        activeBtnId = null; 
    } else if (viewId === 'create-task-view') {
        activeBtnId = 'nav-create';
    } else if (viewId === 'view-tasks-view') {
        activeBtnId = 'nav-view';
    } else if (viewId === 'dashboard-view') {
        activeBtnId = 'nav-dashboard';
    }

    if (activeBtnId) {
        const activeBtn = document.getElementById(activeBtnId);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }
    
    // Dispara o evento para notificar que a view mudou (essencial para o admin)
    window.dispatchEvent(new CustomEvent('viewChanged', { detail: { viewId } }));
}

export function setupRoleBasedUI(currentUserProfile) {
    const adminFeatures = document.querySelectorAll('.admin-feature');
    
    if (currentUserProfile && currentUserProfile.cargo?.is_admin === true) {
        adminFeatures.forEach(el => {
            el.style.display = 'flex'; // Mostra as funcionalidades de admin
        });
    } else {
        adminFeatures.forEach(el => {
            el.style.display = 'none'; // Esconde as funcionalidades de admin
        });
    }
}

export function populateDropdowns(CONDOMINIOS, TASK_TYPES, allUsers, allGroups, currentUserProfile) {
    const filterGroupSelect = document.getElementById('filter-group');
    const createTaskAssigneeSelect = document.getElementById('task-assignee');
    const filterAssigneeSelect = document.getElementById('filter-assignee');
    const createTaskTypeSelect = document.getElementById('task-type');
    const editTaskTypeSelect = document.getElementById('edit-task-type');
    const filterTaskTypeSelect = document.getElementById('filter-task-type');
    const editTaskCondoSelect = document.getElementById('edit-task-condominio');
    const condoGroupSelect = document.getElementById('condo-group-select');
    const dashboardUserFilter = document.getElementById('dashboard-user-filter');
    if (dashboardUserFilter) {
        dashboardUserFilter.innerHTML = '<option value="">Todos os Usuários</option>';
        allUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.nome_completo;
            dashboardUserFilter.appendChild(option);
        });
    }

    // Popula os seletores de Tipo de Tarefa
    const typeElements = [createTaskTypeSelect, editTaskTypeSelect, filterTaskTypeSelect];
    typeElements.forEach(s => { 
        if (s) {
            s.innerHTML = '<option value="">Selecione um Tipo...</option>';
            if (s.id === 'filter-task-type') s.options[0].textContent = "Todos os Tipos";
            TASK_TYPES.forEach(type => {
                const option = document.createElement('option');
                option.value = type.id;
                option.textContent = type.nome_tipo;
                s.appendChild(option); // Correção: removido cloneNode desnecessário
            });
        }
    });

    if (editTaskCondoSelect) {
        editTaskCondoSelect.innerHTML = '<option value="">Selecione um Condomínio...</option>';
        CONDOMINIOS.forEach(condo => {
            const option = document.createElement('option');
            option.value = condo.id;
            option.textContent = condo.nome_fantasia || condo.nome;
            editTaskCondoSelect.appendChild(option);
        });
    }

    if (condoGroupSelect) {
        condoGroupSelect.innerHTML = '<option value="">Nenhum</option>';
        allGroups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.nome_grupo;
            condoGroupSelect.appendChild(option);
        });
    }

    if (filterGroupSelect) {
        filterGroupSelect.innerHTML = '<option value="">Todos os Grupos</option>';
        allGroups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.nome_grupo;
            filterGroupSelect.appendChild(option);
        });
    }  

    // Lógica para os seletores de Responsável (Designar para:)
    const assigneeElements = [createTaskAssigneeSelect, filterAssigneeSelect];
    assigneeElements.forEach(select => {
        if (select) {
            // ALTERAÇÃO 2: Usamos o perfil do usuário passado como parâmetro, que é mais confiável.
            const currentUserId = currentUserProfile ? currentUserProfile.id : null;
            
            select.innerHTML = (select.id === 'filter-assignee') 
                ? '<option value="">Todos</option>' 
                : '<option value="">Selecione um Responsável...</option>';
            
            allUsers.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.nome_completo;
                select.appendChild(option);
            });

            // ALTERAÇÃO 3: Lógica para pré-selecionar o usuário logado na tela de criação
            if (select.id === 'task-assignee' && currentUserId) {
                select.value = currentUserId;
            }
        }
    });
}



export function populateTemplatesDropdown(taskTemplates) {
    const templateSelect = document.getElementById('template-select');
    if (!templateSelect) return;
    templateSelect.innerHTML = '<option value="">Ou selecione um modelo...</option>';
    taskTemplates.forEach(template => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.titulo;
        templateSelect.appendChild(option);
    });
}

export function openEditModal(task, allUsers, currentUserProfile) {
    const modal = document.getElementById('edit-task-modal');
    if (!task || !modal) {
        console.error("Tarefa ou modal de edição não encontrado.");
        return;
    }

    // Função auxiliar para definir valor apenas se o elemento existir
    const setValue = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.value = value;
        } else {
            console.warn(`Elemento com ID '${id}' não foi encontrado no modal.`);
        }
    };

    // Preenche os campos que REALMENTE existem no modal de edição de tarefa
    setValue('edit-task-id', task.id);
    setValue('edit-task-title', task.titulo);
    setValue('edit-task-desc', task.descricao);
    setValue('edit-task-due-date', task.data_conclusao_prevista);
    setValue('edit-task-type', task.tipo_tarefa_id);
    setValue('edit-task-condominio', task.condominio_id);

    const assigneeSelect = document.getElementById('edit-task-assignee');
    if(assigneeSelect) {
       assigneeSelect.innerHTML = `<option value="${task.responsavel_id}">${task.responsavel_nome || 'Carregando...'}</option>`;
    }
    
    // Mostra o modal
    modal.style.display = 'flex';
}

export function closeEditModal() {
    // CORREÇÃO: Usando style.display para garantir que o modal seja escondido e não bloqueie cliques.
    const modal = document.getElementById('edit-task-modal');
    if (modal) modal.style.display = 'none';
}

export function openCreateUserModal(cargos) {
    const roleSelect = document.getElementById('create-user-role');
    const modal = document.getElementById('create-user-modal');
    if (!roleSelect || !modal) return;
    
    roleSelect.innerHTML = '<option value="">Selecione um cargo...</option>';
    cargos.forEach(cargo => {
        const option = document.createElement('option');
        option.value = cargo.id;
        option.textContent = cargo.nome_cargo;
        roleSelect.appendChild(option);
    });
    modal.style.display = 'flex';
}

export function closeCreateUserModal() {
    const modal = document.getElementById('create-user-modal');
    if (modal) modal.style.display = 'none';
    const form = document.getElementById('create-user-form');
    if (form) form.reset();
}

export function openEditUserModal(user, cargos, todosOsGrupos, gruposDoUsuario) {
    const modal = document.getElementById('edit-user-modal');
    if (!modal || !user) return;

    // Preenche os campos do modal
    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('edit-user-name').value = user.nome_completo || '';
    
    // CORREÇÃO: Removemos a tentativa de preencher o campo de e-mail que não existe no modal.
    // document.getElementById('edit-user-email-display').value = user.email || '(email não disponível)';
    
    const roleSelect = document.getElementById('edit-user-role');
    roleSelect.innerHTML = '';
    
    if (cargos && cargos.length > 0) {
        cargos.forEach(cargo => {
            if (!cargo.is_admin) { // Garante que "Administrador" não seja uma opção selecionável
                const option = document.createElement('option');
                option.value = cargo.id;
                option.textContent = cargo.nome_cargo;
                roleSelect.appendChild(option);
            }
        });
    }
    roleSelect.value = user.cargo_id;

    const groupsListDiv = document.getElementById('edit-user-groups-list');
    groupsListDiv.innerHTML = '';
    if (todosOsGrupos && todosOsGrupos.length > 0) {
        todosOsGrupos.forEach(group => {
            const isChecked = gruposDoUsuario.includes(group.id);
            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'checkbox-container';
            checkboxContainer.innerHTML = `
                <input type="checkbox" id="group-${group.id}" name="grupos" value="${group.id}" ${isChecked ? 'checked' : ''}>
                <label for="group-${group.id}">${group.nome_grupo}</label>
            `;
            groupsListDiv.appendChild(checkboxContainer);
        });
    } else {
        groupsListDiv.innerHTML = '<p><small>Nenhum grupo cadastrado no sistema.</small></p>';
    }
    
    modal.style.display = 'flex';
}

export function closeEditUserModal() {
    const modal = document.getElementById('edit-user-modal');
    if (modal) modal.style.display = 'none';
}

export function openCreateCondoModal(allGroups) {
    const modal = document.getElementById('create-condo-modal');
    if (!modal) return;

    const groupSelect = document.getElementById('create-condo-group');
    groupSelect.innerHTML = '<option value="">Nenhum</option>';
    allGroups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.nome_grupo;
        groupSelect.appendChild(option);
    });
    
    modal.style.display = 'flex';
}

export function closeCreateCondoModal() {
    const modal = document.getElementById('create-condo-modal');
    if (modal) modal.style.display = 'none';
}

export function openEditCondoModal(condo, todosGrupos) {
    const modal = document.getElementById('edit-condo-modal');
    if (!modal) return;

    document.getElementById('edit-condo-id').value = condo.id;
    document.getElementById('edit-condo-nome').value = condo.nome;
    document.getElementById('edit-condo-nome-fantasia').value = condo.nome_fantasia;
    document.getElementById('edit-condo-cnpj').value = condo.cnpj || '';

    const groupSelect = document.getElementById('edit-condo-group');
    groupSelect.innerHTML = '<option value="">Nenhum</option>'; 

    todosGrupos.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.nome_grupo;
        groupSelect.appendChild(option);
    });

    groupSelect.value = condo.grupo_id || "";

    modal.style.display = 'flex';
}

export function openChangePasswordModal() {
    const modal = document.getElementById('change-password-modal');
    if (modal) modal.style.display = 'flex';
}

export function closeEditCondoModal() {
    const modal = document.getElementById('edit-condo-modal');
    if(modal) modal.style.display = 'none';
}

export function closeChangePasswordModal() {
    const modal = document.getElementById('change-password-modal');
    if (modal) modal.style.display = 'none';
    const form = document.getElementById('change-password-form');
    if (form) form.reset();
}

// O restante das funções não precisa de alteração
export function createSearchableDropdown(inputId, optionsId, hiddenInputId, items, onSelectCallback) {
    const searchInput = document.getElementById(inputId);
    const optionsContainer = document.getElementById(optionsId);
    const hiddenInput = document.getElementById(hiddenInputId);

    if (!searchInput || !optionsContainer || !hiddenInput) {
        console.error(`Elementos do seletor com busca não encontrados: ${inputId}, ${optionsId}, ${hiddenInputId}`);
        return { clear: () => {} };
    }

    const renderOptions = (filter = '') => {
        optionsContainer.innerHTML = '';
    
        const filteredItems = items.filter(item => 
            (item.nome_fantasia || item.nome || item.nome_completo || item.label || '')
                .toLowerCase()
                .includes(filter.toLowerCase())
        ).slice(0, 5);

        if (filteredItems.length === 0 && filter) {
            optionsContainer.innerHTML = `<div class="option-item disabled">Nenhum resultado</div>`;
            return;
        }

        filteredItems.forEach(item => {
            const optionElement = document.createElement('div');
            optionElement.className = 'option-item';
            // optionElement.textContent = item.nome_fantasia || item.nome;
            //optionElement.textContent = item.nome_fantasia || item.nome || item.label;
            optionElement.textContent = item.nome_fantasia || item.nome || item.nome_completo || item.label;
            optionElement.dataset.value = item.id;
            
            optionElement.addEventListener('mousedown', (e) => {
                e.preventDefault();
                searchInput.value = optionElement.textContent;
                hiddenInput.value = item.id;
                optionsContainer.classList.remove('is-visible');
                if (onSelectCallback) onSelectCallback(item.id);
            });
            optionsContainer.appendChild(optionElement);
        });
    };

    searchInput.addEventListener('focus', () => {
        renderOptions();
        optionsContainer.classList.add('is-visible');
    });

    searchInput.addEventListener('input', () => {
        hiddenInput.value = '';
        if (onSelectCallback) onSelectCallback(null);
        renderOptions(searchInput.value);
        optionsContainer.classList.add('is-visible');
    });
    
    document.addEventListener('click', (e) => {
        const container = searchInput.closest('.searchable-select-container');
        if (container && !container.contains(e.target)) {
            optionsContainer.classList.remove('is-visible');
        }
    });

    const clear = () => {
        searchInput.value = '';
        hiddenInput.value = '';
        if (onSelectCallback) onSelectCallback(null);
    };

    return { clear };
}

export function setupPWAInstallHandlers() {
    let deferredPrompt;
    const installButton = document.getElementById('install-app-btn');
    if (!installButton) return;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installButton.style.display = 'block';

        installButton.addEventListener('click', async () => {
            installButton.style.display = 'none';
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
        });
    });

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isInStandaloneMode = ('standalone' in window.navigator) && (window.navigator.standalone);
    const iosBanner = document.getElementById('ios-install-banner');
    const closeIOSBannerBtn = document.getElementById('ios-install-close-btn');

    if (isIOS && !isInStandaloneMode && iosBanner) {
        iosBanner.style.display = 'block';
    }
    if(closeIOSBannerBtn){
        closeIOSBannerBtn.addEventListener('click', () => {
            if (iosBanner) iosBanner.style.display = 'none';
        });
    }
}

export function openInstructionsModal() {
    const modal = document.getElementById('instructions-modal');
    if (modal) modal.style.display = 'flex';
}

export function closeInstructionsModal() {
    const modal = document.getElementById('instructions-modal');
    if (modal) modal.style.display = 'none';
}

export function openNotificationsModal() {
    const modal = document.getElementById('notifications-modal');
    if (modal) modal.style.display = 'flex';
}

export function closeNotificationsModal() {
    const modal = document.getElementById('notifications-modal');
    if (modal) modal.style.display = 'none';
}