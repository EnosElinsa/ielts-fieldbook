import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useConfirmationDialog } from './useConfirmationDialog';
afterEach(cleanup);
test('confirmation resolves on accessible action and cancels when scope changes', async () => {
  const result = vi.fn();
  function Harness({ scope }: { scope: string }) { const { confirm, dialog } = useConfirmationDialog(scope); return <>{dialog}<button onClick={() => void confirm({ title: 'Replace recording', description: 'Keep the existing recording?', confirmLabel: 'Replace', destructive: true }).then(result)}>Ask</button></>; }
  const view = render(<Harness scope="first" />);
  fireEvent.click(screen.getByText('Ask')); fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
  await Promise.resolve(); expect(result).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByText('Ask')); view.rerender(<Harness scope="second" />);
  await Promise.resolve(); expect(result).toHaveBeenLastCalledWith(false);
  expect(screen.queryByRole('dialog')).toBeNull();
});
