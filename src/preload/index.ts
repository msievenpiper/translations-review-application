import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  projects: {
    list:   ()                      => ipcRenderer.invoke('projects:list'),
    create: (data: any)             => ipcRenderer.invoke('projects:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('projects:update', id, data),
    delete: (id: string)            => ipcRenderer.invoke('projects:delete', id),
  },
  audit: {
    run:     (req: any)             => ipcRenderer.invoke('audit:run', req),
    history: (projectId: string)    => ipcRenderer.invoke('audit:history', projectId),
    delete:  (auditId: string)      => ipcRenderer.invoke('audit:delete', auditId),
  },
  settings: {
    load: ()          => ipcRenderer.invoke('settings:load'),
    save: (data: any) => ipcRenderer.invoke('settings:save', data),
  },
  export: {
    report: (auditId: string) => ipcRenderer.invoke('export:report', auditId),
  },
})
