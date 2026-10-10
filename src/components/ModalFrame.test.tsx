import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ModalFrame } from './ModalFrame';

afterEach(cleanup);
test('structured modal exposes a visible title, description and footer', () => {
  render(<ModalFrame open onClose={() => {}} title="Practice settings" header="Vocabulary" description="Choose how to practise." footer={<button>Save</button>}><label>Mode<input /></label></ModalFrame>);
  expect(screen.getByRole('dialog', { name: 'Practice settings' })).toHaveAccessibleDescription('Choose how to practise.');
  expect(screen.getByRole('heading', { name: 'Practice settings' })).not.toHaveClass('sr-only');
  expect(screen.getByRole('button', { name: 'Save' })).toBeVisible();
});
test('busy modal prevents Escape and close button dismissal', async () => {
  const close = vi.fn();
  render(<ModalFrame open busy onClose={close} title="Saving" header="Settings"><p>Wait</p></ModalFrame>);
  const user = userEvent.setup();
  expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDisabled();
  await user.keyboard('{Escape}');
  expect(close).not.toHaveBeenCalled();
});
test('legacy children and accessible title remain supported', () => {
  render(<ModalFrame open onClose={() => {}} title="Legacy"><div className="modal"><h3>Existing heading</h3><button>Existing save</button></div></ModalFrame>);
  expect(screen.getByRole('dialog', { name: 'Legacy' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Existing save' })).toBeVisible();
});
