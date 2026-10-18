import type { VocabularySenseDiagram } from '../../../domain/vocabulary/media';
import { VocabularyDiagramFrame, Arrow, Box, Label, blue, gold, green } from './VocabularyDiagramPrimitives';

const descriptions: Record<string, [string, string]> = {
  "wish-desire": ["A desire to study abroad","She wishes to study abroad in the noun example. The desire alone does not establish an application, admission or completed study."],
  "wish-expression": ["A birthday custom invites an expression of desire","Make a wish before blowing out candles is an instruction within a custom. It does not show that a wish is fulfilled or that magic works."],
  "wish-object": ["A seaside home is the thing desired","The complement identifies the object of the wish. No purchase or move is established."],
  "wish-want": ["A date change depends on the person’s preference","In if you wish it, it refers to changing the date. The sentence offers a possible change rather than reporting a completed one."],
  "wish-for": ["Peace is a desired outcome of a dispute","Wish for introduces the desired outcome. The diagram does not predict that it must happen."],
  "wish-recipient": ["A good wish is directed towards a new employee","We wish you every success expresses goodwill towards the recipient. It does not certify an achieved result."],
  "wish-to": ["A speaker requests to speak to a manager","Wish to + base verb names an activity the speaker wants. The conversation is requested and not yet shown as completed."],
};
function Scene({ kind }: { kind: string }) {
  switch (kind) {
    case "wish-desire": return <><Box x={25} y={83} width={215} label="Her wish" sub="Strong desire"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={83} width={210} label="Study abroad" sub="Desired activity" color={green}/><Label x={260} y={280}>Desire ≠ admission</Label></>;
    case "wish-expression": return <><path d="M110 209H410V269H110ZM149 209V157M222 209V157M296 209V157M370 209V157" fill="none" stroke={blue} strokeWidth="4"/>{[149,222,296,370].map(x=><path key={x} d={`M${x} 143Q${x-12} 127 ${x} 112Q${x+12} 127 ${x} 143`} fill={gold}/>)}<Label x={260} y={51}>Make a wish</Label><Label x={260} y={89} small>Express a desire before the candles</Label><Label x={260} y={324} small>A custom does not guarantee fulfilment</Label></>;
    case "wish-object": return <><path d="M90 189V109L170 51L250 109V189ZM146 189V140H191V189" fill="none" stroke={blue} strokeWidth="4"/><path d="M283 113Q318 96 353 113T423 113T493 113M283 151Q318 134 353 151T423 151T493 151" fill="none" stroke={green} strokeWidth="4"/><Label x={260} y={244}>A home near the sea</Label><Label x={260} y={287} small>The desired thing</Label><Label x={260} y={330} small>Ownership is not stated</Label></>;
    case "wish-want": return <><Box x={25} y={83} width={215} label="If you wish it" sub="If you want it"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={83} width={210} label="Change the date" sub="Offered possibility" color={green}/><Label x={260} y={280}>A preference, not a report</Label></>;
    case "wish-for": return <><Box x={25} y={83} width={215} label="We wish for" sub="Desire an outcome"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={83} width={210} label="Peaceful end" sub="To the dispute" color={green}/><Label x={260} y={280}>Desire ≠ guarantee</Label></>;
    case "wish-recipient": return <><Box x={25} y={83} width={215} label="We wish you" sub="Recipient of goodwill"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={83} width={210} label="Every success" sub="In your new job" color={green}/><Label x={260} y={280}>Goodwill ≠ completed success</Label></>;
    case "wish-to": return <><Box x={25} y={83} width={215} label="I wish to speak" sub="Formal request"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={83} width={210} label="The manager" sub="Requested recipient" color={green}/><Label x={260} y={280}>Requested activity</Label></>;
    default: return null;
  }
}
export function VocabularyMeaningDiagram({ diagram }: { diagram: VocabularySenseDiagram }) {
  const description = descriptions[diagram.kind];
  if (!description) return null;
  return <VocabularyDiagramFrame diagram={diagram} description={description}><Scene kind={diagram.kind} /></VocabularyDiagramFrame>;
}
