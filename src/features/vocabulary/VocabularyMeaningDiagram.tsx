import type { ReactNode } from 'react';
import type { VocabularySenseDiagram } from '../../domain/vocabulary/media';

const blue = '#78a9c4', green = '#83ad91', gold = '#cfac6d';
const descriptions: Record<string, [string, string]> = {
  'air-flow': ['Warm air moving upwards from a heater', 'Warm air rises from the heater, creating an air current.'],
  'water-flow': ['Water flowing downstream in one direction', 'A current carries water downstream.'],
  'electric-current': ['Positive charge flowing along a wire', 'Conventional current follows the direction of positive charge flow.'],
  'present-time': ['A timeline highlighting the present', 'Current refers to what exists or happens now.'],
  'loan-interest': ['A one-year loan with five per cent simple interest', 'Example: £1,000 × 5% × 1 year = £50 interest.'],
  'ownership-share': ['One quarter ownership of a company', 'Example: a 25% interest is a one-quarter ownership stake.'],
  'production-rate': ['Fifty bottles produced per minute', 'Example: 50 bottles ÷ 1 minute = 50 bottles per minute.'],
  'hourly-pay': ['Three hours of work paid at fifteen pounds per hour', 'Example: £15 per hour × 3 hours = £45 pay.'],
  'growth-rate': ['Population increasing from one hundred to one hundred and ten in one year', 'Example: (110 − 100) ÷ 100 = 10% growth in one year.'],
  'business-capital': ['Business funds used for equipment and premises', 'Capital provides the resources needed to start or operate a business.'],
  'government-city': ['A government building marking a capital city on a map', 'A capital serves as a seat of government. It need not be the largest city.'],
  uppercase: ['Lowercase a beside uppercase A', 'A is a capital letter; a is lowercase.'],
  'financial-bank': ['A bank accepting savings and offering loans', 'A bank accepts deposits and provides loans and other financial services.'],
  'river-bank': ['Land beside a flowing river', 'The banks are the land along the sides of the river.'],
  'delivery-fee': ['An item price plus a delivery charge giving a total', 'Example: a £20 item + a £5 delivery charge = £25 total.'],
  'electric-charge': ['A proton with positive charge and an electron with negative charge', 'A proton has charge +e; an electron has charge −e.'],
  responsibility: ['A manager responsible for a team and project', 'The manager is in charge of the team and the project.'],
  'financial-record': ['Income and spending recorded in financial accounts', 'Accounts record money received and spent; they are different from a bank account.'],
  'account-balance': ['A bank account balance after a deposit and a withdrawal', 'Example: £100 starting balance + £50 deposited − £20 withdrawn = £130.'],
  'model-states': ['A process moving between working and failed states', 'Working and failed are two possible states. Arrows show transitions, without specifying probabilities.'],
  'physical-matter': ['Particles shown as a solid, liquid and gas', 'Matter is physical substance. Solid, liquid and gas are three common states of matter.'],
  'lightness-scale': ['Five shades from light to dark', 'Value describes lightness or darkness. Hue describes colour type.'],
  'variable-value': ['The variable x assigned three and the expression two times x evaluated as six', 'Example: when x = 3, the value of 2 × x is 6.'],
  'form-field': ['An application form with its email field highlighted', 'A form contains multiple fields. Each field asks for one item of information.'],
  'database-field': ['A database table with the email field highlighted across two records', 'In a table, a field is represented by a column; a record is one row of related values.'],
  'word-forms': ['Go with the grammatical forms goes and went', 'Go, goes and went are forms of the same verb. Went is its past-tense form.'],
  'periodical-issue': ['Three monthly journal issues grouped within one volume', 'An issue is one dated instalment. A journal volume usually contains several issues.'],
  'passive-subject': ['Active and passive sentences with different subjects but the same agent', 'Sam is the agent in both sentences. In the passive sentence, the window is the grammatical subject.'],
  'formula-subject': ['A perimeter formula rearranged to make w the subject', 'Making w the subject isolates it: P = 2(l + w) becomes w = P/2 − l.'],
};
function Label({ x, y, children, small = false }: { x: number; y: number; children: ReactNode; small?: boolean }) {
  return <text x={x} y={y} textAnchor="middle" className={small ? 'meaning-diagram-small' : 'meaning-diagram-label'}>{children}</text>;
}
function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const angle = Math.atan2(y2-y1, x2-x1), length = 12;
  return <g className="meaning-diagram-line"><path d={`M${x1} ${y1}L${x2} ${y2}`} /><path d={`M${x2-length*Math.cos(angle-.5)} ${y2-length*Math.sin(angle-.5)}L${x2} ${y2}L${x2-length*Math.cos(angle+.5)} ${y2-length*Math.sin(angle+.5)}`} /></g>;
}
function Box({ x, y, width = 160, label, sub, color = blue }: { x: number; y: number; width?: number; label: string; sub?: string; color?: string }) {
  return <g><rect x={x} y={y} width={width} height="78" rx="13" fill={color} fillOpacity=".2" stroke={color} strokeWidth="2" /><Label x={x+width/2} y={y+(sub?33:46)}>{label}</Label>{sub ? <Label x={x+width/2} y={y+58} small>{sub}</Label> : null}</g>;
}
function Building({ x = 190, y = 95, label = 'BANK' }: { x?: number; y?: number; label?: string }) {
  return <g><path d={`M${x} ${y+42}L${x+70} ${y}L${x+140} ${y+42}Z`} fill={gold} /><path d={`M${x+8} ${y+48}H${x+132}V${y+146}H${x+8}Z`} fill={blue} fillOpacity=".25" stroke={blue} strokeWidth="3" />{[28,64,100].map(offset=><rect key={offset} x={x+offset} y={y+72} width="14" height="64" rx="3" fill={blue} />)}<Label x={x+70} y={y+66} small>{label}</Label></g>;
}
function Scene({ kind }: { kind: string }): ReactNode {
  switch (kind) {
    case 'form-field': return <><Label x={260} y={42}>Application form</Label><rect x={55} y={65} width={410} height={252} rx={14} className="meaning-diagram-line" /><Label x={130} y={104} small>Name</Label><rect x={80} y={117} width={360} height={49} rx={8} fill={blue} fillOpacity=".12" /><Label x={130} y={206} small>Email</Label><rect x={80} y={219} width={360} height={58} rx={8} fill={green} fillOpacity=".2" stroke={green} strokeWidth={3} /><Label x={260} y={256}>Email field</Label></>;
    case 'database-field': return <><Label x={260} y={42}>Customer records</Label><rect x={195} y={84} width={278} height={191} rx={9} fill={green} fillOpacity=".2" stroke={green} strokeWidth={2} /><path d="M45 145H473M45 210H473" className="meaning-diagram-line" /><Label x={120} y={121}>Name</Label><Label x={334} y={121}>Email</Label><Label x={120} y={185}>Maya</Label><Label x={334} y={185} small>maya@example.org</Label><Label x={120} y={250}>Leo</Label><Label x={334} y={250} small>leo@example.org</Label><Label x={334} y={316}>One field (column)</Label></>;
    case 'word-forms': return <><Box x={170} y={34} width={180} label="go" sub="Base form" /><Arrow x1={218} y1={137} x2={132} y2={208} /><Arrow x1={302} y1={137} x2={388} y2={208} /><Box x={40} y={238} width={180} label="goes" sub="3rd-person present" color={green} /><Box x={300} y={238} width={180} label="went" sub="Past tense" color={gold} /></>;
    case 'periodical-issue': return <><Label x={260} y={42}>Journal · Volume 12</Label>{['June','July','August'].map((month,i)=><g key={month}><rect x={35+i*165} y={89} width={120} height={173} rx={9} fill={i===1?green:blue} fillOpacity=".2" stroke={i===1?green:blue} strokeWidth={2} /><Label x={95+i*165} y={139}>{month}</Label><path d={`M${58+i*165} 164h74m-74 20h74m-74 20h50`} className="meaning-diagram-line" /><Label x={95+i*165} y={242} small>Issue {6+i}</Label></g>)}<Label x={260} y={315}>One instalment = one issue</Label></>;
    case 'passive-subject': return <><Box x={28} y={39} width={152} label="Sam" sub="Subject" color={green} /><Box x={204} y={39} width={288} label="broke the window" sub="Active" /><Arrow x1={260} y1={143} x2={260} y2={202} /><Box x={28} y={226} width={200} label="The window" sub="Subject" color={gold} /><Box x={252} y={226} width={240} label="was broken by Sam" sub="Passive" /><Label x={260} y={337} small>Sam is the agent in both.</Label></>;
    case 'formula-subject': return <><Box x={80} y={42} width={360} label="P = 2(l + w)" sub="Rectangle perimeter" /><Arrow x1={260} y1={145} x2={260} y2={199} /><Box x={80} y={223} width={360} label="w = P/2 − l" sub="w is the subject" color={green} /></>;
    case 'financial-record': return <><Label x={260} y={44}>Financial accounts</Label><Box x={38} y={100} width={200} label="Income: £200" sub="Money received" color={green} /><Box x={282} y={100} width={200} label="Costs: £80" sub="Money spent" color={gold} /><Arrow x1={138} y1={203} x2={208} y2={256} /><Arrow x1={382} y1={203} x2={312} y2={256} /><Label x={260} y={300}>Record transactions</Label></>;
    case 'account-balance': return <><Label x={260} y={44}>Bank account</Label><Box x={155} y={74} width={210} label="£100 at start" /><Label x={260} y={201}>+ £50 in − £20 out</Label><Arrow x1={260} y1={222} x2={260} y2={249} /><Box x={145} y={265} width={230} label="£130 balance" color={green} /></>;
    case 'model-states': return <><Box x={28} y={130} width={180} label="Working" color={green} /><Box x={312} y={130} width={180} label="Failed" color={gold} /><path d="M118 115V65H402V115" className="meaning-diagram-line" /><Arrow x1={402} y1={92} x2={402} y2={120} /><Label x={260} y={42}>Failure</Label><path d="M402 226V278H118V226" className="meaning-diagram-line" /><Arrow x1={118} y1={254} x2={118} y2={223} /><Label x={260} y={319}>Repair</Label></>;
    case 'physical-matter': return <>{[85,260,435].map((cx,i)=><g key={cx}><rect x={cx-72} y={70} width={144} height={186} rx={16} className="visual-scene-background" />{Array.from({length:9},(_,j)=>{const x=i===0?cx-27+(j%3)*27:i===1?cx-36+(j%3)*33+(j%2)*10:cx-47+(j%3)*47;const y=i===0?169+Math.floor(j/3)*27:i===1?158+Math.floor(j/3)*29+(j%2)*8:98+Math.floor(j/3)*60+(j%2)*9;return <circle key={j} cx={x} cy={y} r={9} fill={i===0?blue:i===1?green:gold} />;})}<Label x={cx} y={300}>{['Solid','Liquid','Gas'][i]}</Label></g>)}</>;
    case 'lightness-scale': return <><Label x={260} y={52}>Value in art</Label>{['#f2f2f2','#bebebe','#868686','#4d4d4d','#171717'].map((fill,i)=><rect key={fill} x={40+i*88} y={104} width={88} height={120} fill={fill} stroke={blue} strokeWidth={1} />)}<Label x={84} y={266}>Light</Label><Label x={436} y={266}>Dark</Label><Arrow x1={100} y1={302} x2={420} y2={302} /></>;
    case 'variable-value': return <><Box x={150} y={48} width={220} label="x = 3" sub="Assigned value" /><Arrow x1={260} y1={148} x2={260} y2={197} /><Box x={80} y={220} width={360} label="2 × x = 2 × 3 = 6" sub="Value of the expression" color={green} /></>;
    case 'air-flow': return <><Box x={175} y={230} width={170} label="Heater" color={gold} />{[200,260,320].map(x=><g key={x}><path d={`M${x} 210q-26-36 0-72t0-66`} className="meaning-diagram-line" /><Arrow x1={x} y1={84} x2={x} y2={57} /></g>)}<Label x={260} y={34}>Warm air current</Label></>;
    case 'water-flow': return <><path d="M1 105Q130 75 260 110T519 100V258Q390 280 260 245T1 260Z" fill={blue} fillOpacity=".3" />{[130,260,390].map(x=><Arrow key={x} x1={x-40} y1={180} x2={x+40} y2={180} />)}<Label x={260} y={64}>Flowing water</Label><Label x={260} y={307}>Downstream →</Label></>;
    case 'electric-current': return <><rect x="36" y="128" width="448" height="70" rx="20" fill={blue} fillOpacity=".22" />{[105,208,311,414].map(x=><g key={x}><circle cx={x} cy="163" r="18" fill={gold} /><Label x={x} y={170}>+</Label></g>)}<Arrow x1={115} y1={245} x2={405} y2={245} /><Label x={260} y={70}>Positive charge flow</Label><Label x={260} y={292}>Conventional current</Label></>;
    case 'present-time': return <><Arrow x1={55} y1={178} x2={465} y2={178} /><circle cx="260" cy="178" r="24" fill={green} /><path d="M260 79V147M260 209V270" stroke={green} strokeWidth="3" strokeDasharray="6 7" /><Label x={92} y={227}>Past</Label><Label x={260} y={58}>CURRENT</Label><Label x={260} y={302}>Now</Label><Label x={425} y={227}>Future</Label></>;
    case 'loan-interest': return <><Box x={45} y={63} label="£1,000" sub="Principal" /><Box x={315} y={63} label="5% per year" sub="Simple interest" color={gold} /><Label x={260} y={113}>×</Label><Arrow x1={260} y1={162} x2={260} y2={201} /><Box x={160} y={223} width={200} label="£50 interest" sub="After 1 year" color={green} /></>;
    case 'ownership-share': return <><circle cx="260" cy="151" r="94" fill={blue} fillOpacity=".3" /><path d="M260 151V57A94 94 0 0 1 354 151Z" fill={gold} /><Label x={303} y={111} small>25%</Label><Label x={260} y={291}>A one-quarter stake</Label></>;
    case 'production-rate': return <><Box x={40} y={80} label="50 bottles" /><Box x={320} y={80} label="1 minute" color={gold} /><Label x={260} y={128}>÷</Label><Arrow x1={260} y1={178} x2={260} y2={217} /><Box x={105} y={237} width={310} label="50 bottles / minute" color={green} /></>;
    case 'hourly-pay': return <><Box x={35} y={80} width={180} label="£15 / hour" /><Box x={325} y={80} label="3 hours" color={gold} /><Label x={270} y={128}>×</Label><Arrow x1={260} y1={180} x2={260} y2={217} /><Box x={155} y={235} width={210} label="£45 pay" color={green} /></>;
    case 'growth-rate': return <><path d="M80 62V266H444" className="meaning-diagram-line" /><rect x="128" y="126" width="85" height="140" rx="4" fill={blue} /><rect x="308" y="112" width="85" height="154" rx="4" fill={green} /><Label x={170} y={104}>100</Label><Label x={350} y={89}>110</Label><Label x={170} y={299} small>Year 1</Label><Label x={350} y={299} small>Year 2</Label><Arrow x1={215} y1={63} x2={304} y2={63} /><Label x={260} y={38}>+10%</Label></>;
    case 'business-capital': return <><Box x={170} y={40} width={180} label="Business funds" color={gold} /><Arrow x1={224} y1={135} x2={139} y2={204} /><Arrow x1={296} y1={135} x2={381} y2={204} /><Box x={38} y={229} width={200} label="Equipment" /><Box x={282} y={229} width={200} label="Premises" color={green} /></>;
    case 'government-city': return <><path d="M89 100L168 58L245 82L329 48L429 123L406 234L312 289L215 258L125 290L69 205Z" fill={green} fillOpacity=".18" stroke={green} strokeWidth="3" /><Building x={190} y={97} label="GOVERNMENT" /><circle cx="260" cy="270" r="9" fill={gold} /><Label x={260} y={323}>Capital city</Label></>;
    case 'uppercase': return <><text x="151" y="205" textAnchor="middle" className="meaning-diagram-letter">a</text><text x="369" y="205" textAnchor="middle" className="meaning-diagram-letter">A</text><Arrow x1={229} y1={166} x2={288} y2={166} /><Label x={151} y={274}>Lowercase</Label><Label x={369} y={274}>Capital</Label></>;
    case 'financial-bank': return <><Building y={85} /><Box x={23} y={255} width={185} label="Deposits" color={green} /><Box x={312} y={255} width={185} label="Loans" color={gold} /><Arrow x1={111} y1={233} x2={176} y2={184} /><Arrow x1={344} y1={184} x2={409} y2={233} /><Label x={260} y={48}>Financial services</Label></>;
    case 'river-bank': return <><path d="M0 60H520V290H0Z" fill={green} fillOpacity=".2" /><path d="M192 60Q278 140 218 216T225 290H342Q285 219 345 161T313 60Z" fill={blue} fillOpacity=".6" /><Label x={93} y={148}>Bank</Label><Label x={428} y={220}>Bank</Label><Arrow x1={100} y1={168} x2={195} y2={191} /><Arrow x1={423} y1={185} x2={341} y2={160} /><Arrow x1={267} y1={133} x2={267} y2={210} /><Label x={260} y={327}>River</Label></>;
    case 'delivery-fee': return <><Box x={42} y={63} label="£20 item" /><Box x={318} y={63} label="£5 delivery" sub="Charge" color={gold} /><Label x={260} y={111}>+</Label><Arrow x1={260} y1={164} x2={260} y2={207} /><Box x={155} y={231} width={210} label="£25 total" color={green} /></>;
    case 'electric-charge': return <><circle cx="145" cy="150" r="65" fill={gold} fillOpacity=".3" stroke={gold} strokeWidth="3" /><circle cx="375" cy="150" r="65" fill={blue} fillOpacity=".3" stroke={blue} strokeWidth="3" /><Label x={145} y={160}>+e</Label><Label x={375} y={160}>−e</Label><Label x={145} y={258}>Proton</Label><Label x={375} y={258}>Electron</Label><Label x={145} y={290} small>Positive charge</Label><Label x={375} y={290} small>Negative charge</Label></>;
    case 'responsibility': return <><Box x={170} y={48} width={180} label="Manager" color={gold} /><Arrow x1={214} y1={143} x2={133} y2={216} /><Arrow x1={306} y1={143} x2={387} y2={216} /><Label x={260} y={176} small>In charge of</Label><Box x={45} y={239} label="Team" /><Box x={315} y={239} label="Project" color={green} /></>;
    default: return null;
  }
}
export function VocabularyMeaningDiagram({ diagram }: { diagram: VocabularySenseDiagram }) {
  const description = descriptions[diagram.kind];
  if (!description) return null;
  return <figure className="vocabulary-learning-visual">
    <svg viewBox="0 0 520 350" role="img" aria-label={`${diagram.term}: ${description[0]}`}>
      <rect className="visual-scene-background" x="1" y="1" width="518" height="348" rx="16" />
      <Scene kind={diagram.kind} />
    </svg>
    <figcaption>Illustrative diagram · {description[1]}</figcaption>
  </figure>;
}
