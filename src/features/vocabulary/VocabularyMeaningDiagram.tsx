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
