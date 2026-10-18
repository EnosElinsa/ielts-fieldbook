import type { VocabularySenseDiagram } from '../../../domain/vocabulary/media';
import { VocabularyDiagramFrame, Arrow, Box, Label, blue, gold, green } from './VocabularyDiagramPrimitives';

const descriptions: Record<string, [string, string]> = {
  "understand-message": ["Instructions comprehended as a message","The learner can explain what the instructions ask. This illustrates comprehension without implying agreement with every instruction."],
  "understand-task": ["Practical familiarity with a job","The example says she understands the job and can organise the work. Recognition of a job title alone would not establish this ability."],
  "understand-principle": ["Pupils comprehend that water expands when freezing","The diagram identifies the proposition the pupils comprehend. It is not a quantitative model of volume change."],
  "understand-reason": ["A childcare reason explains an early departure","Understanding the person’s reason does not necessarily mean approving of the departure."],
  "understand-infer": ["An unchecked Friday meeting date","The speaker reports Friday as their understanding and explicitly has not checked. The date remains unverified by this example."],
  "understand-implicit": ["An implicit subject in Sit down","The command contains no written you. Grammar supplies the interpreted subject; the diagram does not add a visible word to the original command."],
  "understand-meaning": ["A symbol interpreted by its meaning","The symbol communicates that something is not permitted. Understanding concerns interpreting that message."],
};
function Scene({ kind }: { kind: string }) {
  switch (kind) {
    case "understand-message": return <><Box x={25} y={83} width={215} label="Instructions" sub="What they ask"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={83} width={210} label="I understand" sub="Can explain meaning" color={green}/><Label x={260} y={280}>Comprehension ≠ agreement</Label></>;
    case "understand-task": return <><Box x={25} y={83} width={215} label="Her job" sub="Practical familiarity"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={83} width={210} label="Organise work" sub="Without help" color={green}/><Label x={260} y={280}>Understands the task</Label></>;
    case "understand-principle": return <><Box x={40} y={58} width={440} label="Water expands when it freezes" sub="Principle in the example"/><Arrow x1={260} y1={147} x2={260} y2={183}/><Box x={85} y={198} width={350} label="Pupils understand that" sub="They comprehend the principle" color={green}/></>;
    case "understand-reason": return <><Box x={25} y={83} width={215} label="Collect her child" sub="Stated reason"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={83} width={210} label="Left early" sub="I understand why" color={green}/><Label x={260} y={280}>Understanding ≠ approval</Label></>;
    case "understand-infer": return <><Box x={40} y={59} width={440} label="I understand: Friday" sub="Speaker’s present information"/><path d="M260 151V185" className="meaning-diagram-line" strokeDasharray="6 6"/><Box x={85} y={198} width={350} label="Not checked" sub="No independent confirmation" color={gold}/></>;
    case "understand-implicit": return <><Box x={40} y={51} width={440} label="Sit down" sub="Written command"/><Arrow x1={260} y1={140} x2={260} y2={175}/><rect x="35" y="192" width="190" height="77" rx="13" fill="none" stroke={gold} strokeWidth="3" strokeDasharray="7 6"/><Label x={130} y={224}>you</Label><Label x={130} y={250} small>Implicit subject</Label><Box x={255} y={192} width={225} label="sit down" sub="Written words" color={green}/><Label x={260} y={323} small>Understood ≠ written</Label></>;
    case "understand-meaning": return <><circle cx="132" cy="118" r="68" fill="none" stroke={blue} strokeWidth="5"/><path d="M85 165L179 71" stroke={gold} strokeWidth="7"/><Arrow x1={218} y1={118} x2={267} y2={118}/><Box x={281} y={79} width={214} label="Not permitted" sub="Symbol’s meaning" color={green}/><Label x={260} y={285}>Know what the symbol signifies</Label></>;
    default: return null;
  }
}
export function VocabularyMeaningDiagram({ diagram }: { diagram: VocabularySenseDiagram }) {
  const description = descriptions[diagram.kind];
  if (!description) return null;
  return <VocabularyDiagramFrame diagram={diagram} description={description}><Scene kind={diagram.kind} /></VocabularyDiagramFrame>;
}
