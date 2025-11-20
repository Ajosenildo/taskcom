export const state = {
    displayLimit: 20,
    tasks: [], 
    taskTemplates: [], 
    condominios: [], 
    taskTypes: [],
    allUsers: [], 
    currentUserProfile: null, 
    allCargos: [], 
    allGroups: [], 
    userGroupAssignments: [],
    activeFilters: {
        searchTerm: '',
        condominioId: '', 
        status: 'in_progress',
        dateStart: '', 
        dateEnd: '', 
        assigneeId: '',
        taskTypeId: '', 
        groupId: ''
    },
    chartInstances: { 
        status: null, 
        condo: null, 
        assignee: null 
    },
    tasksToDisplayForPdf: [],
    STATUSES: {
    pending: { key: 'pending', text: 'Pendente', icon: '⚪', color: '#9ca3af' }, // <-- ADICIONE ESTA LINHA
    completed: { key: 'completed', text: 'Concluída', icon: '✔️', color: '#10b981' },
    in_progress: { key: 'in_progress', text: 'Em Andamento', icon: '🔵', color: '#3b82f6' }, // Nota: 'Em Andamento' é o status visual, 'Pendente' é o status técnico.
    overdue: { key: 'overdue', text: 'Atrasada', icon: '🟠', color: '#f59e0b' },
    deleted: { key: 'deleted', text: 'Excluída', icon: '❌', color: '#ef4444' }
    },
    unreadNotifications: 0, 
    audioUnlocked: false,
    lastNotifiedCount: 0,
    terminologia: {} // <-- Importante adicionar para nossa nova funcionalidade
};