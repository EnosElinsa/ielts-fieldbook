export const SETTINGS_BACKUP_EVENT = 'fieldbook:settings-backup';
export type SettingsBackupAction = 'import' | 'export';
export function requestSettingsBackup(action: SettingsBackupAction) {
  document.dispatchEvent(new CustomEvent<SettingsBackupAction>(SETTINGS_BACKUP_EVENT, { detail: action }));
}
