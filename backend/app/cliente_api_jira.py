import httpx
import asyncio
from base64 import b64encode
from datetime import datetime
from typing import Optional

from .config import ConfiguracaoJira
from .models import Worklog, Projeto, Usuario, Issue


class JiraApiError(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(f"HTTP {status_code}: {message}")


class ClienteApiJira:
    def __init__(self, config: ConfiguracaoJira):
        self.config = config
        token = b64encode(f"{config.email}:{config.api_token}".encode()).decode()
        self._client = httpx.AsyncClient(
            base_url=config.base_url,
            headers={
                "Authorization": f"Basic {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            timeout=httpx.Timeout(config.timeout_segundos),
        )

    async def close(self):
        await self._client.aclose()

    async def _request(self, method: str, url: str, **kwargs) -> dict:
        try:
            resp = await self._client.request(method, url, **kwargs)
        except httpx.TimeoutException:
            raise JiraApiError(0, "Timeout ao conectar com a API do Jira")

        if resp.status_code == 429:
            retry_after = int(resp.headers.get("Retry-After", "5"))
            await asyncio.sleep(retry_after)
            return await self._request(method, url, **kwargs)

        if resp.status_code >= 400:
            raise JiraApiError(resp.status_code, resp.text)

        return resp.json() if resp.text else {}

    async def autenticar(self) -> dict:
        return await self._request("GET", "/rest/api/3/myself")

    async def buscar_worklogs_atualizados(self, desde: datetime) -> list[int]:
        since_ms = int(desde.timestamp() * 1000)
        todos_ids: list[int] = []
        while True:
            data = await self._request(
                "GET",
                "/rest/api/3/worklog/updated",
                params={"since": since_ms},
            )
            for v in data.get("values", []):
                todos_ids.append(v["worklogId"])
            if data.get("lastPage", True):
                break
            since_ms = data.get("until", since_ms)
        return todos_ids

    @staticmethod
    def _extrair_comentario(comment: dict | None) -> str | None:
        if not comment:
            return None
        try:
            content = comment.get("content", [])
            if content and len(content) > 0:
                inner = content[0].get("content", [])
                if inner and len(inner) > 0:
                    return inner[0].get("text", "")
            return ""
        except (IndexError, AttributeError, TypeError):
            return None

    async def buscar_detalhes_worklogs(self, ids: list[int]) -> list[Worklog]:
        if not ids:
            return []
        worklogs: list[Worklog] = []
        for i in range(0, len(ids), 1000):
            batch = ids[i : i + 1000]
            data = await self._request(
                "POST", "/rest/api/3/worklog/list", json={"ids": batch}
            )
            for w in data:
                worklogs.append(
                    Worklog(
                        id=str(w["id"]),
                        issue_id=str(w.get("issueId", "")),
                        author_account_id=w.get("author", {}).get("accountId", ""),
                        tempo_gasto_segundos=w.get("timeSpentSeconds", 0),
                        data_inicio=w.get("started", ""),
                        comentario=self._extrair_comentario(w.get("comment")),
                        criado_em=w.get("created", ""),
                        atualizado_em=w.get("updated", ""),
                    )
                )
        return worklogs

    async def buscar_projetos(self) -> list[Projeto]:
        data = await self._request("GET", "/rest/api/3/project")
        return [
            Projeto(id=str(p["id"]), key=p["key"], nome=p["name"]) for p in data
        ]

    async def buscar_usuario(self, account_id: str) -> Optional[Usuario]:
        try:
            data = await self._request(
                "GET", "/rest/api/3/user", params={"accountId": account_id}
            )
            return Usuario(
                account_id=data["accountId"],
                display_name=data.get("displayName", ""),
                email_address=data.get("emailAddress"),
                ativo=data.get("active", True),
            )
        except JiraApiError:
            return None


    async def buscar_issues_projeto(
        self,
        project_key: str,
        max_results: int = 2000,
        data_inicio=None,
        data_fim=None,
    ) -> list:
        """Busca issues de um projeto via JQL com paginacao.
        Se data_inicio/data_fim forem informados, filtra tickets criados OU
        atualizados dentro do periodo (inclusive).
        """
        if data_inicio and data_fim:
            inicio_str = data_inicio.strftime("%Y-%m-%d")
            fim_str = data_fim.strftime("%Y-%m-%d")
            jql = (
                f"project = {project_key} AND "
                f"(created >= \"{inicio_str}\" OR updated >= \"{inicio_str}\") AND "
                f"(created <= \"{fim_str}\" OR updated <= \"{fim_str}\") "
                f"ORDER BY updated DESC"
            )
        else:
            jql = f"project = {project_key} ORDER BY updated DESC"

        issues = []
        page_size = 100
        next_page_token = None

        while len(issues) < max_results:
            params = {
                "jql": jql,
                "maxResults": page_size,
                "fields": "summary,status,issuetype,customfield_10002,assignee,created,updated,priority",
            }
            if next_page_token:
                params["nextPageToken"] = next_page_token

            data = await self._request("GET", "/rest/api/3/search/jql", params=params)
            batch = data.get("issues", [])
            issues.extend(batch)

            if data.get("isLast", True) or not batch:
                break
            next_page_token = data.get("nextPageToken")
            if not next_page_token:
                break

        return issues
    async def buscar_issue(self, issue_id: str) -> Optional[Issue]:
        try:
            data = await self._request(
                "GET",
                f"/rest/api/3/issue/{issue_id}",
                params={"fields": "summary,project,customfield_10002,issuetype,status"},
            )
            fields = data.get("fields", {})
            # Extrair organization do customfield_10002
            orgs = fields.get("customfield_10002") or []
            org_name = orgs[0].get("name", "") if orgs else None
            issue_type = fields.get("issuetype", {}).get("name") if fields.get("issuetype") else None
            issue_status = fields.get("status", {}).get("name") if fields.get("status") else None
            return Issue(
                id=str(data["id"]),
                key=data["key"],
                summary=fields.get("summary", ""),
                project_id=str(fields.get("project", {}).get("id", "")),
                organizacao=org_name,
                issue_type=issue_type,
                issue_status=issue_status,
            )
        except JiraApiError:
            return None

