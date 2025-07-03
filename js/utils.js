// Substitua todo o conteúdo de js/utils.js

// Função auxiliar para calcular o status visual de uma tarefa
function getVisualStatus(task, STATUSES) {
    if (!task || !task.status) return null;
    if (task.status === 'completed') return STATUSES.completed;
    if (task.status === 'deleted') return STATUSES.deleted;
    if (task.status === 'pending') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Garante que a data seja tratada corretamente
        const dateParts = task.data_conclusao_prevista.split('-');
        const dueDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        return dueDate < today ? STATUSES.overdue : STATUSES.in_progress;
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
export function exportTasksToPDF(tasksToExport, CONDOMINIOS, TASK_TYPES, STATUSES, includeDesc, includeHistory, historyData, reportOwnerName = null, empresaNome = 'Relatório Geral') {
    const { jsPDF } = window.jspdf;
    
    const orientation = (includeDesc || includeHistory) ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation });

    // --- CABEÇALHO DO RELATÓRIO ---
    let finalY = 15;
    
    // Título Principal
    doc.setFontSize(18).setFont(undefined, 'bold');
    doc.text("Relatório de Tarefas - TaskCom", 14, finalY);
    finalY += 7;

    // Nome da Empresa (logo abaixo)
    if (empresaNome) {
        doc.setFontSize(14).setFont(undefined, 'normal');
        doc.text(empresaNome, 14, finalY);
        finalY += 8;
    }
    
    // Nome do Responsável (se for um relatório específico)
    if (reportOwnerName) {
        doc.setFontSize(11).setFont(undefined, 'italic');
        doc.setTextColor(100);
        doc.text(`Relatório de: ${reportOwnerName}`, 14, finalY);
        finalY += 6;
    }
    
    // Data de Emissão
    doc.setFontSize(11).setFont(undefined, 'normal');
    doc.setTextColor(100);
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 14, finalY);

    // --- COLUNAS DA TABELA (DINÂMICO) ---
    const head = [['ID', 'Título', 'Tipo', 'Condomínio', 'Status', 'Concluir Até']];
    // Se o relatório NÃO for de um usuário específico (gerado pelo admin), mostra a coluna "Responsável"
    if (!reportOwnerName) {
        head[0].splice(4, 0, 'Responsável');
    }
    if (includeDesc) head[0].push('Descrição');
    if (includeHistory) head[0].push('Histórico');

    // --- CORPO DA TABELA (DINÂMICO) ---
    const body = tasksToExport
        .filter(task => task)
        .map(task => {
            const taskType = TASK_TYPES.find(t => t.id == task.tipo_tarefa_id)?.nome_tipo || 'N/A';
            const condo = CONDOMINIOS.find(c => c.id == task.condominio_id);
            const condoDisplayName = condo ? (condo.nome_fantasia || condo.nome) : 'N/A';
            const visualStatus = getVisualStatus(task, STATUSES);

            let row = [
                task.id, task.titulo, taskType, condoDisplayName,
                visualStatus ? visualStatus.text : 'N/A',
                new Date(task.data_conclusao_prevista).toLocaleDateString('pt-BR', {timeZone: 'UTC'})
            ];

            if (!reportOwnerName) {
                row.splice(4, 0, task.responsavel?.nome_completo || 'N/A');
            }
            if (includeDesc) {
                row.push(task.descricao || '');
            }
            if (includeHistory) {
                const events = historyData.filter(h => h.tarefa_id === task.id);
                const historyString = events.map(e => {
                    const de = e.detalhes?.de || 'Ninguém';
                    const para = e.detalhes?.para || 'Não definido';
                    return `${new Date(e.created_at).toLocaleDateString('pt-BR')}: ${e.evento} de ${de} para ${para}`;
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

    doc.save(`relatorio-taskond-${new Date().toISOString().split('T')[0]}.pdf`);
}