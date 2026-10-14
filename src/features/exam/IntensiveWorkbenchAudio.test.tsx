import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { IntensiveWorkbenchPage } from './IntensiveWorkbenchPage';

const mocks=vi.hoisted(()=>({owner:'one',fb:null as any,recovery:new Map(),events:{} as Record<string,(...args:any[])=>void>,create:vi.fn(),putAudio:vi.fn(),pending:vi.fn()}));
vi.mock('../../context/FieldbookContext',()=>({useFieldbook:()=>mocks.fb}));
vi.mock('../../storage/remote',()=>({accountId:()=>mocks.owner}));
vi.mock('../../storage/examCatalog',()=>({loadExamSections:async()=>({schemaVersion:1,papers:[],questions:[],passages:[],sections:[{id:'part',paperId:'paper',skill:'listening',part:1,title:'Journey',status:'ready',questionTypes:[],questionCount:0,provenance:{sourceUrl:'https://example.org',sourceVersion:'1',contentHash:'hash',fetchedAt:'2026-01-01',authorization:'owned'},assetId:'audio',sentences:[{id:'s1',text:'The train leaves at nine.',start:0,end:3},{id:'s2',text:'Please bring your ticket.',start:3,end:6}]}],assets:[{id:'audio'}]}),resolveExamAsset:async()=>'/audio.mp3'}));
vi.mock('../../storage/examRecovery',()=>({readExamRecovery:(owner:string,key:string)=>mocks.recovery.get(`${owner}:${key}`),writeExamRecovery:(owner:string,key:string,data:unknown)=>mocks.recovery.set(`${owner}:${key}`,structuredClone(data)),clearExamRecovery:(owner:string,key:string)=>mocks.recovery.delete(`${owner}:${key}`)}));
vi.mock('../../storage/audio',()=>({putAudio:mocks.putAudio,getAudio:async()=>null}));
vi.mock('../../storage/pendingAudio',()=>({readPendingAudio:async()=>null,writePendingAudio:mocks.pending,deletePendingAudio:async()=>true}));
// Browser audio/recording APIs are the external boundary; IntensiveAudio stays real.
vi.mock('wavesurfer.js',()=>({default:{create:mocks.create}}));
vi.mock('../../components/SessionAudioPlayer',()=>({RecordingPlayer:()=> <p>Recording preview</p>,SessionAudioPlayer:()=> <p>Saved recording</p>}));
const open=()=>render(<MemoryRouter><IntensiveWorkbenchPage sectionId="part"/></MemoryRouter>);
beforeEach(()=>{
  mocks.owner='one';mocks.recovery.clear();mocks.events={};mocks.pending.mockReset().mockResolvedValue(true);mocks.putAudio.mockReset().mockResolvedValue(undefined);
  const state={intensiveSessions:[]};mocks.fb={state,stateRef:{current:state},persistNow:vi.fn(async(draft:any)=>{mocks.fb.state=draft;mocks.fb.stateRef.current=draft;return true;})};
  mocks.create.mockReset().mockImplementation(()=>({on:(name:string,handler:any)=>{mocks.events[name]=handler;},load:vi.fn(async()=>{mocks.events.ready?.(20);}),destroy:vi.fn(),getDuration:()=>20,setOptions:vi.fn(),setPlaybackRate:vi.fn(),isSeeking:()=>false,setTime:vi.fn((seconds:number)=>{mocks.events.seeking?.(seconds);mocks.events.timeupdate?.(seconds);}),pause:vi.fn(()=>mocks.events.pause?.()),play:vi.fn(async()=>{mocks.events.play?.();})}));
  const tracks=[{stop:vi.fn()}];Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:vi.fn().mockResolvedValue({getTracks:()=>tracks})}});
  vi.stubGlobal('MediaRecorder',class {state='inactive';mimeType='audio/webm';ondataavailable:any;onstop:any;start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['actual chunks'],{type:'audio/webm'})});this.onstop?.();}});
  const NativeURL=globalThis.URL;vi.stubGlobal('URL',class extends NativeURL {static createObjectURL(){return 'blob:shadowing';}static revokeObjectURL(){}});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function prepareShadowing(user:ReturnType<typeof userEvent.setup>){
  await user.click(await screen.findByRole('button',{name:'Replay sentence'}));
  act(()=>{mocks.events.timeupdate(1);mocks.events.timeupdate(2);mocks.events.timeupdate(3);});
  await user.type(screen.getByRole('textbox',{name:'Sentence dictation'}),'The train leaves at nine.');
  await user.click(screen.getByRole('button',{name:'Compare with transcript'}));
  await user.click(screen.getByRole('button',{name:'Record shadowing'}));
  await user.click(await screen.findByRole('button',{name:'Stop recording'}));
  await user.click(await screen.findByRole('button',{name:'Save shadowing recording'}));
  await screen.findByText('Saved recording');
}
it('step three plays the original with the same player and earns an actual scheduled completion',async()=>{
  const user=userEvent.setup();open();await prepareShadowing(user);
  const createCount=mocks.create.mock.calls.length;
  await user.click(screen.getByRole('button',{name:'Play original blind'}));
  expect(screen.queryByRole('textbox',{name:'Sentence dictation'})).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Main idea or situation')).not.toBeInTheDocument();
  expect(mocks.create).toHaveBeenCalledTimes(createCount);
  await user.selectOptions(screen.getByLabelText('Self rating'),'5');
  const finish=screen.getByRole('button',{name:'Finish and schedule review'});expect(finish).toBeDisabled();
  act(()=>{mocks.events.timeupdate(1);mocks.events.timeupdate(2);});expect(finish).toBeDisabled();
  act(()=>mocks.events.timeupdate(3));expect(finish).toBeEnabled();
  await user.click(finish);expect(await screen.findByRole('button',{name:'Review scheduled'})).toBeDisabled();
  const completed=mocks.fb.stateRef.current.intensiveSessions[0];expect(completed.stage).toBe(6);expect(completed.shadowingAudioId).toMatch(/^intensive-/);expect(completed.completedAt).toBeTruthy();expect(completed.nextReviewAt).toBeTruthy();
});
it('a paused or sought blind replay cannot finish, but a fresh complete replay can',async()=>{
  const user=userEvent.setup();open();await prepareShadowing(user);await user.selectOptions(screen.getByLabelText('Self rating'),'5');
  await user.click(screen.getByRole('button',{name:'Play original blind'}));
  act(()=>{mocks.events.timeupdate(1);mocks.events.pause();mocks.events.play();mocks.events.timeupdate(3);});
  expect(screen.getByRole('button',{name:'Finish and schedule review'})).toBeDisabled();
  await user.click(screen.getByRole('button',{name:'Play original blind'}));
  act(()=>{mocks.events.seeking(3);mocks.events.timeupdate(3);});expect(screen.getByRole('button',{name:'Finish and schedule review'})).toBeDisabled();
  await user.click(screen.getByRole('button',{name:'Play original blind'}));
  act(()=>{mocks.events.timeupdate(1);mocks.events.timeupdate(2);mocks.events.timeupdate(3);});expect(screen.getByRole('button',{name:'Finish and schedule review'})).toBeEnabled();
});
it('switching sentences during delayed microphone permission stops the old stream and does not record into the new sentence',async()=>{
  let allow:any;const stop=vi.fn();const start=vi.fn();
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:vi.fn(()=>new Promise(resolve=>{allow=resolve;}))}});
  vi.stubGlobal('MediaRecorder',class {start=start;});
  const user=userEvent.setup();open();await user.click(await screen.findByRole('button',{name:'Replay sentence'}));act(()=>mocks.events.timeupdate(3));
  await user.type(screen.getByLabelText('Sentence dictation'),'The train leaves at nine');await user.click(screen.getByRole('button',{name:'Compare with transcript'}));
  await user.click(screen.getByRole('button',{name:'Record shadowing'}));
  expect(screen.getByRole('button',{name:'Opening microphone…'})).toBeDisabled();
  await user.selectOptions(screen.getByLabelText('Jump to sentence'),'1');
  await act(async()=>allow({getTracks:()=>[{stop}]}));
  await waitFor(()=>expect(stop).toHaveBeenCalled());expect(start).not.toHaveBeenCalled();expect(mocks.pending).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox',{name:'Sentence dictation'})).toHaveValue('');expect(screen.getByRole('button',{name:'Record shadowing'})).toBeDisabled();
});
it('retains a pending shadowing recording when replacement is cancelled and records again only after confirmation',async()=>{
  const user=userEvent.setup();open();await user.click(await screen.findByRole('button',{name:'Replay sentence'}));act(()=>mocks.events.timeupdate(3));
  await user.type(screen.getByLabelText('Sentence dictation'),'The train leaves at nine');await user.click(screen.getByRole('button',{name:'Compare with transcript'}));
  await user.click(screen.getByRole('button',{name:'Record shadowing'}));await user.click(await screen.findByRole('button',{name:'Stop recording'}));
  await user.click(screen.getByRole('button',{name:'Record shadowing'}));
  const dialog=screen.getByRole('dialog',{name:'Replace pending shadowing recording?'});
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
  await user.click(within(dialog).getByRole('button',{name:'Cancel'}));expect(screen.getByText('Recording preview')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Save shadowing recording'})).toBeEnabled();
  await user.click(screen.getByRole('button',{name:'Record shadowing'}));await user.click(screen.getByRole('button',{name:'Record again'}));
  expect(await screen.findByRole('button',{name:'Stop recording'})).toBeEnabled();expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
});
