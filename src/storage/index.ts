// @ts-nocheck
import { emptyState } from '../domain';
import { accountStoreAvailable, hydrateState, saveState } from './remote';

export const STORE_KEY = 'ielts-writing-fieldbook';

export { accountStoreAvailable, hydrateState, saveState };

export function loadState() {
  return emptyState();
}

export function readBankCache() {
  return null;
}

export function applyBankCache() {}

export function writeBankCache() {}

export function downloadFile(name, text, mime) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' }));
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 500);
}
