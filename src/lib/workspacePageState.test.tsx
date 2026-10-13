import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { readWorkspacePageState, useWorkspaceDeskContext, useWorkspacePageState, workspacePageStateKey, type WorkspaceDeskContext } from './workspacePageState';
const identity = vi.hoisted(() => ({ owner: 'one' }));
vi.mock('../storage/remote', () => ({accountId: () => identity.owner}));
function Page({page = 'writing:q1'}: {page?: string}) {
  const [value, setValue] = useWorkspacePageState(page, {seconds: 60, tab: 'answer'});
  return <><output>{value.seconds}:{value.tab}</output><button onClick={() => setValue(v => ({seconds: v.seconds - 1, tab:'prompt'}))}>Tick</button></>;
}
beforeEach(() => {sessionStorage.clear(); identity.owner = 'one';});
afterEach(() => cleanup());
test('page UI state resumes across remounts and stays isolated by owner and question', () => {
  const first = render(<Page />); fireEvent.click(screen.getByText('Tick')); first.unmount();
  const resumed = render(<Page />); expect(screen.getByText('59:prompt')).toBeInTheDocument();
  resumed.rerender(<Page page="writing:q2" />); expect(screen.getByText('60:answer')).toBeInTheDocument();
  resumed.rerender(<Page />); expect(screen.getByText('59:prompt')).toBeInTheDocument();
  identity.owner = 'two'; resumed.rerender(<Page />); expect(screen.getByText('60:answer')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Tick')); fireEvent.click(screen.getByText('Tick'));
  identity.owner = 'one'; resumed.rerender(<Page />); expect(screen.getByText('59:prompt')).toBeInTheDocument();
});

test('malformed stored state falls back without leaking an envelope from a different owner', () => {
  sessionStorage.setItem(workspacePageStateKey('two', 'writing'), JSON.stringify({version:1, owner:'one', value:{seconds:12, tab:'prompt'}}));
  expect(readWorkspacePageState('two', 'writing', {seconds:60, tab:'answer'})).toEqual({seconds:60, tab:'answer'});
  sessionStorage.setItem(workspacePageStateKey('two', 'writing'), JSON.stringify({version:1, owner:'two', value:{seconds:'12', tab:'prompt'}}));
  expect(readWorkspacePageState('two', 'writing', {seconds:60, tab:'answer'})).toEqual({seconds:60, tab:'answer'});
});

test('blocked browser storage still allows UI changes', () => {
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {throw new Error('Blocked');});
  try { render(<Page />); fireEvent.click(screen.getByText('Tick')); expect(screen.getByText('59:prompt')).toBeInTheDocument(); }
  finally {write.mockRestore();}
});

function Desk({ready = true}: {ready?: boolean}) {
  const [context, setContext] = useState<WorkspaceDeskContext>({skill:'speaking', id:'topic-new', mode:'speak-notes', part:'2', questionIndex:0});
  const location = useLocation(); const navigate = useNavigate();
  useWorkspaceDeskContext(context, setContext, id => ['topic-new','topic-old'].includes(id), ready);
  return <><output>{context.id}:{context.part}:{context.mode}</output><output aria-label="Context">{JSON.stringify(location.state?.workspaceDeskContext)}</output><button onClick={() => setContext({...context, id:'topic-new'})}>Choose another</button><button onClick={() => navigate('/speak')}>Explicit desk</button><button onClick={() => navigate(-1)}>Back</button><button onClick={() => navigate(1)}>Forward</button></>;
}
const oldDesk = {owner:'one', skill:'speaking', id:'topic-old', mode:'speak-blind', part:'3', questionIndex:1};

test('resumed module restores the saved desk selection and allows a later explicit selection', () => {
  render(<MemoryRouter initialEntries={[{pathname:'/speak', state:{workspaceModuleRestore:{owner:'one',url:'/speak'}, workspaceDeskContext:oldDesk}}]}><Desk /></MemoryRouter>);
  expect(screen.getByText('topic-old:3:speak-blind')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Choose another'));
  expect(screen.getByText('topic-new:3:speak-blind')).toBeInTheDocument();
  expect(screen.getByLabelText('Context')).toHaveTextContent('topic-new');
});

test('a desk opened as an explicit destination keeps the newly selected context', () => {
  render(<MemoryRouter initialEntries={[{pathname:'/speak', state:{workspaceModuleRestore:{owner:'one',url:'/speak'}, workspaceDeskContext:oldDesk}}]}><Desk /></MemoryRouter>);
  fireEvent.click(screen.getByText('Choose another'));
  fireEvent.click(screen.getByText('Explicit desk'));
  expect(screen.getByText('topic-new:3:speak-blind')).toBeInTheDocument();
});

test('a reload restores context from its current history entry without another account’s state', () => {
  const first = render(<MemoryRouter initialEntries={[{pathname:'/speak', state:{workspaceDeskContext:oldDesk}}]}><Desk /></MemoryRouter>);
  expect(screen.getByText('topic-old:3:speak-blind')).toBeInTheDocument(); first.unmount();
  identity.owner='two';
  render(<MemoryRouter initialEntries={[{pathname:'/speak', state:{workspaceDeskContext:oldDesk}}]}><Desk /></MemoryRouter>);
  expect(screen.getByText('topic-new:2:speak-notes')).toBeInTheDocument();
});

test('loading a workspace cannot replace the owned desk context before it is ready', () => {
  const view = render(<MemoryRouter initialEntries={[{pathname:'/speak', state:{workspaceDeskContext:oldDesk}}]}><Desk ready={false}/></MemoryRouter>);
  expect(screen.getByLabelText('Context')).toHaveTextContent('topic-old');
  view.rerender(<MemoryRouter><Desk ready /></MemoryRouter>);
  expect(screen.getByText('topic-old:3:speak-blind')).toBeInTheDocument();
});

test('same-path browser back and forward restore each desk selection', () => {
  render(<MemoryRouter initialEntries={[{pathname:'/speak', state:{workspaceDeskContext:oldDesk}}]}><Desk /></MemoryRouter>);
  fireEvent.click(screen.getByText('Explicit desk'));
  fireEvent.click(screen.getByText('Choose another'));
  expect(screen.getByText('topic-new:3:speak-blind')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Back'));
  expect(screen.getByText('topic-old:3:speak-blind')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Forward'));
  expect(screen.getByText('topic-new:3:speak-blind')).toBeInTheDocument();
});
