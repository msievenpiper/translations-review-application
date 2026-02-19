type AuditRequest =
  | { type: 'url';  projectId: string; url: string; userAgent?: string; acceptLanguage?: string }
  | { type: 'file'; projectId: string; filePath: string; fileType: 'html' | 'json' | 'csv' }

declare global {
  interface Window {
    api: {
      projects: {
        list:   ()                      => Promise<any[]>
        create: (data: any)             => Promise<any>
        update: (id: string, data: any) => Promise<any>
        delete: (id: string)            => Promise<void>
      }
      audit: {
        run:     (req: AuditRequest) => Promise<any>
        history: (projectId: string) => Promise<any[]>
        delete:  (auditId: string)   => Promise<void>
      }
      settings: {
        load: ()          => Promise<any>
        save: (data: any) => Promise<void>
      }
      export: {
        report: (auditId: string) => Promise<string>
      }
    }
  }
}
export {}
