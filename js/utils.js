import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Função auxiliar para calcular o status visual de uma tarefa, incluindo dias de atraso
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

// Função para criar ou atualizar os gráficos do dashboard
export function createOrUpdateChart(canvasId, type, data, chartInstances, instanceKey, options = {}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (chartInstances[instanceKey]) {
        chartInstances[instanceKey].data = data;
        chartInstances[instanceKey].options = options;
        chartInstances[instanceKey].update();
    } else {
        chartInstances[instanceKey] = new Chart(ctx, { type, data, options });
    }
}

// Função para exportar as tarefas para PDF
export async function exportTasksToPDF(tasksToExport, CONDOMINIOS, TASK_TYPES, STATUSES, includeDesc, includeHistory, reportOwnerName = null, empresaNome = 'Relatório Geral', emitterName = 'N/A') {
    const { jsPDF } = window.jspdf;
    
    let historyData = [];
    if (includeHistory) {
        const taskIds = tasksToExport.filter(task => task).map(t => t.id);
        if (taskIds.length > 0) {
            try {
                // --- CORREÇÃO FINAL ---
                // Ao criar o cliente temporário, especificamos que ele deve usar o 'sessionStorage',
                // assim como o cliente principal da aplicação. Isso garante que ele encontre a sessão ativa.
                const tempSupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                    auth: {
                        storage: sessionStorage,
                    },
                });

                // Agora, a chamada getSession() encontrará a sessão correta.
                const { data: { session } } = await tempSupabaseClient.auth.getSession();

                if (!session?.access_token) throw new Error("Token de acesso não encontrado. Não é possível buscar o histórico.");

                const { data, error } = await tempSupabaseClient
                    .rpc('get_history_for_tasks', { task_ids: taskIds });
                    // Não precisamos mais do .auth(token) porque o cliente já está ciente da sessão.

                if (error) throw error;
                historyData = data || [];

            } catch (error) {
                console.error("Falha ao buscar histórico dentro de utils.js:", error);
                alert("Não foi possível buscar o histórico das tarefas para o PDF: " + error.message);
                return; 
            }
        }
    }
    
    const orientation = (includeDesc || includeHistory) ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation });

    // O resto da função continua exatamente igual...
    let finalY = 15;
    doc.setFontSize(18).setFont(undefined, 'bold');
    doc.text("Relatório de Tarefas - TaskCom", 14, finalY);
    finalY += 7;
    if (empresaNome) {
        doc.setFontSize(14).setFont(undefined, 'normal');
        doc.text(empresaNome, 14, finalY);
        finalY += 8;
    }
    doc.setFontSize(11).setFont(undefined, 'italic');
    doc.setTextColor(100);
    if (reportOwnerName) {
        doc.text(`Relatório de: ${reportOwnerName}`, 14, finalY);
    } else {
        doc.text(`Relatório emitido por: ${emitterName}`, 14, finalY);
    }
    finalY += 6;
    
    doc.setFontSize(11).setFont(undefined, 'normal');
    doc.setTextColor(100);
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 14, finalY);

    const head = [['ID', 'Título', 'Tipo', 'Condomínio', 'Status', 'Concluir Até']];
    if (!reportOwnerName) {
        head[0].splice(4, 0, 'Responsável');
    }
    if (includeDesc) {
        head[0].push('Descrição');
    }
    if (includeHistory) {
        head[0].push('Histórico');
    }

    const body = tasksToExport
        .filter(task => task)
        .map(task => {
            const taskType = TASK_TYPES.find(t => t.id == task.tipo_tarefa_id)?.nome_tipo || 'N/A';
            const condo = CONDOMINIOS.find(c => c.id == task.condominio_id);
            const condoDisplayName = condo ? (condo.nome_fantasia || condo.nome) : 'N/A';
            const visualStatusInfo = getVisualStatus(task, STATUSES);
            let statusText = 'N/A';
            if (visualStatusInfo) {
                statusText = visualStatusInfo.status.text;
                if (visualStatusInfo.status.key === 'overdue' && visualStatusInfo.days > 0) {
                    statusText += ` (${visualStatusInfo.days} dia${visualStatusInfo.days > 1 ? 's' : ''})`;
                }
            }
            let row = [
                task.id, task.titulo, taskType, condoDisplayName,
                statusText,
                new Date(task.data_conclusao_prevista).toLocaleDateString('pt-BR', {timeZone: 'UTC'})
            ];
            if (!reportOwnerName) {
                row.splice(4, 0, task.responsavel_nome || 'N/A');
            }
            if (includeDesc) {
                row.push(task.descricao || '');
            }
            if (includeHistory) {
                const events = historyData.filter(h => h.tarefa_id === task.id);
                const historyString = events.map(e => {
                    const eventDate = new Date(e.created_at).toLocaleDateString('pt-BR');
                    const userName = e.usuario_nome || 'Sistema';
                    if (e.evento === 'Criação') {
                        return `${eventDate}: Tarefa criada por ${userName}`;
                    }
                    if (e.evento === 'Re-designação') {
                        const de = e.detalhes?.de || 'Ninguém';
                        const para = e.detalhes?.para || 'Não definido';
                        return `${eventDate}: Re-designado de '${de}' para '${para}' por ${userName}`;
                    }
                     if (e.evento === 'Alteração de Status') {
                        const para = e.detalhes?.para || 'desconhecido';
                        return `${eventDate}: Status alterado para '${para}' por ${userName}`;
                    }
                    return `${eventDate}: ${e.evento} (por ${userName})`;
                }).join('\n');
                row.push(historyString || 'Nenhum histórico.');
            }
            return row;
        });

    doc.autoTable({
        head: head, 
        body: body, 
        startY: finalY + 7,
        theme: 'striped', 
        headStyles: { fillColor: [30, 58, 138] }
    });

    doc.save(`relatorio-taskcom-${new Date().toISOString().split('T')[0]}.pdf`);
}