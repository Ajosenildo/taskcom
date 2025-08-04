// js/api.js (Versão Final e Corrigida)

import { supabaseClient } from './supabaseClient.js';
import { SUPABASE_URL } from './config.js';

// --- FUNÇÃO PRINCIPAL DE BUSCA DE DADOS ---
/* export async function fetchInitialData(empresaId) {
    if (!empresaId) {
        throw new Error("ID da empresa é necessário para buscar os dados.");
    }

    const [tasksResult, condosResult, typesResult, templatesResult, usersResult, cargosResult, groupsResult, allAssignmentsResult] = await Promise.all([
        supabaseClient.from('tarefas_detalhadas').select('*'),
        supabaseClient.from('condominios').select('*').eq('empresa_id', empresaId).order('nome_fantasia', { ascending: true }).order('nome', { ascending: true }),
        supabaseClient.from('tipos_tarefa').select('*').eq('empresa_id', empresaId).order('nome_tipo', { ascending: true }),
        supabaseClient.from('modelos_tarefa').select('*').eq('empresa_id', empresaId),
        supabaseClient.from('usuarios').select('*').eq('empresa_id', empresaId), 
        supabaseClient.from('cargos').select('*').eq('empresa_id', empresaId),
        supabaseClient.from('grupos').select('*').eq('empresa_id', empresaId),
        // A tabela de associação (usuario_grupo) não tem empresa_id, então buscamos todos
        // e filtramos na sequência.
        supabaseClient.from('usuario_grupo').select('usuario_id, grupo_id')
    ]);

    const error = tasksResult.error || condosResult.error || typesResult.error || templatesResult.error || usersResult.error || cargosResult.error || groupsResult.error || allAssignmentsResult.error;
    if (error) {
        console.error("Erro ao buscar dados filtrados:", error);
        throw new Error("Não foi possível carregar os dados do sistema.");
    }

    // Filtra as associações de grupo para pertencerem apenas aos usuários da empresa atual
    const usersInCompany = usersResult.data || [];
    const userIdsInCompany = new Set(usersInCompany.map(u => u.id));
    const filteredAssignments = (allAssignmentsResult.data || []).filter(a => userIdsInCompany.has(a.usuario_id));

    return {
        tasks: tasksResult.data || [],
        condominios: condosResult.data || [],
        taskTypes: typesResult.data || [],
        taskTemplates: templatesResult.data || [],
        allUsers: usersInCompany, // <--- Lista de usuários agora é segura
        allCargos: cargosResult.data || [],
        allGroups: groupsResult.data || [],
        userGroupAssignments: filteredAssignments // <--- Associações também são seguras
    };
} */

    export async function fetchInitialData(empresaId, userId, isAdmin) {
    if (!empresaId) throw new Error("ID da empresa é necessário");

    // Buscamos os dados brutos do banco de dados
    const [
        tasksResult, condosResult, typesResult, templatesResult,
        usersResult, cargosResult, groupsResult, 
        // ALTERAÇÃO 1: Buscamos TODAS as associações de usuário-grupo da empresa, e não apenas do usuário logado.
        // Para isso, faremos a busca através de uma RPC que já considera a empresa.
        allAssignmentsResult 
    ] = await Promise.all([
        supabaseClient.from('tarefas_detalhadas').select('*'),
        supabaseClient.from('condominios').select('*').eq('empresa_id', empresaId),
        supabaseClient.from('tipos_tarefa').select('*').eq('empresa_id', empresaId),
        supabaseClient.from('modelos_tarefa').select('*').eq('empresa_id', empresaId),
        supabaseClient.from('usuarios').select('*').eq('empresa_id', empresaId),
        supabaseClient.from('cargos').select('*').eq('empresa_id', empresaId),
        supabaseClient.from('grupos').select('*').eq('empresa_id', empresaId),
        // Esta é a chamada corrigida. Em vez de filtrar por 'userId', buscamos todas.
        supabaseClient.from('usuario_grupo').select('usuario_id, grupo_id')
    ]);

    // Verificamos se ocorreu algum erro na busca
    const error = tasksResult.error || condosResult.error || typesResult.error || templatesResult.error ||
        usersResult.error || cargosResult.error || groupsResult.error || allAssignmentsResult.error;

    if (error) {
        console.error("Erro ao buscar dados:", error);
        throw new Error("Falha ao carregar os dados do sistema.");
    }

    // Listas de dados brutos
    const allCompanyCondos = condosResult.data || [];
    const allCompanyTasks = tasksResult.data || [];
    const allAssignments = allAssignmentsResult.data || [];
    
    // Filtramos os usuários da empresa para ter certeza que estamos lidando apenas com eles
    const companyUserIds = new Set((usersResult.data || []).map(u => u.id));
    const finalAssignments = allAssignments.filter(a => companyUserIds.has(a.usuario_id));

    let finalCondos = [];
    let finalTasks = [];

    if (isAdmin) {
        // Se for admin, ele vê todos os condomínios e tarefas da empresa
        finalCondos = allCompanyCondos;
        finalTasks = allCompanyTasks;
    } else {
        // Se NÃO for admin, filtramos os dados
        
        // ALTERAÇÃO 2: Buscamos os IDs de grupo do usuário logado a partir da lista COMPLETA de associações.
        const grupoIdsDoUsuario = finalAssignments
            .filter(a => a.usuario_id === userId)
            .map(a => a.grupo_id);

        // Filtramos a lista de condomínios para incluir apenas aqueles dos grupos do usuário
        finalCondos = allCompanyCondos.filter(c => c.grupo_id && grupoIdsDoUsuario.includes(c.grupo_id));
        
        // Criamos uma lista com os IDs dos condomínios permitidos
        const allowedCondoIds = new Set(finalCondos.map(c => c.id));

        // Filtramos a lista de tarefas para incluir apenas tarefas dos condomínios permitidos
        finalTasks = allCompanyTasks.filter(t => allowedCondoIds.has(t.condominio_id));
    }

    // Retornamos os dados para a aplicação
    return {
        tasks: finalTasks,
        condominios: finalCondos,
        taskTypes: typesResult.data || [],
        taskTemplates: templatesResult.data || [],
        allUsers: usersResult.data || [],
        allCargos: cargosResult.data || [],
        allGroups: groupsResult.data || [],
        // Retornamos a lista COMPLETA de associações para ser usada na tela de Admin
        userGroupAssignments: finalAssignments,
    };
}



    /* export async function fetchInitialData(empresaId, userId, isAdmin) {
    if (!empresaId) throw new Error("ID da empresa é necessário");

    const [
        tasksResult, condosResult, typesResult, templatesResult,
        usersResult, cargosResult, groupsResult, allAssignmentsResult
    ] = await Promise.all([
        supabaseClient.from('tarefas_detalhadas').select('*'),
        supabaseClient.from('condominios').select('*').eq('empresa_id', empresaId),
        supabaseClient.from('tipos_tarefa').select('*').eq('empresa_id', empresaId),
        supabaseClient.from('modelos_tarefa').select('*').eq('empresa_id', empresaId),
        supabaseClient.from('usuarios').select('*').eq('empresa_id', empresaId),
        supabaseClient.from('cargos').select('*').eq('empresa_id', empresaId),
        supabaseClient.from('grupos').select('*').eq('empresa_id', empresaId),
        supabaseClient.from('usuario_grupo').select('usuario_id, grupo_id').eq('usuario_id', userId)
    ]);

    const error = tasksResult.error || condosResult.error || typesResult.error || templatesResult.error ||
        usersResult.error || cargosResult.error || groupsResult.error || allAssignmentsResult.error;

    if (error) {
        console.error("Erro ao buscar dados:", error);
        throw new Error("Falha ao carregar os dados do sistema.");
    }

    const grupoIdsDoUsuario = allAssignmentsResult.data.map(a => a.grupo_id);

    // 🔁 Filtra condomínios conforme a regra
    let condominios = [];
    if (isAdmin) {
        condominios = condosResult.data || [];
    } else {
        condominios = (condosResult.data || []).filter(c => grupoIdsDoUsuario.includes(c.grupo_id));
    }

    return {
        tasks: tasksResult.data || [],
        condominios,
        taskTypes: typesResult.data || [],
        taskTemplates: templatesResult.data || [],
        allUsers: usersResult.data || [],
        allCargos: cargosResult.data || [],
        allGroups: groupsResult.data || [],
        userGroupAssignments: allAssignmentsResult.data || [],
        grupo_ids: grupoIdsDoUsuario
    };
}*/


// --- FUNÇÕES DE USUÁRIOS ---
/* export async function createUser(userData) {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("Sessão de administrador inválida.");
    const response = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(userData)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Erro desconhecido na Edge Function.');
    return result;
}*/

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

// --- FUNÇÕES DE TAREFAS ---
export async function createTaskInDB(newTaskData) {
    const { error } = await supabaseClient.from('tarefas').insert(newTaskData);
    if (error) throw error;
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
    const { error } = await supabaseClient.from('tarefas').update({ status: newStatus }).eq('id', taskId);
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
export async function updateCondoInDB(condoId, updatedCondoData) {
    const { error } = await supabaseClient.from('condominios').update(updatedCondoData).eq('id', condoId);
    if (error) throw error;
}
export async function deleteCondoInDB(condoId) {
    const { error } = await supabaseClient.from('condominios').delete().eq('id', condoId);
    if (error) throw error;
}
export async function bulkInsertCondos(condosToInsert) {
    const { error } = await supabaseClient.from('condominios').insert(condosToInsert);
    if (error) throw error;
}

// --- FUNÇÕES DE TIPOS DE TAREFA ---
export async function createTaskTypeInDB(newTaskTypeData) {
    // A função já recebe a empresa_id do app.js
    const { error } = await supabaseClient.from('tipos_tarefa').insert(newTaskTypeData);
    if (error) throw error;
}
export async function updateTaskTypeInDB(typeId, updatedTaskTypeData) {
    const { error } = await supabaseClient.from('tipos_tarefa').update(updatedTaskTypeData).eq('id', typeId);
    if (error) throw error;
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
    // A função já recebe a empresa_id do app.js
    const { error } = await supabaseClient.from('cargos').insert(newCargoData);
    if (error) throw error;
}
export async function updateCargoInDB(cargoId, updatedCargoData) {
    const { error } = await supabaseClient.from('cargos').update(updatedCargoData).eq('id', cargoId);
    if (error) throw error;
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
    const { error } = await supabaseClient.from('grupos').insert(newGroupData);
    if (error) throw error;
}
export async function updateGroupInDB(groupId, updatedGroupData) {
    const { error } = await supabaseClient.from('grupos').update(updatedGroupData).eq('id', groupId);
    if (error) throw error;
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
        .select('*, usuario:usuario_id(nome_completo)')
        .eq('tarefa_id', taskId)
        .order('created_at', { ascending: false }); // Mostra os mais recentes primeiro
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

export async function markNotificationAsRead(notificationId) {
    const { error } = await supabaseClient
        .from('notificacoes')
        .update({ lida: true })
        .eq('id', notificationId);
    
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