import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import '@testing-library/jest-dom/vitest';
import type {VocabularySenseDiagram} from '../../domain/vocabulary/media';
import {AsyncMeaningDiagram} from './AsyncMeaningDiagram';
const loader=vi.hoisted(()=>({load:vi.fn(),peek:vi.fn()}));
vi.mock('./diagramLoader',()=>({vocabularyDiagramLoader:loader}));
const first={term:'bank',kind:'river-bank'} as VocabularySenseDiagram;
const second={term:'charge',kind:'delivery-fee'} as VocabularySenseDiagram;
const Renderer=({diagram}:{diagram:VocabularySenseDiagram})=><svg role="img" aria-label={diagram.term+': '+diagram.kind}/>;
beforeEach(()=>{vi.clearAllMocks();loader.peek.mockReturnValue(undefined);});afterEach(cleanup);
test('waiting for the renderer keeps surrounding definition and controls usable',async()=>{
 let finish!:(renderer:typeof Renderer)=>void;loader.load.mockReturnValue(new Promise(resolve=>{finish=resolve;}));const practice=vi.fn();
 render(<><p>The edge of a river.</p><button onClick={practice}>Practise this word</button><AsyncMeaningDiagram diagram={first}/></>);
 expect(screen.getByRole('status')).toHaveTextContent('Loading diagram');expect(screen.getByText('The edge of a river.')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Practise this word'}));expect(practice).toHaveBeenCalledOnce();
 await act(async()=>finish(Renderer));expect(screen.getByRole('img',{name:'bank: river-bank'})).toBeInTheDocument();
});
test('a local failure offers retry and can render successfully afterward',async()=>{
 loader.load.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(Renderer);
 render(<AsyncMeaningDiagram diagram={first}/>);await screen.findByRole('button',{name:'Retry diagram'});
 expect(screen.getByRole('status')).toHaveTextContent('keep learning from the definition and example');
 fireEvent.click(screen.getByRole('button',{name:'Retry diagram'}));expect(await screen.findByRole('img',{name:'bank: river-bank'})).toBeInTheDocument();expect(loader.load).toHaveBeenCalledTimes(2);
});
test('delayed completion uses the current meaning rather than the original props',async()=>{
 let finish!:(renderer:typeof Renderer)=>void;loader.load.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
 const view=render(<AsyncMeaningDiagram diagram={first}/>);view.rerender(<AsyncMeaningDiagram diagram={second}/>);
 await act(async()=>finish(Renderer));expect(screen.getByRole('img',{name:'charge: delivery-fee'})).toBeInTheDocument();expect(screen.queryByRole('img',{name:/bank/})).not.toBeInTheDocument();expect(loader.load).toHaveBeenCalledTimes(1);
});
test('leaving during a load never mounts the delayed diagram',async()=>{
 let finish!:(renderer:typeof Renderer)=>void;loader.load.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
 const view=render(<AsyncMeaningDiagram diagram={first}/>);view.unmount();await act(async()=>finish(Renderer));expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
test('an already loaded renderer appears without another loading placeholder',()=>{
 loader.peek.mockReturnValue(Renderer);render(<AsyncMeaningDiagram diagram={second}/>);
 expect(screen.getByRole('img',{name:'charge: delivery-fee'})).toBeInTheDocument();expect(screen.queryByRole('status')).not.toBeInTheDocument();expect(loader.load).not.toHaveBeenCalled();
});
