import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    create: (data: unknown) => ipcRenderer.invoke('projects:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('projects:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('projects:delete', id)
  },
  audit: {
    run: (req: unknown) => ipcRenderer.invoke('audit:run', req),
    get: (auditId: string) => ipcRenderer.invoke('audit:get', auditId),
    history: (projectId: string) => ipcRenderer.invoke('audit:history', projectId),
    delete: (auditId: string) => ipcRenderer.invoke('audit:delete', auditId),
    snapshot: (auditId: string) => ipcRenderer.invoke('audit:snapshot', auditId)
  },
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (data: unknown) => ipcRenderer.invoke('settings:save', data)
  },
  export: {
    report: (auditId: string) => ipcRenderer.invoke('export:report', auditId)
  },
  schedule: {
    get: (projectId: string) => ipcRenderer.invoke('schedule:get', projectId),
    upsert: (projectId: string, config: unknown) =>
      ipcRenderer.invoke('schedule:upsert', projectId, config),
    delete: (projectId: string) => ipcRenderer.invoke('schedule:delete', projectId),
    trackedUrls: {
      list: (projectId: string) => ipcRenderer.invoke('schedule:trackedUrls:list', projectId),
      add: (projectId: string, url: string, opts?: unknown) =>
        ipcRenderer.invoke('schedule:trackedUrls:add', projectId, url, opts),
      toggle: (urlId: string, enabled: boolean) =>
        ipcRenderer.invoke('schedule:trackedUrls:toggle', urlId, enabled),
      delete: (urlId: string) => ipcRenderer.invoke('schedule:trackedUrls:delete', urlId)
    },
    runNow: (projectId: string) => ipcRenderer.invoke('schedule:runNow', projectId)
  }
})
