import type { VocabularySenseDiagram } from '../../../domain/vocabulary/media';
import { VocabularyDiagramFrame, Arrow, Box, Label, blue, gold, green } from './VocabularyDiagramPrimitives';

const descriptions: Record<string, [string, string]> = {
  "view-picture": ["A harbour represented within a painted picture","The framed scene is an artist’s representation. View can separately denote the real scenery."],
  "view-database": ["An active-accounts query defines a logical table","The diagram illustrates an ordinary database view rather than a materialized copy. The active filter is specific to the example."],
  "view-interface": ["A search interface contains an input and results","The view is the visible interactive part of a program. No particular database architecture is implied."],
  "view-look": ["People look at a flat before deciding whether to rent it","Viewing establishes a look at the property. It does not establish a completed rental agreement."],
  "view-interpret": ["A delay interpreted as a chance to revise a plan","View as attributes an interpretation to the people in the example. It is not a physical property of the delay."],
  "view-seeing": ["An observer moves to see a demonstration more clearly","This view concerns seeing. Movement changes access to the scene rather than proving a judgement about its quality."],
  "view-range": ["A wall blocks the observer’s view of a cyclist","The wall limits the observer’s visible range. The cyclist may continue moving behind it."],
  "view-scenery": ["A room’s window opens onto a river scene","This view is the visible scenery beyond the window. It is distinct from a painting of the scenery."],
  "view-count": ["Two viewers contribute three counted viewing events","Viewer A has two events and viewer B one, totalling three views. View counts and unique viewer counts need not match."],
  "view-mental": ["A briefing clarifies a mental conception of an arrangement","The clearer view concerns understanding how parts fit together. It is not a change in physical eyesight."],
  "view-opinion": ["A speaker favours later library opening hours","The view states what the speaker thinks should happen. It does not report current opening hours."],
  "view-perspective": ["Residents assess the expected access effect of a plan","In their view attributes the assessment to the residents. Would concerns the proposed plan, not a completed improvement."],
  "view-intention": ["Saving is directed towards an intended home purchase","With a view to identifies an aim. The example does not say that a home has already been bought."],
  'lightness-scale': ['Five shades from light to dark', 'Value describes lightness or darkness. Hue describes colour type.'],
  'variable-value': ['The variable x assigned three and the expression two times x evaluated as six', 'Example: when x = 3, the value of 2 × x is 6.'],
};
function Scene({ kind }: { kind: string }) {
  switch (kind) {
    case "view-picture": return <><rect x="72" y="40" width="376" height="206" fill="none" stroke={gold} strokeWidth="9"/><path d="M92 164H428M128 161V104H198V161M287 162L323 133L360 162Z" fill="none" stroke={blue} strokeWidth="4"/><path d="M99 196Q150 175 200 196T300 196T421 196" fill="none" stroke={green} strokeWidth="4"/><Label x={260} y={301}>A painted harbour view</Label></>;
    case "view-database": return <><Box x={15} y={80} width={145} label="Accounts" sub="Base records"/><Arrow x1={168} y1={126} x2={182} y2={126}/><Box x={190} y={80} width={145} label="Query" sub="Active only" color={gold}/><Arrow x1={343} y1={126} x2={357} y2={126}/><Box x={365} y={80} width={140} label="View" sub="Logical table" color={green}/><Label x={260} y={281}>A query-defined result</Label></>;
    case "view-interface": return <><rect x="60" y="39" width="400" height="210" rx="10" fill="none" stroke={blue} strokeWidth="4"/><rect x="88" y="70" width="344" height="53" rx="6" fill="none" stroke={green} strokeWidth="3"/><Label x={260} y={103}>Search text box</Label><path d="M95 162H423M95 198H374" className="meaning-diagram-line"/><Label x={260} y={300}>Search view: interface</Label></>;
    case "view-look": return <><Box x={25} y={76} width={215} label="Saturday" sub="Look at the flat"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={76} width={210} label="Decision later" sub="Whether to rent" color={gold}/><Label x={260} y={279}>View before deciding</Label></>;
    case "view-interpret": return <><Box x={25} y={76} width={215} label="Delay" sub="They view it as"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={76} width={210} label="A chance" sub="To revise the plan" color={green}/><Label x={260} y={280}>An interpretation of the delay</Label></>;
    case "view-seeing": return <><Box x={25} y={75} width={215} label="Move a little" sub="Observer changes place"/><Arrow x1={250} y1={121} x2={275} y2={121}/><Box x={285} y={75} width={210} label="Clear view" sub="See the demonstration" color={green}/><Label x={260} y={280}>The act of seeing</Label></>;
    case "view-range": return <><path d="M80 172L260 92V235Z" fill={blue} fillOpacity=".16"/><circle cx="80" cy="172" r="12" fill={blue}/><rect x="260" y="85" width="27" height="163" fill={gold} fillOpacity=".4" stroke={gold}/><circle cx="424" cy="172" r="19" fill="none" stroke={green} strokeWidth="4"/><Label x={90} y={286}>Observer</Label><Label x={274} y={53}>Wall</Label><Label x={425} y={238}>Cyclist</Label><Label x={260} y={329} small>Outside the visible range</Label></>;
    case "view-scenery": return <><rect x="65" y="35" width="390" height="213" fill="none" stroke={gold} strokeWidth="8"/><path d="M260 35V248M65 141H455" fill="none" stroke={gold} strokeWidth="5"/><path d="M86 177Q167 136 252 181T430 177M86 211Q166 172 250 215T430 211" fill="none" stroke={blue} strokeWidth="4"/><Label x={260} y={305}>A river view through a window</Label></>;
    case "view-count": return <><Box x={25} y={73} width={215} label="Viewer A" sub="2 counted views"/><Box x={285} y={73} width={210} label="Viewer B" sub="1 counted view" color={green}/><path d="M130 171L260 214L390 171" className="meaning-diagram-line"/><Label x={260} y={265}>2 + 1 = 3 views</Label><Label x={260} y={309} small>Two distinct viewers in this example</Label></>;
    case "view-mental": return <><Box x={25} y={76} width={215} label="Briefing" sub="More information"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={76} width={210} label="Clearer view" sub="Mental conception" color={green}/><Label x={260} y={280}>How the parts fit together</Label></>;
    case "view-opinion": return <><Box x={25} y={76} width={190} label="My view" sub="A judgement"/><Arrow x1={230} y1={122} x2={275} y2={122}/><Box x={290} y={76} width={205} label="Stay open later" sub="What should happen" color={green}/><Label x={260} y={279}>An opinion about library hours</Label></>;
    case "view-perspective": return <><Box x={25} y={76} width={215} label="Residents" sub="Their perspective"/><Arrow x1={250} y1={122} x2={275} y2={122}/><Box x={285} y={76} width={210} label="The plan" sub="Would improve access" color={green}/><Label x={260} y={279}>An attributed perspective</Label></>;
    case "view-intention": return <><Box x={25} y={76} width={215} label="Saving now" sub="With a view to"/><path d="M250 122H275" className="meaning-diagram-line" strokeDasharray="6 6"/><Box x={285} y={76} width={210} label="Buying a home" sub="Intended aim" color={green}/><Label x={260} y={279}>Purpose rather than completion</Label></>;
    case 'lightness-scale': return <><Label x={260} y={52}>Value in art</Label>{['#f2f2f2','#bebebe','#868686','#4d4d4d','#171717'].map((fill,i)=><rect key={fill} x={40+i*88} y={104} width={88} height={120} fill={fill} stroke={blue} strokeWidth={1} />)}<Label x={84} y={266}>Light</Label><Label x={436} y={266}>Dark</Label><Arrow x1={100} y1={302} x2={420} y2={302} /></>;
    case 'variable-value': return <><Box x={150} y={48} width={220} label="x = 3" sub="Assigned value" /><Arrow x1={260} y1={148} x2={260} y2={197} /><Box x={80} y={220} width={360} label="2 × x = 2 × 3 = 6" sub="Value of the expression" color={green} /></>;
    default: return null;
  }
}
export function VocabularyMeaningDiagram({ diagram }: { diagram: VocabularySenseDiagram }) {
  const description = descriptions[diagram.kind];
  if (!description) return null;
  return <VocabularyDiagramFrame diagram={diagram} description={description}><Scene kind={diagram.kind} /></VocabularyDiagramFrame>;
}
