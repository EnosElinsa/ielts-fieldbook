import type { VocabularySenseDiagram } from '../../../domain/vocabulary/media';
import { VocabularyDiagramFrame, Arrow, Box, Label, green } from './VocabularyDiagramPrimitives';

const descriptions: Record<string, [string, string]> = {
  "question-interrogative": ["A question asks when the library opens","When asks for an opening time. The question does not assert the requested time."],
  "question-topic": ["Funding remains a topic on an agenda","Question of funding names the matter for consideration. It is not necessarily an interrogative sentence and the agenda does not settle it."],
  "question-doubt": ["Evidence brings a report’s accuracy into question","The report’s accuracy is challenged. The phrase alone does not prove the report false."],
  "question-motion": ["A proposal is to be put to a vote","Question is the proposal before the meeting. The chair will put it to a vote; no outcome or completed vote is reported."],
  "question-interview": ["A researcher will ask participants for information","The researcher questions people about their journey. This information-seeking act does not by itself accuse the participants of lying or prove a conclusion."],
  "question-challenge": ["An auditor may doubt the accuracy of figures","May question describes a possible challenge to accuracy. Neither the possibility nor the challenge itself proves an error."],
  "question-inquire": ["Students are encouraged to ask questions freely","Question is an intransitive verb in this sentence and has no direct object. The encouragement does not report that every answer is already known."],
};
function Scene({ kind }: { kind: string }) {
  switch (kind) {
    case "question-interrogative": return <><Box x={25} y={83} width={215} label="When?" sub="Library opening time"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={83} width={210} label="Unknown time" sub="Information requested" color={green}/><Label x={260} y={280}>A question asks for information</Label></>;
    case "question-topic": return <><Box x={25} y={83} width={215} label="Funding" sub="Topic for discussion"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={83} width={210} label="Agenda" sub="Still listed" color={green}/><Label x={260} y={280}>A topic need not be an interrogative</Label></>;
    case "question-doubt": return <><Box x={25} y={83} width={215} label="New evidence" sub="Prompts a challenge"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={83} width={210} label="Report accuracy" sub="Brought into question" color={green}/><Label x={260} y={280}>Doubt alone is not proof of falsity</Label></>;
    case "question-motion": return <><Box x={25} y={83} width={215} label="Question" sub="Proposal before meeting"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={83} width={210} label="Vote" sub="To be held" color={green}/><Label x={260} y={280}>Proposal ≠ result of a vote</Label></>;
    case "question-interview": return <><Box x={25} y={83} width={215} label="Researcher" sub="Will ask"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={83} width={210} label="Participant" sub="About the journey" color={green}/><Label x={260} y={280}>Question someone about something</Label></>;
    case "question-challenge": return <><Box x={25} y={83} width={215} label="Auditor" sub="May doubt"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={83} width={210} label="Figures" sub="Accuracy questioned" color={green}/><Label x={260} y={280}>Possible challenge; not proof</Label></>;
    case "question-inquire": return <><Box x={25} y={83} width={215} label="Students" sub="Should ask"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={83} width={210} label="Discussion" sub="Questions welcome" color={green}/><Label x={260} y={280}>Intransitive: no direct object</Label></>;
    default: return null;
  }
}
export function VocabularyMeaningDiagram({ diagram }: { diagram: VocabularySenseDiagram }) {
  const description = descriptions[diagram.kind];
  if (!description) return null;
  return <VocabularyDiagramFrame diagram={diagram} description={description}><Scene kind={diagram.kind} /></VocabularyDiagramFrame>;
}
