import type { ResolvedVocabularyLearningContext } from './context';
import { getVocabularyIllustration, getVocabularySenseDiagram, getVocabularyVisualConcept } from './media';

// Reviewed for information carried by position, scale, structure or visible motion.
// Other diagrams remain available as supplementary material, not rejected content.
// Primitive counts and learning priority deliberately do not determine this policy.
const inlineDiagramKinds = new Set([
  'air-flow', 'water-flow', 'river-bank', 'river-banks', 'raise-rise',
  'numerical-rise', 'step-rise', 'geometric-point', 'percentage-points',
  'compass-point', 'railway-points', 'sound-medium', 'coastal-sound', 'water-sounding',
  'spring-arch', 'spring-leap', 'spring-water', 'spring-tides', 'spring-device',
  'spring-mooring', 'spring-resilience', 'proportional-scaling',
  'gain-increase', 'gain-catchup', 'gain-weight', 'gain-acquisition', 'gain-notch',
]);

export function getVocabularyVisualPresentation(resolved: ResolvedVocabularyLearningContext): 'inline' | 'supplementary' | 'none' {
  if (getVocabularyIllustration(resolved)) return 'inline';
  const diagram = getVocabularySenseDiagram(resolved);
  if (diagram) return inlineDiagramKinds.has(diagram.kind) ? 'inline' : 'supplementary';
  return getVocabularyVisualConcept(resolved) ? 'inline' : 'none';
}
