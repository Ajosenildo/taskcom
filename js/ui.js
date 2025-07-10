// js/ui.js (Versão Final e Corrigida)

export function show(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('is-visible'));
    const screenToShow = document.getElementById(screenId);
    if (screenToShow) {
        screenToShow.classList.add('is-visible');
    }
}

export function showView(viewId) {
    document.querySelectorAll('#main-container .view').forEach(v => v.style.display = 'none');
    const viewToShow = document.getElementById(viewId);
    if (viewToShow) {
        viewToShow.style.display = 'flex';
    }
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const buttonId = `nav-${viewId.replace('-view', '')}`;
    const activeBtn = document.getElementById(buttonId);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    window.dispatchEvent(new CustomEvent('viewChanged', { detail: { viewId } }));
}

export function setupRoleBasedUI(currentUserProfile) {
    const adminFeatures = document.querySelectorAll('.admin-feature');
    
    // CORREÇÃO: Usamos 'block' ou 'flex' para exibir os elementos, 
    // e 'none' para escondê-los. É mais direto e garantido.
    if (currentUserProfile && currentUserProfile.cargo?.is_admin) {
        // Se for admin, mostra os botões/seções de admin
        adminFeatures.forEach(el => {
            el.style.display = 'flex'; // ou 'block', dependendo do elemento
        });
    } else {
        // Se não for admin, esconde
        adminFeatures.forEach(el => {
            el.style.display = 'none';
        });
    }
}

export function populateDropdowns(CONDOMINIOS, TASK_TYPES, allUsers, allGroups) {
    const filterGroupSelect = document.getElementById('filter-group');
    const createTaskAssigneeSelect = document.getElementById('task-assignee');
    const filterAssigneeSelect = document.getElementById('filter-assignee');
    const createTaskTypeSelect = document.getElementById('task-type');
    const editTaskTypeSelect = document.getElementById('edit-task-type');
    const filterTaskTypeSelect = document.getElementById('filter-task-type');
    const editTaskCondoSelect = document.getElementById('edit-task-condominio');
    const condoGroupSelect = document.getElementById('condo-group-select');

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
                s.appendChild(option.cloneNode(true));
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

    if (filterAssigneeSelect) {
        filterAssigneeSelect.innerHTML = '<option value="">Todos</option>';
        // CORREÇÃO: Removemos o 'if (user.cargo_id === 2)'
        // para que todos os usuários apareçam na lista de filtro.
        allUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.nome_completo;
            filterAssigneeSelect.appendChild(option);
        });
    }

    if (filterTaskTypeSelect) {
        filterTaskTypeSelect.innerHTML = '<option value="">Todos os Tipos</option>';
        TASK_TYPES.forEach(type => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = type.nome_tipo;
            filterTaskTypeSelect.appendChild(option);
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

    const assigneeElements = [createTaskAssigneeSelect, filterAssigneeSelect];
    assigneeElements.forEach(select => {
        if (select) {
            const currentUserId = JSON.parse(sessionStorage.getItem('userProfile'))?.id;
            select.innerHTML = (select.id === 'filter-assignee') 
                ? '<option value="">Todos</option>' 
                : '<option value="">Selecione um Responsável...</option>';
            
            allUsers.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.nome_completo;
                select.appendChild(option);
            });
            // No formulário de criação, o padrão é a tarefa ser para si mesmo
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
    if (!task || !modal) return;

    // A lógica de delegação (quem pode alterar o responsável) continua a mesma
    const canDelegate = (currentUserProfile && currentUserProfile.cargo_id === 1) || (currentUserProfile.id === task.criador_id);

    document.getElementById('edit-task-id').value = task.id;
    document.getElementById('edit-task-title').value = task.titulo;
    document.getElementById('edit-task-desc').value = task.descricao;
    document.getElementById('edit-task-due-date').value = task.data_conclusao_prevista;
    document.getElementById('edit-task-type').value = task.tipo_tarefa_id;
    document.getElementById('edit-task-condominio').value = task.condominio_id; // Este continua um select normal por enquanto
    document.getElementById('edit-task-condominio').disabled = true;

    const assigneeSelect = document.getElementById('edit-task-assignee');
    assigneeSelect.innerHTML = '';

    // CORREÇÃO: Removemos o filtro de 'cargo_id', agora todos os usuários aparecem na lista
    allUsers.forEach(u => {
        const option = document.createElement('option');
        option.value = u.id;
        option.textContent = u.nome_completo;
        assigneeSelect.appendChild(option);
    });

    assigneeSelect.value = task.responsavel_id;
    assigneeSelect.disabled = !canDelegate;

    modal.classList.add('is-visible');
}

export function closeEditModal() {
    document.getElementById('edit-task-modal').classList.remove('is-visible');
}

export function openCreateUserModal(cargos) {
    const roleSelect = document.getElementById('create-user-role');
    if (!roleSelect) return;
    roleSelect.innerHTML = '<option value="">Selecione um cargo...</option>';
    cargos.forEach(cargo => {
        const option = document.createElement('option');
        option.value = cargo.id;
        option.textContent = cargo.nome_cargo;
        roleSelect.appendChild(option);
    });
    document.getElementById('create-user-modal').classList.add('is-visible');
}

export function closeCreateUserModal() {
    const modal = document.getElementById('create-user-modal');
    if (modal) modal.classList.remove('is-visible');
    const form = document.getElementById('create-user-form');
    if (form) form.reset();
}

export function openEditUserModal(user, cargos, todosOsGrupos, gruposDoUsuario) {
    const modal = document.getElementById('edit-user-modal');
    if (!modal || !user) return;

    // Preenche os campos do formulário
    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('edit-user-name').value = user.nome_completo || '';
    document.getElementById('edit-user-email-display').value = user.email || '(email não disponível)';
    
    const roleSelect = document.getElementById('edit-user-role');
    roleSelect.innerHTML = '';
    
    // Preenche o dropdown de cargos
    if (cargos && cargos.length > 0) {
        cargos.forEach(cargo => {
            if (cargo.id !== 1) { // Não permite selecionar 'Administrador'
                const option = document.createElement('option');
                option.value = cargo.id;
                option.textContent = cargo.nome_cargo;
                roleSelect.appendChild(option);
            }
        });
    }
    roleSelect.value = user.cargo_id;

    // LÓGICA CORRIGIDA: Preenche os checkboxes de grupos
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
    
    // Mostra o modal
    modal.classList.add('is-visible');
}

export function closeEditUserModal() {
    document.getElementById('edit-user-modal').classList.remove('is-visible');
}

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
            (item.nome_fantasia || '').toLowerCase().includes(filter.toLowerCase()) || 
            (item.nome || '').toLowerCase().includes(filter.toLowerCase())
        ).slice(0, 5);

        if (filteredItems.length === 0 && filter) {
            optionsContainer.innerHTML = `<div class="option-item disabled">Nenhum resultado</div>`;
            return;
        }

        filteredItems.forEach(item => {
            const optionElement = document.createElement('div');
            optionElement.className = 'option-item';
            optionElement.textContent = item.nome_fantasia || item.nome;
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

export function setupInstallButton() {
    let deferredPrompt;
    const installButton = document.getElementById('install-app-btn');

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (installButton) {
            installButton.style.display = 'block'; // Mostra o botão
        }
    });

    if (installButton) {
        installButton.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            installButton.style.display = 'none';
            deferredPrompt.prompt(); // Mostra o prompt de instalação
            await deferredPrompt.userChoice;
            deferredPrompt = null;
        });
    }
}

export function setupPWAInstallHandlers() {
    let deferredPrompt;
    const installButton = document.getElementById('install-app-btn');
    if (!installButton) return;

    // Lógica para Chrome/Desktop
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

    // Lógica para o banner do iOS/Safari
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isInStandaloneMode = ('standalone' in window.navigator) && (window.navigator.standalone);
    const iosBanner = document.getElementById('ios-install-banner');
    const closeIOSBannerBtn = document.getElementById('ios-install-close-btn');

    if (isIOS && !isInStandaloneMode && iosBanner) {
        iosBanner.style.display = 'block';
    }
    if(closeIOSBannerBtn){
        closeIOSBannerBtn.addEventListener('click', () => {
            iosBanner.style.display = 'none';
        });
    }
}

export function openEditCondoModal(condo, todosGrupos) {
    const modal = document.getElementById('edit-condo-modal');
    if (!modal) return;

    // Preenche os dados básicos do condomínio
    document.getElementById('edit-condo-id').value = condo.id;
    document.getElementById('edit-condo-nome').value = condo.nome;
    document.getElementById('edit-condo-nome-fantasia').value = condo.nome_fantasia;
    document.getElementById('edit-condo-cnpj').value = condo.cnpj || '';

    // Lógica corrigida para popular o seletor de grupos
    const groupSelect = document.getElementById('edit-condo-group');
    groupSelect.innerHTML = '<option value="">Nenhum</option>'; // Opção para deixar sem grupo

    // O loop 'forEach' que estava faltando
    todosGrupos.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.nome_grupo;
        groupSelect.appendChild(option);
    });

    // Define o grupo atual do condomínio como o selecionado no dropdown
    groupSelect.value = condo.grupo_id || "";

    modal.classList.add('is-visible');
}

export function openCreateCondoModal(allGroups) {
    const modal = document.getElementById('create-condo-modal');
    if (!modal) return;

    const groupSelect = document.getElementById('create-condo-group');
    groupSelect.innerHTML = '<option value="">Nenhum</option>'; // Opção para não associar
    allGroups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.nome_grupo;
        groupSelect.appendChild(option);
    });
    
    modal.classList.add('is-visible');
}

export function closeCreateCondoModal() {
    document.getElementById('create-condo-modal').classList.remove('is-visible');
}
// NOVA FUNÇÃO GPT
export function closeEditCondoModal() {
  document.getElementById('edit-condo-modal')?.classList.remove('is-visible');
}