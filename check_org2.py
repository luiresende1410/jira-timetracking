import httpx, os
from base64 import b64encode
base = os.environ['JIRA_BASE_URL']
email = os.environ['JIRA_EMAIL']
token = os.environ['JIRA_API_TOKEN']
auth = b64encode(f'{email}:{token}'.encode()).decode()
headers = {'Authorization': f'Basic {auth}', 'Accept': 'application/json'}
r = httpx.get(f'{base}/rest/api/3/search', headers=headers, params={'jql': 'project=AWS', 'maxResults': 5, 'fields': 'summary,customfield_10002'})
data = r.json()
for issue in data.get('issues', []):
    orgs = issue['fields'].get('customfield_10002') or []
    names = [o.get('name') for o in orgs]
    print(issue['key'], names)
