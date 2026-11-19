import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { DateField } from './ui';

afterEach(cleanup);
test('editing and clearing use a locale-independent ISO date', () => {
  const change = vi.fn();
  const view = render(<DateField id="day" label="Study date" value="2026-11-17" onChange={change} />);
  const input = screen.getByLabelText('Study date');
  expect(input).toHaveAttribute('placeholder', 'YYYY-MM-DD');
  fireEvent.change(input, { target: { value: '2026-11-18' } });
  expect(change).toHaveBeenLastCalledWith('2026-11-18');
  view.rerender(<DateField id="day" label="Study date" value="2026-11-18" onChange={change} />);
  fireEvent.change(input, { target: { value: '' } });
  expect(change).toHaveBeenLastCalledWith('');
});

test('date bounds reject out-of-range values and impossible dates', () => {
  const change = vi.fn();
  render(<DateField id="day" label="Study date" value="2026-11-17" min="2026-11-16" max="2026-11-18" onChange={change} />);
  const input = screen.getByLabelText('Study date') as HTMLInputElement;
  fireEvent.change(input, { target: { value: '2026-11-15' } });
  expect(change).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '2026-11-19' } });
  expect(change).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '2026-11-31' } });
  expect(change).not.toHaveBeenCalled();
  fireEvent.blur(input);
  expect(input).toHaveValue('2026-11-17');
  expect(screen.getByRole('status')).toHaveTextContent('Use a valid date');
  fireEvent.change(input, { target: { value: '2026-11-18' } });
  expect(change).toHaveBeenLastCalledWith('2026-11-18');
});
