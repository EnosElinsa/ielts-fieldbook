import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
/** Exercise the themed select via its public trigger and option, as a user does. */
export async function selectChoice(trigger: HTMLElement, label: string) {
  const user=userEvent.setup();
  await user.click(trigger);
  await user.click(await screen.findByRole('option',{name:label}));
}
