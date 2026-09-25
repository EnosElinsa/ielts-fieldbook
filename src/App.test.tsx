import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from './App';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

const downloads: { name: string; text: string }[] = [];

vi.mock('./storage', async () => {
  const actual = await vi.importActual<typeof import('./storage')>('./storage');
  const loadState = () => ({
      schemaVersion: 8,
      questions: [
        {
          id: '1',
          type: '1',
          name: 'Sample Task 1',
          format: 'Line graph',
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
      plans: [
        {
          id: 'plan-timed',
          dateKey: '2026-09-25',
          kind: '1',
          title: 'Timed writing',
          description: 'Write to the clock.',
          deskMode: 'timed',
          status: 'in_progress',
          linkedSessionId: null,
          questionId: '1',
          startedAt: '2026-09-25T00:00:00.000Z',
          completedAt: null,
          driver: null,
        },
      ],
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
      activePlanId: 'plan-timed',
      reviewedAt: null,
    });
  return {
    ...actual,
    loadState,
    hydrateState: async () => loadState(),
    saveState: () => true,
    writeBankCache: () => undefined,
    readBankCache: () => null,
    downloadFile: (name: string, text: string) => {
      downloads.push({ name, text });
    },
  };
});

beforeEach(() => {
  downloads.length = 0;
  localStorage.removeItem('ielts-fieldbook-rail');
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  );
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
              format: 'Line graph',
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

const longEssay = Array.from({ length: 160 }, (_, i) => `word${i}`).join(' ');

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

  it('keeps the sidebar open until the user collapses it', async () => {
    const user = userEvent.setup();
    renderAt('/write');
    const rail = document.querySelector('.rail') as HTMLElement;
    expect(document.querySelector('.shell')?.className).not.toContain('is-collapsed');
    expect(within(rail).getByText('Write')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(document.querySelector('.shell')?.className).toContain('is-collapsed');
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(document.querySelector('.shell')?.className).not.toContain('is-collapsed');
    expect(within(rail).getByText('Write')).toBeTruthy();
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

  it('blocks timed save until the checklist is complete, then export and import link by session_id', async () => {
    const user = userEvent.setup();
    renderAt('/write');
    const input = await screen.findByTestId('essay-input');
    await user.clear(input);
    await user.click(input);
    await user.paste(longEssay);

    await user.click(screen.getByTestId('writing-finished'));
    expect(screen.queryByRole('heading', { name: 'Finished' })).toBeNull();
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/Tick series|overview before saving/i);
    });

    for (const label of ['Series', 'Units', 'Time', 'Overview']) {
      await user.click(screen.getByLabelText(label));
    }
    await user.click(screen.getByTestId('writing-finished'));
    expect(await screen.findByRole('heading', { name: 'Finished' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save and export' }));

    await waitFor(() => expect(downloads.length).toBe(1));
    expect(downloads[0].text).toMatch(/session_id:\s+\S+/);
    const sessionId = downloads[0].text.match(/session_id:\s+(\S+)/)?.[1];
    expect(sessionId).toBeTruthy();

    const scoreMarkdown = `session_id: ${sessionId}
question_id: 1
task: Task 1
review_contract_version: 2
overall: 5.5

## Candidate response

${longEssay}

## ????

| ?? | ?? | ?? |
|---|---:|---|
| Task Achievement | 5 | Some figures are vague. |
| Coherence and Cohesion | 6 | Paragraphs follow a clear order. |
| Lexical Resource | 6 | Vocabulary covers the chart topic. |
| Grammatical Range and Accuracy | 5 | Sentence errors appear. |

## ????

The overview is present, but comparisons need work.

## ???????

Name each series clearly.

## ?????????

| ???? | ??? | ?? | ???? |
|---|---|---|---|
| vague | clearer | clearer comparison | TA-DATA |

## ?????

A rewritten answer for the chart.

## ??????

| ?? | ?? | ??/?? | ?? | ?? |
|---|---|---|---|---|
| ?? | remained high | stayed high | Bus use remained high. | Task 1 |

## ??? 30 ????

Write only the overview next time.
`;

    const file = new File([scoreMarkdown], 'score.md', { type: 'text/markdown' });
    const fileInput = document.querySelector(
      'input[accept=".md,.txt,text/markdown,text/plain"]',
    ) as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getAllByText(/Linked/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/Marked/i)).toBeTruthy();
    expect(screen.getByText(/Overall 5\.5/i)).toBeTruthy();
  }, 30000);
});
