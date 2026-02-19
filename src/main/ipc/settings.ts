import { ipcMain } from 'electron'
import { loadSettings, saveSettings, type AppSettings } from '../settings'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:load', () => loadSettings())
  ipcMain.handle('settings:save', (_event, partial: Partial<AppSettings>) => saveSettings(partial))
}
