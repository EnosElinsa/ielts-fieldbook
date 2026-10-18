import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import '@testing-library/jest-dom/vitest';
import type {VocabularySenseDiagram} from '../../domain/vocabulary/media';
import {AsyncMeaningDiagram} from './AsyncMeaningDiagram';
const loader=vi.hoisted(()=>({load:vi.fn(),peek:vi.fn(),keyFor:vi.fn()}));
vi.mock('./diagramLoader',()=>({vocabularyDiagramLoader:loader}));
const first={term:'bank',kind:'river-bank'} as VocabularySenseDiagram,samePack={term:'bank',kind:'bank-loan'} as VocabularySenseDiagram,second={term:'charge',kind:'delivery-fee'} as VocabularySenseDiagram;
const Renderer=({diagram}:{diagram:VocabularySenseDiagram})=><svg role="img" aria-label={diagram.term+': '+diagram.kind}/>;
const BRenderer=({diagram}:{diagram:VocabularySenseDiagram})=><svg role="img" aria-label={'B '+diagram.term}/>;
const CRenderer=({diagram}:{diagram:VocabularySenseDiagram})=><svg role="img" aria-label={'C '+diagram.term}/>;
beforeEach(()=>{vi.resetAllMocks();loader.keyFor.mockImplementation((kind:string)=>kind==='delivery-fee'?'c':'b');loader.peek.mockReturnValue(undefined);});afterEach(cleanup);
test('waiting for a pack keeps the definition and practice control usable',async()=>{
 let finish!:(renderer:typeof Renderer)=>void;loader.load.mockReturnValue(new Promise(resolve=>{finish=resolve;}));const practice=vi.fn();render(<><p>The edge of a river.</p><button onClick={practice}>Practise this word</button><AsyncMeaningDiagram diagram={first}/></>);
 expect(screen.getByRole('status')).toHaveTextContent('Loading diagram');expect(screen.getByText('The edge of a river.')).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'Practise this word'}));expect(practice).toHaveBeenCalledOnce();expect(loader.load).toHaveBeenCalledWith('river-bank');await act(async()=>finish(Renderer));expect(screen.getByRole('img',{name:'bank: river-bank'})).toBeInTheDocument();
});
test('failure offers retry for the requested kind',async()=>{
 loader.load.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(Renderer);render(<AsyncMeaningDiagram diagram={first}/>);await screen.findByRole('button',{name:'Retry diagram'});expect(screen.getByRole('status')).toHaveTextContent('keep learning from the definition and example');fireEvent.click(screen.getByRole('button',{name:'Retry diagram'}));expect(await screen.findByRole('img',{name:'bank: river-bank'})).toBeInTheDocument();expect(loader.load).toHaveBeenNthCalledWith(2,'river-bank');
});
test('delayed same-pack completion uses current meaning without another load',async()=>{
 let finish!:(renderer:typeof Renderer)=>void;loader.load.mockReturnValue(new Promise(resolve=>{finish=resolve;}));const view=render(<AsyncMeaningDiagram diagram={first}/>);view.rerender(<AsyncMeaningDiagram diagram={samePack}/>);await act(async()=>finish(Renderer));expect(screen.getByRole('img',{name:'bank: bank-loan'})).toBeInTheDocument();expect(loader.load).toHaveBeenCalledOnce();
});
test('switching packs ignores late completion of the original pack',async()=>{
 let finishB!:(renderer:typeof Renderer)=>void,finishC!:(renderer:typeof Renderer)=>void;loader.load.mockImplementation((kind:string)=>new Promise(resolve=>{if(kind==='river-bank')finishB=resolve;else finishC=resolve;}));const view=render(<AsyncMeaningDiagram diagram={first}/>);view.rerender(<AsyncMeaningDiagram diagram={second}/>);expect(loader.load).toHaveBeenCalledWith('delivery-fee');await act(async()=>finishB(Renderer));expect(screen.queryByRole('img')).not.toBeInTheDocument();expect(screen.getByRole('status')).toHaveTextContent('Loading diagram');await act(async()=>finishC(Renderer));expect(screen.getByRole('img',{name:'charge: delivery-fee'})).toBeInTheDocument();
});
test('a ready renderer is not reused for a different pending pack',async()=>{
 loader.load.mockResolvedValueOnce(BRenderer).mockReturnValueOnce(new Promise(()=>{}));const view=render(<AsyncMeaningDiagram diagram={first}/>);await screen.findByRole('img',{name:'B bank'});view.rerender(<AsyncMeaningDiagram diagram={second}/>);expect(screen.queryByRole('img')).not.toBeInTheDocument();expect(screen.getByRole('status')).toHaveTextContent('Loading diagram');expect(loader.load).toHaveBeenCalledTimes(2);
});
test('a failed pack does not hide an already cached different pack',async()=>{
 loader.load.mockRejectedValue(new Error('offline'));const view=render(<AsyncMeaningDiagram diagram={first}/>);await screen.findByRole('button',{name:'Retry diagram'});loader.peek.mockImplementation((kind:string)=>kind==='delivery-fee'?CRenderer:undefined);view.rerender(<AsyncMeaningDiagram diagram={second}/>);expect(screen.getByRole('img',{name:'C charge'})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Retry diagram'})).not.toBeInTheDocument();
});
test('returning to a cached pack cannot be overwritten by another pending pack',async()=>{
 let finishC!:(renderer:typeof Renderer)=>void;loader.load.mockImplementation((kind:string)=>kind==='river-bank'?Promise.resolve(BRenderer):new Promise(resolve=>{finishC=resolve;}));const view=render(<AsyncMeaningDiagram diagram={first}/>);await screen.findByRole('img',{name:'B bank'});loader.peek.mockImplementation((kind:string)=>kind==='river-bank'?BRenderer:undefined);view.rerender(<AsyncMeaningDiagram diagram={second}/>);view.rerender(<AsyncMeaningDiagram diagram={first}/>);expect(screen.getByRole('img',{name:'B bank'})).toBeInTheDocument();await act(async()=>finishC(CRenderer));expect(screen.getByRole('img',{name:'B bank'})).toBeInTheDocument();expect(screen.queryByRole('img',{name:/C /})).not.toBeInTheDocument();
});
test('unmounting ignores a delayed diagram',async()=>{
 let finish!:(renderer:typeof Renderer)=>void;loader.load.mockReturnValue(new Promise(resolve=>{finish=resolve;}));const view=render(<AsyncMeaningDiagram diagram={first}/>);view.unmount();await act(async()=>finish(Renderer));expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
test('a cached requested pack renders without an import or placeholder',()=>{
 loader.peek.mockReturnValue(Renderer);render(<AsyncMeaningDiagram diagram={second}/>);expect(screen.getByRole('img',{name:'charge: delivery-fee'})).toBeInTheDocument();expect(loader.peek).toHaveBeenCalledWith('delivery-fee');expect(screen.queryByRole('status')).not.toBeInTheDocument();expect(loader.load).not.toHaveBeenCalled();
});
