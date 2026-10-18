import type { ReactElement } from 'react';
import type { VocabularySenseDiagram } from '../../domain/vocabulary/media';

export type VocabularyDiagramRenderer = (props: { diagram: VocabularySenseDiagram }) => ReactElement | null;
export type VocabularyDiagramModule = { VocabularyMeaningDiagram: VocabularyDiagramRenderer };
export type VocabularyDiagramPack = { id: string; moduleName: string; load: () => Promise<VocabularyDiagramModule> };
