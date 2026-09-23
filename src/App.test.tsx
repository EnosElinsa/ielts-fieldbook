import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from './App';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

vi.mock('./storage', async () => {
  const actual = await vi.importActual<typeof import('./storage')>('./storage');
  return {
    ...actual,
    loadState: () => ({
      schemaVersion: 7,
      questions: [
        {
          id: '1',
          type: '1',
          name: 'Sample Task 1',
          format: '折线图',
          prompt: 'Describe the chart.',
          image: '',
          source: '',
        },
      ],
      sessions: [],
      drafts: {},
      errors: [],
      assessments: [],
      lexicon: [],
      plans: [],
      stories: [],
      speakingTopics: [
        {
          id: 's1',
          part: 2,
          title: 'A memorable trip',
          cueCard: 'Describe a trip',
          bullets: [],
          questions: [],
          part3: [],
        },
      ],
      settings: {
        examDate: '',
        dailyMinutes: 30,
        days: [1, 2, 3, 4, 5],
        focus: 'balanced',
        targetBand: '',
        activeSkill: 'writing',
        skillMix: 'mixed',
        speakingFocus: 'balanced',
      },
      activePlanId: null,
      reviewedAt: null,
    }),
    saveState: () => true,
    writeBankCache: () => undefined,
    readBankCache: () => null,
  };
});

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('questions.json')) {
        return {
          ok: true,
          json: async () => [
            {
              id: '1',
              type: '1',
              name: 'Sample Task 1',
              format: '折线图',
              prompt: 'Describe the chart.',
              image: '',
              source: '',
            },
          ],
        } as Response;
      }
      if (String(url).includes('speaking-questions.json')) {
        return {
          ok: true,
          json: async () => ({
            topics: [
              {
                id: 's1',
                part: 2,
                title: 'A memorable trip',
                cueCard: 'Describe a trip',
                bullets: [],
                questions: [],
                part3: [],
              },
            ],
          }),
        } as Response;
      }
      if (String(url).includes('speaking-samples.json')) {
        return { ok: true, json: async () => ({ byId: {} }) } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    }),
  );
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('Fieldbook UI', () => {
  it('switches the rail when skill changes', async () => {
    const user = userEvent.setup();
    renderAt('/');
    const rail = document.querySelector('.rail') as HTMLElement;
    expect(within(rail).getByText('Write')).toBeTruthy();
    expect(within(rail).queryByText('Stories')).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Speaking' }));
    expect(within(rail).getByText('Stories')).toBeTruthy();
    expect(within(rail).getByText('Practice')).toBeTruthy();
    expect(within(rail).queryByText('Write')).toBeNull();
  });

  it('renders Today', () => {
    renderAt('/');
    expect(screen.getAllByRole('heading', { level: 2, name: 'Today' })[0]).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Start' })[0]).toBeTruthy();
  });

  it('updates writing desk word count when the draft changes', async () => {
    const user = userEvent.setup();
    renderAt('/write');
    const input = await screen.findAllByTestId('essay-input');
    await user.clear(input[0]);
    await user.type(input[0], 'one two three');
    expect(screen.getAllByTestId('word-count')[0].textContent).toContain('3 words');
  });
});
