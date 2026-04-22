import httpx, os, json
base = os.environ['JIRA_BASE_URL']
email = os.environ['JIRA_EMAIL']
token = os.environ['JIRA_API_TOKEN']
r = httpx.get('http://localhost:8000/api/relatorio/completo', params={'data_inicio': '2026-04-01', 'data_fim': '2026-04-30'}, timeout=60)
data = r.json()
clientes = data.get('clientes', [])
print(f'Total clientes: {len(clientes)}')
for c in clientes:
    projetos_todos = []
    for col in c.get('colaboradores', []):
        projetos_todos.extend(col.get('projetos', []))
    print(f"  cliente={c['cliente']} | projetos={sorted(set(projetos_todos))}")
