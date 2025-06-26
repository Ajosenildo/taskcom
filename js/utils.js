// Substitua todo o conteúdo de js/utils.js

// Função auxiliar para calcular o status visual de uma tarefa
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

export function createOrUpdateChart(canvasId, type, data, chartInstances, instanceKey, options = {}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (chartInstances[instanceKey]) {
        chartInstances[instanceKey].data = data;
        chartInstances[instanceKey].options = options;
        chartInstances[instanceKey].update();
    } else {
        chartInstances[instanceKey] = new Chart(ctx, { type: type, data: data, options: options });
    }
}

export function exportTasksToPDF(tasksToExport, CONDOMINIOS, TASK_TYPES, STATUSES, includeDesc, includeHistory, historyData, reportOwnerName = null) {
    const { jsPDF } = window.jspdf;
    
    // Se for incluir descrição ou histórico, a página fica na horizontal (paisagem)
    const orientation = (includeDesc || includeHistory) ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation });

    doc.setFontSize(18);
    doc.text("Relatório de Tarefas - TasKond", 14, 22);
    let finalY = 28;
    if (reportOwnerName) {
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Relatório de: ${reportOwnerName}`, 14, finalY);
        finalY += 6;
    }
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 14, finalY);

    const head = [['ID', 'Título', 'Tipo', 'Condomínio', 'Status', 'Concluir Até']];
    if (!reportOwnerName) {
        head[0].splice(4, 0, 'Responsável');
    }
    if (includeDesc) head[0].push('Descrição');
    if (includeHistory) head[0].push('Histórico');

    const body = tasksToExport.map(task => {
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
            }).join('\n'); // Usa quebra de linha para múltiplos eventos
            row.push(historyString);
        }
        return row;
    });

    doc.autoTable({
        head: head, body: body, startY: finalY + 5,
        theme: 'striped', headStyles: { fillColor: [30, 58, 138] }
    });

    doc.save(`relatorio-taskond-${new Date().toISOString().split('T')[0]}.pdf`);
}