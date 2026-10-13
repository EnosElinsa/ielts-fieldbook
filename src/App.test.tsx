import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from './App';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

const downloads: { name: string; text: string }[] = [];

function RouteLocation() {const location=useLocation();return <output aria-label="Current route">{location.pathname+location.search+location.hash}</output>;}
it('normalizes old vocabulary URLs while preserving batch filters and anchors',async()=>{
  render(<MemoryRouter initialEntries={['/vocabulary/wordbooks/guixue%3A10174/groups/21795/learn?batch=5&batchSize=10#word']}><AppRoutes/><RouteLocation/></MemoryRouter>);
  await waitFor(()=>expect(screen.getByLabelText('Current route').textContent).toBe('/vocabulary/wordbooks/ielts-vocabulary/groups/ielts-vocabulary-chapter-01-group-01/learn?batch=5&batchSize=10#word'));
});

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
      vocabulary: [],
      vocabularyStates: [],
      vocabularySessions: [],
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
    getCollectionStatuses: () => null,
    ensureAccountModule: async () => ({ data: {}, statuses: {} }),
    ensureCompleteAccount: async () => loadState(),
    ensureQuestionBank: async (skill: string) => skill === 'writing' ? loadState().questions : loadState().speakingTopics,
    ensureSpeakingSample: async () => null,
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
  vi.stubGlobal('scrollTo', vi.fn());
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
  it('shows global modules and route-specific study links', async () => {
    const user = userEvent.setup();
    renderAt('/write');
    const rail = document.querySelector('.rail') as HTMLElement;
    for (const label of ['Today', 'Planning', 'Writing', 'Speaking', 'Vocabulary', 'Progress', 'Settings']) {
      expect(within(rail).getByRole('link', { name: label })).toBeTruthy();
    }
    expect(within(rail).getByRole('navigation', { name: 'Writing study' })).toBeTruthy();
    const modules = rail.querySelectorAll('.nav-group');
    expect(Array.from(modules).map(group => group.querySelector('a')?.getAttribute('aria-label'))).toEqual(['Today', 'Planning', 'Listening', 'Reading', 'Writing', 'Speaking', 'Vocabulary', 'Progress', 'Settings']);
    expect(within(rail).getByRole('navigation', { name: 'Writing study' }).parentElement?.querySelector('a')?.getAttribute('aria-label')).toBe('Writing');
    await user.click(within(rail).getByRole('link', { name: 'Speaking' }));
    expect(within(rail).getByText('Stories')).toBeTruthy();
    expect(within(rail).getByText('Practice')).toBeTruthy();
    expect(within(rail).queryByRole('navigation', { name: 'Writing study' })).toBeNull();
  });

  it('More keeps current study actions without repeating mobile module entries', async () => {
    renderAt('/write');
    await userEvent.setup().click(screen.getByRole('button', { name: 'More' }));
    const dialog = screen.getByRole('dialog', { name: 'More' });
    for (const name of ['Questions', 'Practice', 'Review', 'Planning', 'Progress', 'Settings', 'Account']) expect(within(dialog).getByRole('button', { name })).toBeTruthy();
    for (const name of ['Listening', 'Reading', 'Writing', 'Speaking', 'Vocabulary']) expect(within(dialog).queryByRole('button', { name })).toBeNull();
  });

  it('keeps Speaking review selected after a direct Speaking question visit', async () => {
    const user = userEvent.setup();
    renderAt('/speak/questions');
    const rail = document.querySelector('.rail') as HTMLElement;
    const review = within(rail).getByRole('link', { name: 'Review' });
    expect(review.getAttribute('href')).toBe('/review?skill=speaking');
    await user.click(review);
    expect(screen.getByRole('heading', { level: 1, name: 'Attempts and scores' })).toBeTruthy();
    expect(within(rail).getByRole('navigation', { name: 'Speaking study' })).toBeTruthy();
  });

  it('keeps the sidebar open until the user collapses it', async () => {
    const user = userEvent.setup();
    renderAt('/write');
    const rail = document.querySelector('.rail') as HTMLElement;
    expect(document.querySelector('.shell')?.className).not.toContain('is-collapsed');
    expect(within(rail).getByText('Writing')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(document.querySelector('.shell')?.className).toContain('is-collapsed');
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(document.querySelector('.shell')?.className).not.toContain('is-collapsed');
    expect(within(rail).getByText('Writing')).toBeTruthy();
  });

  it('renders Today', async () => {
    renderAt('/');
    await screen.findAllByRole('heading', { level: 2, name: 'Today' });
    expect(screen.getAllByRole('heading', { level: 2, name: 'Today' })[0]).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
  });

  it('listening sidebar and mobile More contain only Questions and Review study entries', async () => {
    renderAt('/listening/intensive/part1');
    const rail = document.querySelector('.rail') as HTMLElement;
    const study = within(rail).getByRole('navigation', { name: 'Listening study' });
    expect(within(study).getAllByRole('link').map(link => link.textContent)).toEqual(['Questions', 'Review']);
    expect(within(study).getByRole('link', { name: 'Questions' }).getAttribute('aria-current')).toBe('page');
    await userEvent.setup().click(screen.getByRole('button', { name: 'More' }));
    const more = screen.getByRole('dialog', { name: 'More' });
    expect(within(more).getByRole('button', { name: 'Questions' })).toBeTruthy();
    expect(within(more).getByRole('button', { name: 'Review' })).toBeTruthy();
    expect(within(more).queryByRole('button', { name: 'Intensive listening' })).toBeNull();
  });

  it('Shell preserves the settings draft across category routes and guards global departures', async () => {
    renderAt('/settings/schedule'); const user = userEvent.setup();
    const minutes = await screen.findByRole('spinbutton', { name: 'Minutes a day' });
    fireEvent.change(minutes, { target: { value: '45' } });
    const categories = screen.getByRole('navigation', { name: 'Settings categories' });
    await user.click(within(categories).getByRole('link', { name: 'Vocabulary' }));
    expect(await screen.findByRole('spinbutton', { name: 'Learning batch size' })).toBeTruthy();
    await user.click(within(categories).getByRole('link', { name: 'Study time' }));
    expect((screen.getByRole('spinbutton', { name: 'Minutes a day' }) as HTMLInputElement).value).toBe('45');
    vi.mocked(window.confirm).mockReturnValue(false);
    const rail = document.querySelector('.rail') as HTMLElement;
    await user.click(within(rail).getByRole('link', { name: 'Today' }));
    expect((screen.getByRole('spinbutton', { name: 'Minutes a day' }) as HTMLInputElement).value).toBe('45');
    expect(window.confirm).toHaveBeenCalled();
  });

  it('Settings backup export uses the existing complete-account download flow', async () => {
    renderAt('/settings/backup');
    await screen.findByRole('heading', { level: 2, name: 'Backup' });
    const content = document.querySelector('.settings-content') as HTMLElement;
    await userEvent.setup().click(await within(content).findByRole('button', { name: 'Export backup' }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].name).toMatch(/^ielts-fieldbook-backup-.*\.json$/);
    expect(JSON.parse(downloads[0].text).settings.dailyMinutes).toBe(30);
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
    expect(
      await screen.findByText(
        'Essay saved, and the score request was exported. Score it outside Fieldbook, then import the scored file.',
      ),
    ).toBeTruthy();

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
      expect(screen.getByText(/Marked/i)).toBeTruthy();
      expect(screen.getByText(/Overall 5\.5/i)).toBeTruthy();
    });
  }, 30000);
});
