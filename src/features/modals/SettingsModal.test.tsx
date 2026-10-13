import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SettingsModal } from './SettingsModal';
const fb = vi.hoisted(() => ({ modal: 'settings', closeModal: vi.fn() }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => fb }));
function Location() { return <output aria-label="Location">{useLocation().pathname}</output>; }
beforeEach(() => { fb.modal = 'settings'; fb.closeModal.mockImplementation(() => { fb.modal = ''; }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
test('legacy settings modal routes to consolidated target settings', () => {
  render(<MemoryRouter><SettingsModal /><Location /></MemoryRouter>);
  expect(screen.getByLabelText('Location')).toHaveTextContent('/settings/target');
  expect(fb.closeModal).toHaveBeenCalledOnce();
});
test('legacy settings entry respects an active practice navigation guard', () => {
  const guard = (event: Event) => event.preventDefault();
  document.addEventListener('fieldbook:before-navigate', guard);
  try {
    render(<MemoryRouter initialEntries={['/vocabulary/study']}><SettingsModal /><Location /></MemoryRouter>);
    expect(screen.getByLabelText('Location')).toHaveTextContent('/vocabulary/study');
    expect(fb.closeModal).toHaveBeenCalledOnce();
  } finally { document.removeEventListener('fieldbook:before-navigate', guard); }
});
