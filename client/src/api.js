async function req(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  })
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export const api = {
  config: () => req('GET', '/api/config'),
  projects: (status) => req('GET', '/api/projects' + (status ? `?status=${status}` : '')),
  project: (number) => req('GET', `/api/projects/${number}`),
  createProject: (body) => req('POST', '/api/projects', body),
  saveProject: (number, doc) => req('PUT', `/api/projects/${number}`, doc),
  deleteProject: (number) => req('DELETE', `/api/projects/${number}`),
  templates: () => req('GET', '/api/templates'),
  createTemplate: (body) => req('POST', '/api/templates', body),
  deleteTemplate: (id) => req('DELETE', `/api/templates/${id}`)
}
