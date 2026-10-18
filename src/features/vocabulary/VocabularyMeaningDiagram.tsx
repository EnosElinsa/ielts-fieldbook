import type { VocabularySenseDiagram } from '../../domain/vocabulary/media';
import { getVocabularyDiagramPackId } from './diagramPacks';
import { VocabularyMeaningDiagram as RendererA } from './diagrams/VocabularyDiagramScenesA';
import { VocabularyMeaningDiagram as RendererB } from './diagrams/VocabularyDiagramScenesB';
import { VocabularyMeaningDiagram as RendererC } from './diagrams/VocabularyDiagramScenesC';
import { VocabularyMeaningDiagram as RendererD } from './diagrams/VocabularyDiagramScenesD';
import { VocabularyMeaningDiagram as RendererE } from './diagrams/VocabularyDiagramScenesE';
import { VocabularyMeaningDiagram as RendererF } from './diagrams/VocabularyDiagramScenesF';
import { VocabularyMeaningDiagram as RendererG } from './diagrams/VocabularyDiagramScenesG';
import { VocabularyMeaningDiagram as RendererI } from './diagrams/VocabularyDiagramScenesI';
import { VocabularyMeaningDiagram as RendererK } from './diagrams/VocabularyDiagramScenesK';
import { VocabularyMeaningDiagram as RendererL } from './diagrams/VocabularyDiagramScenesL';
import { VocabularyMeaningDiagram as RendererM } from './diagrams/VocabularyDiagramScenesM';
import { VocabularyMeaningDiagram as RendererN } from './diagrams/VocabularyDiagramScenesN';
import { VocabularyMeaningDiagram as RendererO } from './diagrams/VocabularyDiagramScenesO';
import { VocabularyMeaningDiagram as RendererP } from './diagrams/VocabularyDiagramScenesP';
import { VocabularyMeaningDiagram as RendererQ } from './diagrams/VocabularyDiagramScenesQ';
import { VocabularyMeaningDiagram as RendererR } from './diagrams/VocabularyDiagramScenesR';
import { VocabularyMeaningDiagram as RendererS } from './diagrams/VocabularyDiagramScenesS';
import { VocabularyMeaningDiagram as RendererT } from './diagrams/VocabularyDiagramScenesT';
import { VocabularyMeaningDiagram as RendererU } from './diagrams/VocabularyDiagramScenesU';
import { VocabularyMeaningDiagram as RendererV } from './diagrams/VocabularyDiagramScenesV';
import { VocabularyMeaningDiagram as RendererW } from './diagrams/VocabularyDiagramScenesW';

const renderers = { a: RendererA, b: RendererB, c: RendererC, d: RendererD, e: RendererE, f: RendererF, g: RendererG, i: RendererI, k: RendererK, l: RendererL, m: RendererM, n: RendererN, o: RendererO, p: RendererP, q: RendererQ, r: RendererR, s: RendererS, t: RendererT, u: RendererU, v: RendererV, w: RendererW };

/** Synchronous composition entry; optional UI loads individual packs through diagramLoader. */
export function VocabularyMeaningDiagram({ diagram }: { diagram: VocabularySenseDiagram }) {
  const id = getVocabularyDiagramPackId(diagram.kind);
  const Renderer = id ? renderers[id] : undefined;
  return Renderer ? <Renderer diagram={diagram} /> : null;
}
