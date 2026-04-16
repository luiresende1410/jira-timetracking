import * as XLSX from 'xlsx';
import type {
  RelatorioColaborador,
  RelatorioProjeto,
  RelatorioCliente,
  ResumoGeral,
} from './types';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCSV(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(';')];
  for (const row of rows) {
    lines.push(headers.map(h => String(row[h] ?? '')).join(';'));
  }
  return lines.join('\n');
}

function flatColaboradores(data: RelatorioColaborador[]) {
  const rows: Record<string, string | number>[] = [];
  for (const c of data) {
    for (const p of c.detalhes_por_projeto) {
      for (const a of p.atividades) {
        rows.push({
          Colaborador: c.nome_colaborador,
          Email: c.email_colaborador,
          Projeto: p.projeto_nome,
          ProjetoKey: p.projeto_key,
          Issue: a.issue_key,
          Resumo: a.issue_summary,
          Data: a.data_registro,
          Horas: a.horas,
          Comentario: a.comentario ?? '',
        });
      }
    }
  }
  return rows;
}

function flatProjetos(data: RelatorioProjeto[]) {
  const rows: Record<string, string | number>[] = [];
  for (const p of data) {
    for (const c of p.colaboradores) {
      rows.push({
        Projeto: p.projeto_nome,
        ProjetoKey: p.projeto_key,
        TotalHorasProjeto: p.total_horas,
        Colaborador: c.nome_colaborador,
        Horas: c.total_horas,
        'Contribuicao%': c.percentual_contribuicao,
      });
    }
  }
  return rows;
}

function flatClientes(data: RelatorioCliente[]) {
  return data.map(c => ({ Cliente: c.cliente, TotalHoras: c.total_horas }));
}

function flatResumo(data: ResumoGeral) {
  return [{
    PeriodoInicio: data.periodo_inicio,
    PeriodoFim: data.periodo_fim,
    TotalHoras: data.total_horas_geral,
    Colaboradores: data.total_colaboradores,
    Projetos: data.total_projetos,
    MediaPorColaborador: data.media_horas_por_colaborador,
  }];
}

export function exportCSV(
  tab: string,
  resumo: ResumoGeral | null,
  colaboradores: RelatorioColaborador[],
  projetos: RelatorioProjeto[],
  clientes: RelatorioCliente[],
) {
  let rows: Record<string, string | number>[] = [];
  let filename = 'relatorio';
  if (tab === 'resumo' && resumo) { rows = flatResumo(resumo); filename = 'resumo'; }
  else if (tab === 'colaboradores') { rows = flatColaboradores(colaboradores); filename = 'colaboradores'; }
  else if (tab === 'projetos') { rows = flatProjetos(projetos); filename = 'projetos'; }
  else if (tab === 'clientes') { rows = flatClientes(clientes); filename = 'clientes'; }
  if (rows.length === 0) return;
  const csv = toCSV(rows);
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  download(blob, filename + '.csv');
}

export function exportExcel(
  resumo: ResumoGeral | null,
  colaboradores: RelatorioColaborador[],
  projetos: RelatorioProjeto[],
  clientes: RelatorioCliente[],
) {
  const wb = XLSX.utils.book_new();
  if (resumo) {
    const ws = XLSX.utils.json_to_sheet(flatResumo(resumo));
    XLSX.utils.book_append_sheet(wb, ws, 'Resumo');
  }
  if (colaboradores.length > 0) {
    const ws = XLSX.utils.json_to_sheet(flatColaboradores(colaboradores));
    XLSX.utils.book_append_sheet(wb, ws, 'Colaboradores');
  }
  if (projetos.length > 0) {
    const ws = XLSX.utils.json_to_sheet(flatProjetos(projetos));
    XLSX.utils.book_append_sheet(wb, ws, 'Projetos');
  }
  if (clientes.length > 0) {
    const ws = XLSX.utils.json_to_sheet(flatClientes(clientes));
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
  }
  XLSX.writeFile(wb, 'relatorio-timetracking.xlsx');
}
