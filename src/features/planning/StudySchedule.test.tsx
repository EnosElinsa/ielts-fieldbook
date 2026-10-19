// @ts-nocheck
import {act,cleanup,fireEvent,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {emptyState} from '../../domain';
import {useStudySchedule} from './StudySchedule';
const mocks=vi.hoisted(()=>({state:null,refresh:vi.fn()}));
vi.mock('../../context/FieldbookContext',()=>({useFieldbook:()=>({state:mocks.state,ensureUnifiedPlans:mocks.refresh})}));
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date(2026,9,19,23,59,59));mocks.state=emptyState();mocks.refresh.mockReset().mockResolvedValue(true);});
afterEach(()=>{cleanup();vi.useRealTimers();});
test('local midnight and foreground return refresh a mounted schedule and clean up listeners',async()=>{
 const view=renderHook(()=>useStudySchedule());await act(async()=>{});expect(mocks.refresh).toHaveBeenCalledTimes(1);
 await act(async()=>{await vi.advanceTimersByTimeAsync(1001);});expect(mocks.refresh).toHaveBeenCalledTimes(2);
 await act(async()=>{fireEvent.focus(window);});expect(mocks.refresh).toHaveBeenCalledTimes(3);
 view.unmount();fireEvent.focus(window);await vi.advanceTimersByTimeAsync(86400000);expect(mocks.refresh).toHaveBeenCalledTimes(3);
});
test('successful submissions and explicit edits refresh once; automatic generated rows do not loop',async()=>{
 const view=renderHook(()=>useStudySchedule());await act(async()=>{});
 mocks.state={...mocks.state,vocabularySessions:[{id:'s',status:'submitted',submittedAt:'2026-10-19T12:00:00Z'}]};view.rerender();await act(async()=>{});expect(mocks.refresh).toHaveBeenCalledTimes(2);
 mocks.state={...mocks.state,plans:[{id:'automatic',status:'pending',origin:'automatic'}]};view.rerender();await act(async()=>{});expect(mocks.refresh).toHaveBeenCalledTimes(2);
 mocks.state={...mocks.state,plans:[{id:'manual',status:'pending',origin:'manual',manuallyEditedAt:'now'}]};view.rerender();await act(async()=>{});expect(mocks.refresh).toHaveBeenCalledTimes(3);
 view.rerender();await act(async()=>{});expect(mocks.refresh).toHaveBeenCalledTimes(3);
 mocks.state={...mocks.state,settings:{...mocks.state.settings,dailyMinutes:45}};view.rerender();await act(async()=>{});expect(mocks.refresh).toHaveBeenCalledTimes(4);
});

test('activity committed while a refresh is saving schedules a follow-up instead of losing the trigger',async()=>{
 let finish;mocks.refresh.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const view=renderHook(()=>useStudySchedule());await act(async()=>{});
 mocks.state={...mocks.state,sessions:[{id:'saved',date:'2026-10-19'}]};view.rerender();
 expect(mocks.refresh).toHaveBeenCalledTimes(1);
 await act(async()=>{finish(true);});expect(mocks.refresh).toHaveBeenCalledTimes(2);
});
