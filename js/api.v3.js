// js/api.js (Versão Final e Corrigida)

import { supabaseClient } from './supabaseClient.js';
import { SUPABASE_URL } from './config.js';

export async function verificarStatusAcesso() {
    const { data, error } = await supabaseClient.rpc('verificar_status_acesso');
    if (error) {
        console.error("Erro ao verificar status de acesso:", error);
        return false; // Bloqueia o acesso em caso de erro
    }
    return data;
}

export async function fetchAllCompaniesForSuperAdmin() {
    const { data, error } = await supabaseClient.rpc('get_all_companies_for_super_admin');
    if (error) {
        console.error("Erro ao buscar dados de Super Admin:", error);
        throw error;
    }
    return data || [];
}

export async function fetchInitialData(empresaId, userId, hasAdminPermissions, isClientRole) {
    if (!empresaId) throw new Error("ID da empresa é necessário");

    // 1. Busca todos os dados (Lógica mantida)
    const [
        tasksResult, condosResult, typesResult, templatesResult,
        usersResult, cargosResult, groupsResult, allGroupAssignmentsResult,
        unreadNotificationsResult, empresaResult,
        allCondoAssignmentsResult
    ] = await Promise.all([
        Promise.resolve({ data: [] }), // Tarefas não são mais carregadas aqui
        supabaseClient.from('condominios').select('*').eq('empresa_id', empresaId).order('nome_fantasia', { ascending: true }), //
        supabaseClient.from('tipos_tarefa').select('*').eq('empresa_id', empresaId).order('nome_tipo', { ascending: true }), //
        supabaseClient.from('modelos_tarefa').select('*').eq('empresa_id', empresaId), //
        supabaseClient.from('usuarios').select('*, cargo: cargo_id(nome_cargo, is_admin, tem_permissoes_admin, is_client_role)').eq('empresa_id', empresaId).order('nome_completo', { ascending: true }), //
        supabaseClient.from('cargos').select('*').eq('empresa_id', empresaId), //
        supabaseClient.from('grupos').select('*').eq('empresa_id', empresaId), //
        supabaseClient.from('usuario_grupo').select('usuario_id, grupo_id'), //
        supabaseClient.from('notificacoes').select('id', { count: 'exact' }).eq('user_id', userId).eq('lida', false), //
        supabaseClient.from('empresas').select('segmento_id, plano:plano_id ( nome, limite_usuarios )').eq('id', empresaId).single(), //
        supabaseClient.from('usuario_condominio').select('usuario_id, condominio_id') //
    ]);

    // --- INÍCIO DA CORREÇÃO (LÓGICA DA TERMINOLOGIA) ---

    // 2. Lógica da Terminologia (RE-ADICIONADA)
    let terminologia = {};
    if (empresaResult.data && empresaResult.data.segmento_id) {
        // Busca os termos (ex: "entidade_principal" -> "Loja")
        const { data: termos } = await supabaseClient
            .from('terminologia_segmento')
            .select('chave, valor')
            .eq('segmento_id', empresaResult.data.segmento_id);
            
        if (termos) {
            termos.forEach(termo => {
                terminologia[termo.chave] = termo.valor;
            });
        }
    }
    // --- FIM DA CORREÇÃO ---
    
    // 3. Verificações de erro e perfil (mantidas)
    const allUsers = usersResult.data || [];
    const currentUserProfile = allUsers.find(u => u.id === userId);
    if (!currentUserProfile) return { error: 'NO_PROFILE' };
    
    const error = tasksResult.error || condosResult.error || /* ... etc ... */ allCondoAssignmentsResult.error;
    if (error) throw new Error("Falha ao carregar dados do sistema: " + error.message);
    
    const allCompanyCondos = condosResult.data || [];
    const allCompanyTasks = tasksResult.data || [];
    const allGroupAssignments = allGroupAssignmentsResult.data || [];
    const allCondoAssignments = allCondoAssignmentsResult.data || [];
    
    const companyUserIds = new Set(allUsers.map(u => u.id));
    const finalGroupAssignments = allGroupAssignments.filter(a => companyUserIds.has(a.usuario_id));

    // 4. Lógica de Filtragem (mantida)
    let finalCondos = [];
    let finalTasks = [];

    if (hasAdminPermissions) {
        finalTasks = allCompanyTasks;
        finalCondos = allCompanyCondos;
    } else if (isClientRole) {
        const condoIdsDoCliente = allCondoAssignments
            .filter(a => a.usuario_id === userId)
            .map(a => a.condominio_id);
        
        finalCondos = allCompanyCondos.filter(c => condoIdsDoCliente.includes(c.id));
        finalTasks = allCompanyTasks.filter(t => condoIdsDoCliente.includes(t.condominio_id));
    } else {
        finalTasks = allCompanyTasks.filter(t => t.criador_id === userId || t.responsavel_id === userId);
        const grupoIdsDoUsuario = finalGroupAssignments
            .filter(a => a.usuario_id === userId)
            .map(a => a.grupo_id);
        finalCondos = allCompanyCondos.filter(c => c.grupo_id === null || grupoIdsDoUsuario.includes(c.grupo_id));
    }

    // 5. Retorno dos dados (agora incluindo 'terminologia')
    return {
        tasks: finalTasks,
        condominios: finalCondos,
        taskTypes: typesResult.data || [],
        taskTemplates: templatesResult.data || [],
        allUsers: allUsers,
        allCargos: cargosResult.data || [],
        allGroups: groupsResult.data || [],
        userGroupAssignments: finalGroupAssignments,
        allCondoAssignments: allCondoAssignments,
        unreadCount: unreadNotificationsResult.count,
        currentUserProfile,
        terminologia: terminologia, // <<<--- DADO CORRIGIDO
        plano: empresaResult.data?.plano
    };
}

export async function createUser(userData) {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    
    if (!accessToken) {
        throw new Error("Sessão inválida. Faça login novamente.");
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${accessToken}` 
        },
        body: JSON.stringify(userData)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao criar usuário');
    }

    return await response.json();
}

export async function activateUser(userId) {
    const { error } = await supabaseClient.from('usuarios').update({ ativo: true }).eq('id', userId);
    if (error) throw error;
}

export async function updateUserInDB(userId, updatedUserData) {
    const { error } = await supabaseClient.from('usuarios').update(updatedUserData).eq('id', userId);
    if (error) throw error;
}

export async function toggleUserStatusInDB(userId, currentStatus) {
    const { error } = await supabaseClient.from('usuarios').update({ ativo: !currentStatus }).eq('id', userId);
    if (error) throw error;
}



export async function createTaskInDB(newTaskData) {
   
    const { data, error } = await supabaseClient
        .from('tarefas') //
        .insert(newTaskData) //
        .select() // Pede ao Supabase para retornar o que foi inserido
        .single(); // Esperamos apenas um objeto de tarefa

    if (error) throw error; //
    return data; // Retorna a nova tarefa (ex: {id: 123, titulo: '...', ...})
    // --- FIM DA ALTERAÇÃO ---
}

export async function updateTaskInDB(taskId, updatedTaskData) {
    // Retorna o objeto { data, error } inteiro em vez de apenas jogar o erro
    return await supabaseClient
        .from('tarefas')
        .update(updatedTaskData)
        .eq('id', taskId);
}

export async function toggleStatusInDB(taskId, currentStatus) {
    const newStatus = currentStatus === 'pending' ? 'completed' : 'pending';

    // Objeto que será enviado para o banco de dados
    let updateData = {
        status: newStatus
    };

    // ========================================================================
    // LÓGICA CORRIGIDA
    // ========================================================================
    if (newStatus === 'completed') {
        // Se estiver completando a tarefa, define a data de conclusão para AGORA.
        updateData.data_conclusao = new Date().toISOString();
    } else {
        // Se estiver reabrindo a tarefa, limpa a data de conclusão.
        updateData.data_conclusao = null;
    }
    // ========================================================================

    const { error } = await supabaseClient
        .from('tarefas')
        .update(updateData) // Usa o novo objeto com a data incluída
        .eq('id', taskId);

    if (error) throw error;
    return true;
}

export async function deleteTaskInDB(taskId) {
    const { error } = await supabaseClient.from('tarefas').update({ status: 'deleted' }).eq('id', taskId);
    if (error) throw error;
}
export async function createTemplateInDB(newTemplateData) {
    const { error } = await supabaseClient.from('modelos_tarefa').insert(newTemplateData);
    if (error) throw error;
}

// --- FUNÇÕES DE CONDOMÍNIOS ---
export async function createCondoInDB(newCondoData) {
    const { error } = await supabaseClient.from('condominios').insert(newCondoData);
    if (error) throw error;
}

export async function createCondoInDBAndReturn(newCondoData) {
    const { data, error } = await supabaseClient
        .from('condominios')
        .insert(newCondoData)
        .select() // <-- Pede ao Supabase para retornar os dados inseridos
        .single(); // <-- Pega apenas o objeto único que foi criado

    // Retorna um objeto contendo os dados OU o erro
    return { data, error }; 
}

export async function updateCondoInDB(condoId, updatedCondoData) {
    // const { error } = await supabaseClient.from('condominios').update(updatedCondoData).eq('id', condoId);
    // if (error) throw error;

    // --- INÍCIO DA ALTERAÇÃO ---
    const { data, error } = await supabaseClient
        .from('condominios') //
        .update(updatedCondoData) //
        .eq('id', condoId) //
        .select() // Pede para retornar o objeto atualizado
        .single(); // Esperamos apenas um

    if (error) throw error; //
    return data; // Retorna o objeto atualizado
    // --- FIM DA ALTERAÇÃO ---
}

export async function deleteCondoInDB(condoId) {
    const { error } = await supabaseClient.from('condominios').delete().eq('id', condoId);
    if (error) throw error;
}
export async function bulkInsertCondos(condosToInsert) {
    const { error } = await supabaseClient.from('condominios').insert(condosToInsert);
    if (error) throw error;
}

export async function createTaskTypeInDB(newTaskTypeData) {
  
    // --- INÍCIO DA ALTERAÇÃO ---
    const { data, error } = await supabaseClient
        .from('tipos_tarefa') //
        .insert(newTaskTypeData) //
        .select() // Pede para retornar o objeto criado
        .single(); // Esperamos apenas um

    if (error) throw error; //
    return data; // Retorna o novo tipo de tarefa
    // --- FIM DA ALTERAÇÃO ---
}

export async function updateTaskTypeInDB(typeId, updatedTaskTypeData) {

    // --- INÍCIO DA ALTERAÇÃO ---
    const { data, error } = await supabaseClient
        .from('tipos_tarefa') //
        .update(updatedTaskTypeData) //
        .eq('id', typeId) //
        .select() // Pede para retornar o objeto atualizado
        .single(); // Esperamos apenas um

    if (error) throw error; //
    return data; // Retorna o tipo de tarefa atualizado
    // --- FIM DA ALTERAÇÃO ---
}

export async function deleteTaskTypeInDB(typeId) {
    const { error } = await supabaseClient.from('tipos_tarefa').delete().eq('id', typeId);
    if (error) throw error;
}

// --- FUNÇÕES DE CARGOS ---
export async function fetchRoles() {
    const { data, error } = await supabaseClient.from('cargos').select('*');
    if (error) throw error;
    return data || [];
}

export async function createCargoInDB(newCargoData) {
    // --- INÍCIO DA ALTERAÇÃO ---
    const { data, error } = await supabaseClient
        .from('cargos') //
        .insert(newCargoData) //
        .select() // Pede para retornar o objeto criado
        .single(); // Esperamos apenas um

    if (error) throw error; //
    return data; // Retorna o novo cargo
    // --- FIM DA ALTERAÇÃO ---
}

export async function updateCargoInDB(cargoId, updatedCargoData) {
    // --- INÍCIO DA ALTERAÇÃO ---
    const { data, error } = await supabaseClient
        .from('cargos') //
        .update(updatedCargoData) //
        .eq('id', cargoId) //
        .select() // Pede para retornar o objeto atualizado
        .single(); // Esperamos apenas um

    if (error) throw error; //
    return data; // Retorna o cargo atualizado
    // --- FIM DA ALTERAÇÃO ---
}

export async function deleteCargoInDB(cargoId) {
    const { error } = await supabaseClient.from('cargos').delete().eq('id', cargoId);
    if (error) throw error;
}

// --- FUNÇÕES DE GRUPOS ---
export async function fetchGroups() {
    const { data, error } = await supabaseClient.from('grupos').select('*');
    if (error) throw error;
    return data || [];
}

export async function createGroupInDB(newGroupData) {
    // --- INÍCIO DA ALTERAÇÃO ---
    const { data, error } = await supabaseClient
        .from('grupos') //
        .insert(newGroupData) //
        .select() // Pede para retornar o objeto criado
        .single(); // Esperamos apenas um
    
    if (error) throw error; //
    return data; // Retorna o novo grupo
    // --- FIM DA ALTERAÇÃO ---
}

export async function updateGroupInDB(groupId, updatedGroupData) {
    // --- INÍCIO DA ALTERAÇÃO ---
    const { data, error } = await supabaseClient
        .from('grupos') //
        .update(updatedGroupData) //
        .eq('id', groupId) //
        .select() // Pede para retornar o objeto atualizado
        .single(); // Esperamos apenas um

    if (error) throw error; //
    return data; // Retorna o grupo atualizado
    // --- FIM DA ALTERAÇÃO ---
}

export async function deleteGroupInDB(groupId) {
    const { error } = await supabaseClient.from('grupos').delete().eq('id', groupId);
    if (error) throw error;
}

export async function requestPasswordReset(email) {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/set-password.html`,
    });
    if (error) throw error;
}

export async function fetchTaskHistory(taskId) {
    const { data, error } = await supabaseClient
        .from('tarefa_historico')
        // CORREÇÃO: Removemos o join 'usuario:usuario_id(nome_completo)'
        .select('*') 
        .eq('tarefa_id', taskId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

export async function fetchHistoryForTasks(taskIds) {
    const { data, error } = await supabaseClient.rpc('get_history_for_tasks', { task_ids: taskIds });
    if (error) throw error;
    return data || [];
}

export async function fetchUserGroupAssignments(userId) {
    const { data, error } = await supabaseClient
        .from('usuario_grupo')
        .select('grupo_id')
        .eq('usuario_id', userId);
    if (error) throw error;
    return data.map(item => item.grupo_id);
}

export async function updateUserGroupAssignments(userId, groupIds) {
    // Primeiro, remove todas as associações antigas
    const { error: deleteError } = await supabaseClient
        .from('usuario_grupo')
        .delete()
        .eq('usuario_id', userId);
    if (deleteError) throw deleteError;

    // Se houver novos grupos para associar, insere-os
    if (groupIds && groupIds.length > 0) {
        const newAssignments = groupIds.map(groupId => ({
            usuario_id: userId,
            grupo_id: groupId
        }));
        const { error: insertError } = await supabaseClient
            .from('usuario_grupo')
            .insert(newAssignments);
        if (insertError) throw insertError;
    }
}

export async function fetchUserCondominioAssignments(userId) {
    const { data, error } = await supabaseClient
        .from('usuario_condominio')
        .select('condominio_id')
        .eq('usuario_id', userId);
    if (error) throw error;
    return data.map(item => item.condominio_id);
}

export async function updateUserCondominioAssignments(userId, condominioIds) {
    // 1. Remove todas as associações antigas
    const { error: deleteError } = await supabaseClient
        .from('usuario_condominio')
        .delete()
        .eq('usuario_id', userId);
    if (deleteError) throw deleteError;

    // 2. Se houver novos condomínios para associar, insere-os
    if (condominioIds && condominioIds.length > 0) {
        const newAssignments = condominioIds.map(condoId => ({
            usuario_id: userId,
            condominio_id: condoId
        }));
        const { error: insertError } = await supabaseClient
            .from('usuario_condominio')
            .insert(newAssignments);
        if (insertError) throw insertError;
    }
}

export async function fetchAllUserGroupAssignments() {
    const { data, error } = await supabaseClient
        .from('usuario_grupo')
        .select('usuario_id, grupo_id');
    if (error) throw error;
    return data || [];
}

export async function fetchAllUsersForAssignment() {
    const { data, error } = await supabaseClient.rpc('get_usuarios_da_empresa');
    
    if (error) {
        console.error("Erro ao buscar usuários para designação:", error);
        throw error;
    }
    
    return data || [];
}

export async function markNotificationAsRead(notificationIds) {
    // CORREÇÃO: Usamos o filtro .in() para múltiplos IDs, em vez de .eq()
    const { error } = await supabaseClient
        .from('notificacoes')
        .update({ lida: true })
        .in('id', notificationIds); // <--- A MUDANÇA ESTÁ AQUI
    
    if (error) {
        console.error("Erro ao marcar notificação como lida:", error);
    }
}

export async function fetchTaskById(taskId) {
    const { data, error } = await supabaseClient
        .from('tarefas_detalhadas') // Usando a view que já tem os nomes do criador/responsável
        .select('*')
        .eq('id', taskId)
        .single(); // .single() para buscar apenas um registro

    if (error) {
        console.error(`Erro ao buscar a tarefa ${taskId}:`, error);
        throw error;
    }
    return data;
}

export async function updateCompanyBySuperAdmin(empresaId, dadosAtualizados) {
    const { error } = await supabaseClient.rpc('update_company_by_super_admin', {
        target_empresa_id: empresaId,
        novo_nome_empresa: dadosAtualizados.nome_empresa,
        novo_cnpj: dadosAtualizados.cnpj,
        novo_status_assinatura: dadosAtualizados.status_assinatura,
        novo_plano_id: dadosAtualizados.plano_id,
        novo_logo_url: dadosAtualizados.logo_url // <<<--- ADICIONADO
    });

    if (error) {
        console.error("Erro ao atualizar empresa:", error);
        throw error;
    }
}

export async function fetchAllPlans() {
    const { data, error } = await supabaseClient.rpc('get_all_plans');
    if (error) {
        console.error("Erro ao buscar planos:", error);
        throw error;
    }
    return data || [];
}

// --- INÍCIO DA NOVA FUNÇÃO DE BUSCA ---

export async function searchTasks(filters, profile) {
    if (!profile || !profile.empresa_id) {
        throw new Error("Perfil ou ID da empresa ausente para a busca.");
    }

    const hasAdmin = profile.cargo?.is_admin === true || profile.cargo?.tem_permissoes_admin === true;
    const isClient = profile.cargo?.is_client_role === true;

    const { data, error } = await supabaseClient.rpc('search_tasks', {
        p_empresa_id: profile.empresa_id,
        p_user_id: profile.id,
        p_has_admin: hasAdmin,
        p_is_client: isClient,
        p_search_term: filters.searchTerm || null,
        p_status: filters.status || null,
        p_assignee_id: filters.assigneeId || null,
        p_condominio_id: filters.condominioId ? parseInt(filters.condominioId, 10) : null,
        p_task_type_id: filters.taskTypeId ? parseInt(filters.taskTypeId, 10) : null,
        p_group_id: filters.groupId ? parseInt(filters.groupId, 10) : null,
        p_date_start: filters.dateStart || null,
        p_date_end: filters.dateEnd || null
    });

    if (error) {
        console.error("Erro ao executar a busca de tarefas:", error);
        throw error;
    }
    
    return data || [];
}

export async function fetchDashboardKPIs(filterUserId = null, dateStart = null, dateEnd = null) {
    // Chama a RPC passando os parâmetros
    const { data, error } = await supabaseClient.rpc('get_dashboard_kpis', {
        p_filter_user_id: filterUserId || null,
        p_date_start: dateStart || null,
        p_date_end: dateEnd || null
    });

    if (error) {
        console.error("Erro ao carregar KPIs:", error);
        return { in_progress: 0, overdue: 0, completed: 0, by_condo: {}, by_assignee_overdue: {} };
    }
    return data;
}