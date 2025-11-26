import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { state } from './state.js';

// --- FUNÇÃO HELPER PARA CARREGAR IMAGEM DA URL (CORRIGIDA) ---
async function getImageData(url) {
  if (!url) return null;

  // REMOVIDO: const proxyUrl = 'https://cors-anywhere.herokuapp.com/'; 
  
  try {
    // Acessa a URL da imagem diretamente
    const response = await fetch(url); //
    if (!response.ok) throw new Error('Resposta da rede não foi OK');
    
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result); // Retorna a imagem como Base64
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Erro ao carregar a imagem da logo:", error.message);
    return null; // Retorna nulo se a imagem falhar ao carregar
  }
}

// Função interna para buscar o termo principal com segurança
function getEntidadePrincipal() {
    // Usa o ?. para evitar erro se 'terminologia' não existir
    // Se não encontrar, retorna 'Item' como um texto padrão seguro.
    return state.terminologia?.entidade_principal || 'Item';
}

// Função para exportar e usar no resto do app (ex: 'Loja')
export function getTermSingular() {
    return getEntidadePrincipal();
}

// Função para exportar e usar no resto do app (ex: 'Lojas')
export function getTermPlural() {
    const singular = getEntidadePrincipal();
    // Lógica simples de pluralização que funciona para os nossos casos
    if (singular.endsWith('o')) {
        return singular.slice(0, -1) + 'os'; // Ex: Condomínio -> Condomínios
    }
    return singular + 's'; // Ex: Loja -> Lojas
}

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
// Substitua esta função inteira no seu arquivo utils.js

export async function exportTasksToPDF(tasksToExport, CONDOMINIOS, TASK_TYPES, STATUSES, includeDesc, includeHistory, reportOwnerName = null, empresaNome = 'Relatório Geral', emitterName = 'N/A', logoUrl = null) {
    const { jsPDF } = window.jspdf;
    
    // 1. CARREGAMENTO DO HISTÓRICO (COM CORREÇÃO DE AUTENTICAÇÃO)
    let historyData = [];
    if (includeHistory) {
        const taskIds = tasksToExport.filter(task => task).map(t => t.id);
        if (taskIds.length > 0) {
            try {
                // --- INÍCIO DA CORREÇÃO DE TOKEN ---
                // 1. Tenta achar o token no localStorage (Padrão do Supabase)
                let tokenKey = Object.keys(localStorage).find(key => key.startsWith('sb-') && key.endsWith('-auth-token'));
                let storageSource = localStorage;

                // 2. Se não achar, tenta no sessionStorage (Fallback)
                if (!tokenKey) {
                    tokenKey = Object.keys(sessionStorage).find(key => key.startsWith('sb-') && key.endsWith('-auth-token'));
                    storageSource = sessionStorage;
                }

                // 3. Pega o token
                const sessionData = tokenKey ? JSON.parse(storageSource.getItem(tokenKey)) : null;
                const accessToken = sessionData ? sessionData.access_token : null;

                if (!accessToken) {
                    console.error("DEBUG: Token não encontrado nem no LocalStorage nem no SessionStorage.");
                    throw new Error("Sessão não encontrada. Por favor, recarregue a página ou faça login novamente.");
                }

                // 4. Cria o cliente injetando o token manualmente
                const tempSupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                    global: {
                        headers: {
                            Authorization: `Bearer ${accessToken}`
                        }
                    }
                });
                // --- FIM DA CORREÇÃO DE TOKEN ---

                // Chama a função RPC segura usando o cliente autenticado
                const { data, error } = await tempSupabaseClient.rpc('get_history_for_tasks', { task_ids: taskIds });
                
                if (error) throw error;
                historyData = data || [];

            } catch (error) {
                console.error("Falha ao buscar histórico dentro de utils.js:", error);
                alert("Não foi possível buscar o histórico das tarefas para o PDF: " + error.message);
                return; // Para a execução se falhar o histórico (opcional, poderia continuar sem histórico)
            }
        }
    }
    
    const orientation = (includeDesc || includeHistory) ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation });
    const pageCenterX = doc.internal.pageSize.getWidth() / 2;

    // --- MONTAGEM DO LAYOUT DO PDF ---

    let finalY = 15; // Margem do topo

    // 2. Adiciona a Logo (Centralizada)
    const imageData = await getImageData(logoUrl);
    if (imageData) {
        const imageType = imageData.substring(imageData.indexOf('/') + 1, imageData.indexOf(';'));
        doc.addImage(imageData, imageType.toUpperCase(), pageCenterX - 20, finalY, 40, 15, '', 'FAST', 0);
        finalY += 20; 
    }
    
    finalY += 5; 

    // 3. Cabeçalho (Nome da Empresa)
    doc.setFontSize(14).setFont(undefined, 'normal');
    doc.text(empresaNome, pageCenterX, finalY, { align: 'center' });
    finalY += 10;
     
    // Sub-cabeçalho (Emissor)
    doc.setFontSize(9).setFont(undefined, 'italic');
    doc.setTextColor(100);
    if (reportOwnerName) {
        doc.text(`Relatório de: ${reportOwnerName}`, 14, finalY);
    } else {
        doc.text(`Relatório emitido por: ${emitterName}`, 14, finalY);
    }
    finalY += 6;

    // Data de Emissão
    doc.setFontSize(9).setFont(undefined, 'normal');
    doc.setTextColor(0);
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 14, finalY);
    finalY += 5;

    // Título Principal
    doc.setFontSize(16).setFont(undefined, 'bold');
    doc.text("Relatório de Tarefas", pageCenterX, finalY, { align: 'center' });
    finalY += 3;

    // 4. Preparação da Tabela
    const head = [['ID', 'Título', 'Tipo', getTermSingular(), 'Status', 'Concluir Até']];
    if (!reportOwnerName) head[0].splice(4, 0, 'Responsável');
    if (includeDesc) head[0].push('Descrição');
    if (includeHistory) head[0].push('Histórico');

    const body = tasksToExport
        .filter(task => task)
        .map(task => {
            const taskType = TASK_TYPES.find(t => t.id == task.tipo_tarefa_id)?.nome_tipo || 'N/A';
            const condo = CONDOMINIOS.find(c => c.id == task.condominio_id);
            const condoDisplayName = condo ? (condo.nome_fantasia || condo.nome) : 'N/A';
            const visualStatusInfo = getVisualStatus(task, STATUSES);
            let statusText = visualStatusInfo ? visualStatusInfo.status.text : 'N/A';
            if (visualStatusInfo?.status.key === 'overdue' && visualStatusInfo.days > 0) {
                 statusText += ` (${visualStatusInfo.days} dia${visualStatusInfo.days > 1 ? 's' : ''})`;
            }

            let row = [
                task.id, task.titulo, taskType, condoDisplayName,
                statusText,
                new Date(task.data_conclusao_prevista).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
            ];
            if (!reportOwnerName) row.splice(4, 0, task.responsavel_nome || 'N/A');
            if (includeDesc) row.push(task.descricao || '');

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
                        const statusKeyDe = e.detalhes?.de || null;
                        const statusKeyPara = e.detalhes?.para || 'desconhecido';
                        
                        const statusTextDe = statusKeyDe ? (STATUSES[statusKeyDe]?.text || statusKeyDe) : null;
                        const statusTextPara = STATUSES[statusKeyPara]?.text || statusKeyPara; 

                        if (statusTextDe) {
                            return `${eventDate}: Status alterado de '${statusTextDe}' para '${statusTextPara}' por ${userName}`;
                        } else {
                            return `${eventDate}: Status definido como '${statusTextPara}' por ${userName}`;
                        }
                    }
                    return `${eventDate}: ${e.evento} (por ${userName})`;
                }).join('\n');
                row.push(historyString || 'Nenhum histórico.');
            }
            return row;
        });

    // 5. Gera a Tabela com Rodapé Personalizado
    doc.autoTable({
        head: head, 
        body: body, 
        startY: finalY, 
        theme: 'striped', 
        headStyles: { fillColor: [30, 58, 138] },
        columnStyles: {
            [head[0].indexOf('Histórico')]: { cellWidth: 'wrap' } 
        },
        didDrawPage: function (data) {
            const pageHeight = doc.internal.pageSize.getHeight();
            const startX = data.settings.margin.left;
            const startY = pageHeight - 10; 
            
            doc.setFontSize(9);
            
            const staticText = 'Sistema TaskCom | site: ';
            const linkText = ' iadev.app';
            const linkUrl = 'https://www.iadev.app/';

            // Texto estático
            doc.setTextColor(150);
            doc.text(staticText, startX, startY);

            // Link clicável
            const staticTextWidth = doc.getTextWidth(staticText);
            doc.setTextColor(0, 0, 238);
            doc.textWithLink(linkText, startX + staticTextWidth, startY, { url: linkUrl });
        }
    });

    // 6. Totalizador Final
    const finalYAfterTable = doc.lastAutoTable.finalY + 10; 
    
    if (finalYAfterTable > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        doc.text(`Total de tarefas listadas: ${body.length}`, 14, 20);
    } else {
        doc.setFontSize(10).setFont(undefined, 'bold');
        doc.setTextColor(0);
        doc.text(`Total de tarefas listadas: ${body.length}`, 14, finalYAfterTable);
    }

    // 7. Salva o Arquivo
    doc.save(`relatorio-taskcom-${new Date().toISOString().split('T')[0]}.pdf`);
}