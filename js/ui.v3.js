export function aplicarTerminologia(terminologia) {
    // Se não houver terminologia ou a chave principal, não faz nada
    if (!terminologia || !terminologia.entidade_principal) {
        console.warn("Terminologia não carregada. Usando textos padrão.");
        return;
    }

    const termoSingular = terminologia.entidade_principal; // Ex: 'Loja'
    
    // Lógica simples para plural (funciona para a maioria dos nossos casos: Loja -> Lojas)
    const termoPlural = termoSingular.endsWith('o') ? termoSingular.slice(0,-1) + 'os' : termoSingular + 's';

    // Substitui o texto de elementos marcados com data-term-singular
    document.querySelectorAll('[data-term-singular="entidade_principal"]').forEach(el => {
        el.textContent = termoSingular;
    });

    // Substitui o texto de elementos marcados com data-term-plural
    document.querySelectorAll('[data-term-plural="entidade_principal"]').forEach(el => {
        el.textContent = termoPlural;
    });

    // Substitui o placeholder de inputs marcados
    document.querySelectorAll('[data-term-placeholder]').forEach(el => {
        const template = el.dataset.termPlaceholder;
        switch (template) {
            case 'select_one':
                el.placeholder = `Selecione ou busque um(a) ${termoSingular}...`;
                break;
            case 'filter_by':
                el.placeholder = `Filtrar por ${termoSingular}...`;
                break;
        }
    });
}

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

/* export function setupRoleBasedUI(currentUserProfile) {
    // Seleciona os elementos
    const adminFeatures = document.querySelectorAll('.admin-feature');
    const superAdminFeatures = document.querySelectorAll('.super-admin-feature');
    const condominioImportExport = document.querySelector('#admin-condos-view .header-actions.condominio-feature'); // Seleciona especificamente

    // Esconde TUDO primeiro para garantir um estado limpo
    adminFeatures.forEach(el => el.style.display = 'none');
    superAdminFeatures.forEach(el => el.style.display = 'none');
    if (condominioImportExport) condominioImportExport.style.display = 'none'; 

    // Verifica permissões
    const isSuperAdmin = currentUserProfile?.app_metadata?.is_super_admin === true;
    let hasCompanyAdminPermissions = false;
    if (currentUserProfile && currentUserProfile.cargo) {
        hasCompanyAdminPermissions = (currentUserProfile.cargo.is_admin === true || 
                                      currentUserProfile.cargo.tem_permissoes_admin === true);
    }
    const isAdmin = isSuperAdmin || hasCompanyAdminPermissions; // Flag geral de admin

    // Mostra recursos de Super Admin (se aplicável)
    if (isSuperAdmin) {
        superAdminFeatures.forEach(el => {
            el.style.display = el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'SPAN' ? 'inline-block' : 'flex';
        });
    }

    // Mostra recursos de Admin de Empresa (se aplicável)
    if (isAdmin) { // Qualquer tipo de admin
        adminFeatures.forEach(el => {
            el.style.display = el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'SPAN' ? 'inline-block' : 'flex';
        });

        // Lógica específica para os botões de Importar/Exportar
        const segmentoId = currentUserProfile?.empresa?.segmento_id;
        console.log("[setupRoleBasedUI] Verificando Segmento ID para Import/Export:", segmentoId); 

        if (segmentoId === 1 && condominioImportExport) { // Se for Admin E Segmento Condomínio
            condominioImportExport.style.display = 'flex'; // Mostra os botões
        }
    } 
    // Se não for admin, ou se for admin mas não for segmento 1, os botões de Import/Export permanecem escondidos.
    // O botão '+ Novo' (que não tem a classe .condominio-feature) será mostrado pela regra .admin-feature se o usuário for admin.
}*/

export function setupRoleBasedUI(currentUserProfile) {
    // 1. Seleciona todos os elementos de permissão
    const adminFeatures = document.querySelectorAll('.admin-feature');
    const superAdminFeatures = document.querySelectorAll('.super-admin-feature');

    // 2. Define permissões com base no perfil
    let hasCompanyAdminPermissions = false;
    if (currentUserProfile && currentUserProfile.cargo) {
        hasCompanyAdminPermissions = (currentUserProfile.cargo.is_admin === true || 
                                      currentUserProfile.cargo.tem_permissoes_admin === true);
    }
    
    // ATENÇÃO: A permissão de Super Admin vem do METADATA, não do perfil
    // Precisamos buscar a sessão de novo ou (idealmente) passá-la para esta função.
    // Vamos ajustar a chamada em app.v3.js (Passo 3)

    // Por enquanto, vamos assumir que o app.v3.js nos passará o perfil completo,
    // incluindo a permissão de super admin que precisamos adicionar lá.
    // Esta é a lógica correta, mas ela depende de uma pequena alteração no app.v3.js
    
    const isSuperAdmin = currentUserProfile?.is_super_admin === true; // Vamos garantir que app.v3.js adicione isso

    // 3. Lógica de exibição
    
    // Esconde tudo primeiro
    adminFeatures.forEach(el => el.style.display = 'none');
    superAdminFeatures.forEach(el => el.style.display = 'none');

    // Função auxiliar para aplicar o estilo correto
    const setDisplay = (el) => {
        if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'SPAN') {
           el.style.display = 'inline-block';
        } else {
           el.style.display = 'flex'; // Para DIVs e outros containers
        }
    };

    if (isSuperAdmin) {
        // Super Admin vê TUDO: seus recursos E os recursos de admin da empresa
        superAdminFeatures.forEach(setDisplay);
        adminFeatures.forEach(setDisplay);
    } else if (hasCompanyAdminPermissions) {
        // Admin da Empresa vê apenas os recursos de admin da empresa
        adminFeatures.forEach(setDisplay);
    }
    // Se não for nenhum dos dois, tudo permanece 'none'
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

export function openCreateUserModal(cargos, condominios, allCargosData) {
    const modal = document.getElementById('create-user-modal');
    const form = document.getElementById('create-user-form');
    if (!modal || !form) return;

    form.reset();

    const roleSelect = document.getElementById('create-user-role');
    if (!roleSelect) return;

    // Popula Cargos (lógica mantida)
    roleSelect.innerHTML = '<option value="">Selecione um cargo...</option>';
    cargos.forEach(cargo => {
        if (!cargo.is_admin) {
            const option = document.createElement('option');
            option.value = cargo.id;
            option.textContent = cargo.nome_cargo;
            roleSelect.appendChild(option);
        }
    });

    // --- INÍCIO DA ALTERAÇÃO (Lógica de Checkbox) ---
    const condominioContainer = document.getElementById('create-condominio-associado-container');
    const condominioListDiv = document.getElementById('create-user-condominios-list');

    // Popula a LISTA DE CHECKBOX de condomínios
    condominioListDiv.innerHTML = '';
    if (condominios && condominios.length > 0) {
        condominios.forEach(condo => {
            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'checkbox-container';
            checkboxContainer.innerHTML = `
                <input type="checkbox" id="create-condo-${condo.id}" name="condominios_create" value="${condo.id}">
                <label for="create-condo-${condo.id}">${condo.nome_fantasia || condo.nome}</label>
            `;
            condominioListDiv.appendChild(checkboxContainer);
        });
    } else {
        condominioListDiv.innerHTML = '<p><small>Nenhum condomínio cadastrado.</small></p>';
    }

    // Esconde o container por padrão
    condominioContainer.style.display = 'none';

    // Listener de mudança de cargo (lógica mantida)
    roleSelect.onchange = (e) => {
        const selectedCargoId = e.target.value;
        const cargo = allCargosData.find(c => c.id == selectedCargoId);
        
        if (cargo && cargo.is_client_role) {
            condominioContainer.style.display = 'block'; // Mostra
        } else {
            condominioContainer.style.display = 'none'; // Esconde
            // Limpa todos os checkboxes
            form.querySelectorAll('input[name="condominios_create"]:checked').forEach(cb => cb.checked = false);
        }
    };
    // --- FIM DA ALTERAÇÃO ---

    modal.style.display = 'flex';
}

export function closeCreateUserModal() {
    const modal = document.getElementById('create-user-modal');
    if (modal) modal.style.display = 'none';
    const form = document.getElementById('create-user-form');
    if (form) form.reset();
}

export function openEditUserModal(user, cargos, todosOsGrupos, gruposDoUsuario, condominios, allCargosData, condominiosDoUsuario) {
    const modal = document.getElementById('edit-user-modal');
    if (!modal || !user) return;

    // Preenche campos básicos (lógica mantida)
    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('edit-user-name').value = user.nome_completo || '';
    document.getElementById('edit-user-email-display').value = user.email || '(email não disponível)';
    
    // Popula Cargos (lógica mantida)
    const roleSelect = document.getElementById('edit-user-role');
    // ... (mesma lógica de popular cargos de antes) ...
    roleSelect.innerHTML = '';
    if (cargos && cargos.length > 0) {
        cargos.forEach(cargo => {
            if (!cargo.is_admin) {
                const option = document.createElement('option');
                option.value = cargo.id;
                option.textContent = cargo.nome_cargo;
                roleSelect.appendChild(option);
            }
        });
    }
    roleSelect.value = user.cargo_id;

    // Popula Grupos (lógica mantida)
    const groupsListDiv = document.getElementById('edit-user-groups-list');
    // ... (mesma lógica de popular checkboxes de grupos de antes) ...
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

    // --- INÍCIO DA ALTERAÇÃO (Lógica de Checkbox) ---
    const condominioContainer = document.getElementById('edit-condominio-associado-container');
    const condominioListDiv = document.getElementById('edit-user-condominios-list');

    // Popula a LISTA DE CHECKBOX de condomínios
    condominioListDiv.innerHTML = '';
    if (condominios && condominios.length > 0) {
        condominios.forEach(condo => {
            // Verifica se o condomínio atual deve estar pré-marcado
            const isChecked = condominiosDoUsuario.includes(condo.id);
            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'checkbox-container';
            checkboxContainer.innerHTML = `
                <input type="checkbox" id="edit-condo-${condo.id}" name="condominios_edit" value="${condo.id}" ${isChecked ? 'checked' : ''}>
                <label for="edit-condo-${condo.id}">${condo.nome_fantasia || condo.nome}</label>
            `;
            condominioListDiv.appendChild(checkboxContainer);
        });
    } else {
        condominioListDiv.innerHTML = '<p><small>Nenhum condomínio cadastrado.</small></p>';
    }

    // Verifica se o container deve estar visível AO ABRIR O MODAL
    const cargoAtual = allCargosData.find(c => c.id == user.cargo_id);
    if (cargoAtual && cargoAtual.is_client_role) {
        condominioContainer.style.display = 'block';
    } else {
        condominioContainer.style.display = 'none';
    }

    // Listener de mudança de cargo
    roleSelect.onchange = (e) => {
        const selectedCargoId = e.target.value;
        const cargo = allCargosData.find(c => c.id == selectedCargoId);
        
        if (cargo && cargo.is_client_role) {
            condominioContainer.style.display = 'block'; // Mostra
        } else {
            condominioContainer.style.display = 'none'; // Esconde
            // Limpa todos os checkboxes
            modal.querySelectorAll('input[name="condominios_edit"]:checked').forEach(cb => cb.checked = false);
        }
    };
    // --- FIM DA ALTERAÇÃO ---
    
    modal.style.display = 'flex';
}

export function closeEditUserModal() {
    const modal = document.getElementById('edit-user-modal');
    if (modal) modal.style.display = 'none';
}

export function openCreateCondoModal(allGroups, segmentoId) {
    const modal = document.getElementById('create-condo-modal');
    const form = document.getElementById('create-condo-form');
    if (!modal || !form) return;

    form.reset(); // Limpa os valores

    // Popula o select de grupos (código existente)
    const groupSelect = document.getElementById('create-condo-group');
    if (groupSelect) {
        groupSelect.innerHTML = '<option value="">Nenhum</option>';
        // Verifica se allGroups é um array antes de iterar
        if (Array.isArray(allGroups)) {
            console.log(`[openCreateCondoModal] Populando dropdown com ${allGroups.length} grupos...`); // DEBUG 3
            allGroups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.nome_grupo;
                groupSelect.appendChild(option);
            });
        } else {
            console.warn("[openCreateCondoModal] 'allGroups' não é um array ou está indefinido."); // DEBUG 4
        }
    } else {
        console.warn("[openCreateCondoModal] Elemento 'create-condo-group' não encontrado.");
    }

    // ========================================================================
    // LÓGICA REFINADA COM RESET VISUAL EXPLÍCITO
    // ========================================================================
    const nomeFantasiaInput = document.getElementById('create-condo-nome-fantasia');
    const cnpjInput = document.getElementById('create-condo-cnpj');
    const nomeFantasiaLabel = document.querySelector('label[for="create-condo-nome-fantasia"]');
    const cnpjLabel = document.querySelector('label[for="create-condo-cnpj"]');

    if (nomeFantasiaInput && nomeFantasiaLabel && cnpjInput && cnpjLabel) {
        // PASSO 1: FORÇA TODOS OS CAMPOS OPCIONAIS A FICAREM VISÍVEIS (RESET VISUAL)
        // Isso anula qualquer 'display: none' residual da última abertura.
        nomeFantasiaInput.style.display = 'block'; // Ou 'flex', use o que for o padrão
        nomeFantasiaLabel.style.display = 'block';
        cnpjInput.style.display = 'block';
        cnpjLabel.style.display = 'block';

        // PASSO 2: AGORA, APLICA A LÓGICA PARA ESCONDER SE NECESSÁRIO
        if (segmentoId && segmentoId !== 1) { // Se NÃO for Condomínio (ID 1)
            nomeFantasiaInput.style.display = 'none';
            nomeFantasiaLabel.style.display = 'none';
            cnpjInput.style.display = 'none';
            cnpjLabel.style.display = 'none';
        }
        // Se for Condomínio, eles já estão visíveis por causa do Passo 1.
    } else {
        console.error("Não foi possível encontrar todos os campos (Nome Fantasia/CNPJ) no modal de criação.");
    }
    // ========================================================================
    // FIM DA LÓGICA REFINADA
    // ========================================================================

    // Mostra o modal
    modal.style.display = 'flex';
    console.log("[openCreateCondoModal] Modal exibido."); // DEBUG 5
}

export function closeCreateCondoModal() {
    const modal = document.getElementById('create-condo-modal');
    if (modal) modal.style.display = 'none';
}

export function openEditCondoModal(condo, todosGrupos, segmentoId) { // <-- Recebe segmentoId
    const modal = document.getElementById('edit-condo-modal');
    if (!modal) return;

    // Preenche os campos básicos
    document.getElementById('edit-condo-id').value = condo.id;
    document.getElementById('edit-condo-nome').value = condo.nome || ''; // Garante que não seja undefined

    // Preenche o select de grupos
    const groupSelect = document.getElementById('edit-condo-group');
    groupSelect.innerHTML = '<option value="">Nenhum</option>'; 
    todosGrupos.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.nome_grupo;
        groupSelect.appendChild(option);
    });
    groupSelect.value = condo.grupo_id || "";

    // ========================================================================
    // INÍCIO DA LÓGICA MOVIDA PARA CÁ
    // ========================================================================
    const nomeFantasiaInput = document.getElementById('edit-condo-nome-fantasia');
    const cnpjInput = document.getElementById('edit-condo-cnpj');
    const nomeFantasiaLabel = document.querySelector('label[for="edit-condo-nome-fantasia"]');
    const cnpjLabel = document.querySelector('label[for="edit-condo-cnpj"]');

    if (segmentoId && segmentoId !== 1) { // Se NÃO for Condomínio
        // Esconde e LIMPA os campos irrelevantes
        if (nomeFantasiaInput) { nomeFantasiaInput.style.display = 'none'; nomeFantasiaInput.value = ''; }
        if (nomeFantasiaLabel) nomeFantasiaLabel.style.display = 'none';
        if (cnpjInput) { cnpjInput.style.display = 'none'; cnpjInput.value = ''; }
        if (cnpjLabel) cnpjLabel.style.display = 'none';
    } else { // Se FOR Condomínio (ou se não soubermos o segmento)
        // Mostra e PREENCHE os campos
        if (nomeFantasiaInput) { nomeFantasiaInput.style.display = 'block'; nomeFantasiaInput.value = condo.nome_fantasia || ''; }
        if (nomeFantasiaLabel) nomeFantasiaLabel.style.display = 'block';
        if (cnpjInput) { cnpjInput.style.display = 'block'; cnpjInput.value = condo.cnpj || ''; }
        if (cnpjLabel) cnpjLabel.style.display = 'block';
    }
    // ========================================================================
    // FIM DA LÓGICA MOVIDA
    // ========================================================================

    // Mostra o modal DEPOIS de configurar tudo
    modal.style.display = 'flex';

    // Dá ao navegador um pequeno tempo para renderizar antes de focar
    setTimeout(() => {
        document.getElementById('edit-condo-nome')?.focus(); 
    }, 10); // 10 milissegundos de atraso
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