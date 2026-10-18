import type { VocabularySenseDiagram } from '../../../domain/vocabulary/media';
import { VocabularyDiagramFrame, Arrow, Box, Label, blue, gold, green } from './VocabularyDiagramPrimitives';

const descriptions: Record<string, [string, string]> = {
  "grasp-hold": ["A hand takes a firm hold of a handrail","The physical hold illustrates grasped the handrail. The diagram does not represent understanding an explanation."],
  "grasp-understand": ["The pump’s operation becomes understood","The how clause concerns understanding operation after seeing a diagram. It does not require physically holding the pump."],
  "grasp-opportunity": ["An opportunity is acted on by applying","Applying that evening illustrates seizing the chance. The result of the application is not stated."],
  "grasp-grip": ["A rope slips out of a physical hold","Grasp is the noun for the hold that is lost. It does not describe understanding a method."],
  "grasp-knowledge": ["A good grasp of statistics is understanding","The example explicitly says she can explain the results. The noun grasp concerns understanding of a subject."],
  "grasp-reach": ["A high shelf is beyond the child’s reach","The shelf is physically outside reach. The diagram illustrates the physical example, without excluding figurative uses of within one’s grasp."],
  'ground-coffee': ['Whole coffee beans being ground into small particles', 'Ground coffee consists of beans reduced to small particles by grinding.'],
};
function Scene({ kind }: { kind: string }) {
  switch (kind) {
    case "grasp-hold": return <><path d="M55 127H465" stroke={blue} strokeWidth="19" strokeLinecap="round"/><path d="M185 241V155Q180 119 196 118Q209 116 214 146V89Q214 66 227 68Q240 70 240 91V141V81Q240 61 254 62Q268 63 268 83V141V91Q268 72 281 74Q294 76 294 96V146V113Q294 94 308 98Q321 101 319 124L312 211L302 241" fill="none" stroke={green} strokeWidth="7" strokeLinejoin="round"/><Label x={260} y={307}>Grasp the handrail</Label></>;
    case "grasp-understand": return <><Box x={25} y={83} width={215} label="Pump diagram" sub="See an explanation"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={83} width={210} label="He grasps how" sub="Understands operation" color={green}/><Label x={260} y={280}>An intellectual grasp</Label></>;
    case "grasp-opportunity": return <><Box x={25} y={83} width={215} label="Study abroad" sub="A chance is offered"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={83} width={210} label="She applies" sub="Acts that evening" color={green}/><Label x={260} y={280}>Action ≠ guaranteed admission</Label></>;
    case "grasp-grip": return <><Box x={25} y={75} width={215} label="Before" sub="Rope held"/><Arrow x1={250} y1={114} x2={275} y2={114}/><Box x={285} y={75} width={210} label="After" sub="Rope slips out" color={gold}/><path d="M65 198H199M321 195Q345 201 357 220T401 247" fill="none" stroke={blue} strokeWidth="8"/><Label x={260} y={307}>The grasp: a hold on the rope</Label></>;
    case "grasp-knowledge": return <><Box x={25} y={83} width={215} label="Basic statistics" sub="Subject knowledge"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={83} width={210} label="A good grasp" sub="Can explain results" color={green}/><Label x={260} y={280}>Understanding of a subject</Label></>;
    case "grasp-reach": return <><path d="M270 58H475" stroke={blue} strokeWidth="10"/><circle cx="170" cy="155" r="27" fill="none" stroke={green} strokeWidth="4"/><path d="M170 182V257M170 199L234 107M170 202L127 230M170 257L136 309M170 257L205 309" fill="none" stroke={green} strokeWidth="5"/><path d="M246 97L265 66" className="meaning-diagram-line" strokeDasharray="5 6"/><Label x={374} y={110} small>Top shelf</Label><Label x={366} y={242}>Beyond reach</Label></>;
    case 'ground-coffee': return <><Label x={260} y={42}>Ground coffee</Label>{[0,1,2].map(i=><g key={i} transform={`translate(${74+i%2*54} ${113+Math.floor(i/2)*60}) rotate(-25)`}><ellipse cx={0} cy={0} rx={17} ry={25} fill={gold} fillOpacity=".65" stroke={gold} strokeWidth={2} /><path d="M0 -20Q-8 0 0 20" className="meaning-diagram-line" /></g>)}<Arrow x1={181} y1={159} x2={312} y2={159} /><Label x={248} y={128} small>Grind</Label>{Array.from({length:24},(_,i)=><circle key={i} cx={350+i%6*18} cy={117+Math.floor(i/6)*24+(i%2)*6} r={4+(i%3)} fill={gold} />)}<Label x={107} y={271}>Whole beans</Label><Label x={395} y={271}>Small particles</Label><Label x={260} y={322} small>Grind → ground → ground</Label></>;
    default: return null;
  }
}
export function VocabularyMeaningDiagram({ diagram }: { diagram: VocabularySenseDiagram }) {
  const description = descriptions[diagram.kind];
  if (!description) return null;
  return <VocabularyDiagramFrame diagram={diagram} description={description}><Scene kind={diagram.kind} /></VocabularyDiagramFrame>;
}
