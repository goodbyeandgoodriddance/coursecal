import { contextBridge, ipcRenderer } from 'electron';

// The entire surface the renderer gets. Everything else stays in the main
// process. Keep this in sync with src/types/bridge.d.ts, which is what the
// renderer type-checks against.
contextBridge.exposeInMainWorld('coursecal', {
  notify: (payload: { title: string; body: string }) =>
    ipcRenderer.send('coursecal:notify', payload),

  exportData: (json: string, suggestedName: string) =>
    ipcRenderer.invoke('coursecal:export', json, suggestedName),

  importData: () => ipcRenderer.invoke('coursecal:import'),

  preImportSnapshot: (json: string) => ipcRenderer.invoke('coursecal:preImportSnapshot', json),

  isDesktop: true,
});
