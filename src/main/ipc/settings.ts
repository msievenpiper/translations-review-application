import { ipcMain } from 'electron'
import { loadSettings, saveSettings } from '../settings'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:load', () => loadSettings())
  ipcMain.handle('settings:save', (_event, partial: any) => saveSettings(partial))
}
