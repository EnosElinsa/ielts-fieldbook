import type { ReactNode } from 'react';
import type { VocabularyVisualConcept } from '../../domain/vocabulary/media';

type DrawnConcept = Exclude<VocabularyVisualConcept, 'pea' | 'carrot' | 'apple' | 'banana' | 'grape' | 'lemon' | 'orange' | 'vegetable' | 'fruit' | 'paste'>;
const descriptions: Record<DrawnConcept, { alt: string; caption: string }> = {
  wheat: { alt: 'Ears of wheat bearing cereal grains', caption: 'Wheat grains grow on ears at the top of the stem.' },
  grain: { alt: 'Cereal grains beside an ear of wheat', caption: 'Grains are the small, hard seeds of cereal plants.' },
  rice: { alt: 'A bowl of rice grains', caption: 'Rice is a cereal grain, shown here ready to cook.' },
  corn: { alt: 'An ear of corn with rows of kernels', caption: 'The kernels are the edible grains on a corn cob.' },
  flour: { alt: 'Grain ground into flour', caption: 'Grain → grinding → flour.' },
  bread: { alt: 'A loaf of bread and a cut slice', caption: 'A loaf of bread with a slice cut from it.' },
  tomato: { alt: 'A tomato and a cross-section showing its seeds', caption: 'A tomato cut open to show its flesh and seeds.' },
  potato: { alt: 'Potato tubers with small eyes on the skin', caption: 'A potato is an underground tuber; its small buds are called eyes.' },
  onion: { alt: 'An onion bulb and a cut half showing concentric layers', caption: 'An onion bulb has overlapping layers.' },
  garlic: { alt: 'A garlic bulb with separate cloves', caption: 'A garlic bulb is made up of individual cloves.' },
  mushroom: { alt: 'Mushroom caps and stalks with gills under a cap', caption: 'The cap and stalk form the visible fruiting body of a mushroom.' },
  egg: { alt: 'An egg and a cut half showing the white and yolk', caption: 'An egg has a shell, white and yolk.' },
  cheese: { alt: 'A wedge of cheese with cut slices', caption: 'A wedge and slices of cheese, a food made from milk.' },
  nut: { alt: 'A nut in its hard shell and the kernel inside', caption: 'The hard shell protects the kernel inside.' },
  fork: { alt: 'A fork with four prongs', caption: 'The prongs of a fork hold pieces of food.' },
  spoon: { alt: 'A spoon with a shallow bowl and a long handle', caption: 'The bowl of a spoon holds food or liquid.' },
  knife: { alt: 'A knife with a cutting blade and handle', caption: 'A knife has a blade for cutting and a handle to hold.' },
  cutlery: { alt: 'A fork, knife and spoon arranged together', caption: 'Cutlery: a fork, knife and spoon.' },
  bowl: { alt: 'A deep round bowl with an open top', caption: 'A bowl is a deep, open container for food.' },
  plate: { alt: 'A shallow plate with a rim', caption: 'A plate is a shallow dish used to serve food.' },
  cup: { alt: 'A drinking cup with a handle', caption: 'A cup holds a drink; its handle helps you hold it.' },
  glass: { alt: 'A drinking glass partly filled with water', caption: 'A glass used as a container for a drink.' },
  kettle: { alt: 'A kettle with a lid, handle and pouring spout', caption: 'A kettle heats water; its spout is used for pouring.' },
  pan: { alt: 'A shallow cooking pan with a long handle', caption: 'A pan has a wide cooking surface and low sides.' },
  pot: { alt: 'A deep cooking pot with two handles', caption: 'A pot has deep sides for cooking food in liquid.' },
  boil: { alt: 'Bubbles rising through heated water in a pot', caption: 'Boiling: bubbles of vapour form throughout a heated liquid.' },
  steam: { alt: 'Steam rising from boiling water to cook food above it', caption: 'Steaming: food cooks above the water in hot steam.' },
  bake: { alt: 'Food cooking inside a heated oven', caption: 'Food cooks in the hot air inside an oven.' },
  fry: { alt: 'Food cooking in a shallow layer of hot oil in a pan', caption: 'Frying: food cooks in hot oil or fat.' },
  slice: { alt: 'A thin slice cut from a loaf of bread', caption: 'A slice is a thin, flat piece cut from something larger.' },
  grind: { alt: 'Coarse pieces crushed into small particles', caption: 'Grinding breaks solid pieces into smaller particles.' },
  evaporate: { alt: 'Liquid changing into gas at its surface', caption: 'Evaporation: liquid → gas at the surface.' },
  condense: { alt: 'Gas changing into drops of liquid', caption: 'Condensation: gas → liquid.' },
  freeze: { alt: 'Liquid changing into a solid as it cools', caption: 'Freezing: liquid → solid as heat is removed.' },
  melt: { alt: 'A solid changing into liquid as it warms', caption: 'Melting: solid → liquid as heat is added.' },
  increase: { alt: 'An amount becoming larger, from three items to eight', caption: 'Increase: an amount or number becomes greater.' },
  decrease: { alt: 'An amount becoming smaller, from eight items to three', caption: 'Decrease: an amount or number becomes smaller.' },
};
export function vocabularyConceptDescription(concept: VocabularyVisualConcept) {
  return descriptions[concept as DrawnConcept];
}

const outline = '#5e7180';
const green = '#638752';
const gold = '#c79b50';
const paleGold = '#edd7a6';
const blue = '#8fb9d0';

function Wheat({ grains = false }: { grains?: boolean }) {
  return <g>
    {[0, 1, 2].map((n) => <g key={n} transform={`translate(${155 + n * 62} ${40 + Math.abs(n - 1) * 18}) rotate(${(n - 1) * 13} 50 200)`}>
      <path d="M50 260V52" fill="none" stroke={gold} strokeWidth="5" />
      {[0, 1, 2, 3, 4].map(i => <g key={i} transform={`translate(50 ${67 + i * 27})`}>
        <ellipse cx="-14" cy="0" rx="12" ry="21" fill={paleGold} stroke={gold} strokeWidth="2" transform="rotate(-40)" />
        <ellipse cx="14" cy="0" rx="12" ry="21" fill={paleGold} stroke={gold} strokeWidth="2" transform="rotate(40)" />
      </g>)}
      <path d="M50 230Q-4 190 13 163Q51 178 50 230M50 253Q95 208 92 187Q57 203 50 253" fill={green} />
    </g>)}
    {grains ? [0, 1, 2, 3, 4, 5].map(i => <ellipse key={i} cx={120 + i * 51} cy={292 + (i % 2) * 9} rx="18" ry="9" transform={`rotate(${i * 15} ${120 + i * 51} ${292 + (i % 2) * 9})`} fill={paleGold} stroke={gold} strokeWidth="2" />) : null}
  </g>;
}
function Bowl({ rice = false }: { rice?: boolean }) {
  return <g><path d="M110 171Q120 282 260 286Q400 282 410 171" fill="#a2b3b0" stroke={outline} strokeWidth="4" /><ellipse cx="260" cy="171" rx="150" ry="47" fill="#e3e9dc" stroke={outline} strokeWidth="4" />
    {rice ? Array.from({ length: 35 }, (_, i) => <ellipse key={i} cx={154 + (i % 7) * 35 + (Math.floor(i / 7) % 2) * 9} cy={146 + Math.floor(i / 7) * 14} rx="12" ry="4" fill="#fff5d9" stroke="#b6ab8f" strokeWidth="1" transform={`rotate(${(i % 3) * 30 - 30} ${154 + (i % 7) * 35} ${146 + Math.floor(i / 7) * 14})`} />) : null}
  </g>;
}
function Bread({ slice = false }: { slice?: boolean }) {
  return <g><path d="M102 245V166Q108 104 195 104H290Q354 112 357 173V245Z" fill="#bb874a" stroke="#805b36" strokeWidth="4" /><path d="M128 163Q161 118 201 125M210 161Q241 118 282 130" fill="none" stroke={paleGold} strokeWidth="8" strokeLinecap="round" /><path d="M300 250V181Q299 136 351 135Q403 135 408 181V250Z" fill={paleGold} stroke="#a7743f" strokeWidth={slice ? 8 : 5} /><path d="M336 253V184Q335 139 387 138Q439 139 444 184V253Z" fill="#ecd5a2" stroke="#a7743f" strokeWidth="5" /><circle cx="365" cy="189" r="5" fill="#ceb17a" /><circle cx="406" cy="214" r="7" fill="#ceb17a" />{slice ? <path d="m354 298 31-28m-31 28h-20m20 0v-20" fill="none" stroke={outline} strokeWidth="4" /> : null}</g>;
}
function Bulb({ garlic = false }: { garlic?: boolean }) {
  return <g><path d="M249 83L239 141Q153 169 160 231Q169 282 260 282Q351 282 360 231Q367 169 281 141L271 83Z" fill={garlic ? '#e1d4b7' : '#cf9b7b'} stroke="#93775d" strokeWidth="4" /><path d="M247 145Q198 209 229 274M271 145Q319 213 290 274M260 145V277" fill="none" stroke="#a98c6b" strokeWidth="3" />{garlic ? <path d="M376 277Q343 238 387 215Q427 233 420 271Z" fill="#f0e5ca" stroke="#a98c6b" strokeWidth="3" /> : <g><ellipse cx="381" cy="244" rx="66" ry="40" fill="#f4e2bc" stroke="#a98c6b" strokeWidth="4" />{[.72,.45,.2].map(s => <ellipse key={s} cx="381" cy="244" rx={66*s} ry={40*s} fill="none" stroke="#ba9777" strokeWidth="3" />)}</g>}</g>;
}
function Utensil({ kind }: { kind: 'fork' | 'spoon' | 'knife' }) {
  return <g fill="#bcc9cc" stroke={outline} strokeWidth="4" strokeLinejoin="round">
    {kind === 'fork' ? <path d="M228 67V131H243V67H253V131H268V67H278V150Q278 170 262 175V285Q255 302 246 285V175Q228 170 228 150Z" /> : kind === 'spoon' ? <><ellipse cx="254" cy="114" rx="38" ry="57" /><path d="M246 167V285Q254 300 262 285V167" /></> : <path d="M235 195V72Q275 89 280 137V195H265V285Q252 298 239 285V195Z" />}
  </g>;
}
function Pot({ pan = false }: { pan?: boolean }) {
  return <g><path d={pan ? 'M112 193H377L360 257Q245 286 131 257Z' : 'M135 157H385V261Q260 297 135 261Z'} fill="#a7b5bc" stroke={outline} strokeWidth="4" /><ellipse cx={pan ? 244 : 260} cy={pan ? 193 : 157} rx={pan ? 132 : 125} ry="28" fill="#d4e1df" stroke={outline} strokeWidth="4" />{pan ? <path d="m374 204 96-37" stroke={outline} strokeWidth="16" strokeLinecap="round" /> : <path d="M135 184H97V226H135M385 184H423V226H385" fill="none" stroke={outline} strokeWidth="9" />}</g>;
}
function RisingSteam() {
  return <g fill="none" stroke={blue} strokeWidth="5" strokeLinecap="round">{[202,260,318].map(x => <path key={x} d={`M${x} 140q-18-18 0-35t0-40`} />)}</g>;
}
function Arrow() {
  return <path d="M238 179H284m-14-14 14 14-14 14" fill="none" stroke={outline} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />;
}
function Particles({ state, x }: { state: 'gas' | 'liquid' | 'solid' | 'coarse' | 'fine'; x: number }) {
  const fine = state === 'fine';
  return <g>
    {state === 'liquid' ? <><path d={`M${x} 110V258H${x+125}V110`} fill="none" stroke={outline} strokeWidth="4" /><path d={`M${x+4} 180q30-12 60 0t57 0v74H${x+4}Z`} fill={blue} /></> : state === 'solid' ? <g fill="#b7d4de" stroke={outline} strokeWidth="3"><path d={`M${x+10} 150l85-32 25 34v89l-85 29-25-34Z`} /><path d={`M${x+10} 150l25 35 85-33M${x+35} 185v85`} fill="none" /></g> : Array.from({ length: fine ? 30 : state === 'gas' ? 8 : 6 }, (_, i) => <circle key={i} cx={x + 12 + (i % (fine ? 6 : 3)) * (fine ? 21 : 48)} cy={(state === 'gas' ? 115 : fine ? 190 : 164) + Math.floor(i / (fine ? 6 : 3)) * (fine ? 17 : 45)} r={fine ? 4 : state === 'coarse' ? 16 : 8} fill={state === 'coarse' || fine ? gold : blue} />)}
  </g>;
}
function Change({ before, after, labels }: { before: Parameters<typeof Particles>[0]['state']; after: Parameters<typeof Particles>[0]['state']; labels: [string, string] }) {
  return <><Particles state={before} x={65} /><Arrow /><Particles state={after} x={330} /><text className="visual-diagram-text" x="126" y="308" textAnchor="middle">{labels[0]}</text><text className="visual-diagram-text" x="392" y="308" textAnchor="middle">{labels[1]}</text></>;
}
function Quantity({ decrease = false }: { decrease?: boolean }) {
  return <>{[decrease ? 8 : 3, decrease ? 3 : 8].map((count, side) => <g key={side}>
    {Array.from({ length: count }, (_, i) => <circle key={i} cx={85 + side * 270 + (i % 3) * 32} cy={119 + Math.floor(i / 3) * 38} r="12" fill={side ? green : blue} />)}
    <text className="visual-diagram-text" x={117 + side * 270} y="269" textAnchor="middle">{side ? 'After' : 'Before'}</text>
  </g>)}<Arrow /></>;
}
function scene(concept: DrawnConcept): ReactNode {
  switch (concept) {
    case 'wheat': case 'grain': return <Wheat grains={concept === 'grain'} />;
    case 'rice': return <Bowl rice />;
    case 'corn': return <g><path d="M225 278Q139 225 158 134Q230 157 240 268M287 278Q371 225 352 134Q287 157 274 268" fill={green} /><path d="M219 262V129Q219 66 260 63Q301 66 301 129V262Z" fill={paleGold} stroke={gold} strokeWidth="4" />{Array.from({ length: 27 }, (_, i) => <ellipse key={i} cx={236 + (i%3)*24} cy={101 + Math.floor(i/3)*19} rx="10" ry="8" fill="#dfb952" stroke={gold} strokeWidth="1" />)}</g>;
    case 'flour': return <Change before="coarse" after="fine" labels={['Grain', 'Flour']} />;
    case 'grind': return <Change before="coarse" after="fine" labels={['Coarse', 'Fine']} />;
    case 'bread': case 'slice': return <Bread slice={concept === 'slice'} />;
    case 'tomato': return <g><circle cx="220" cy="200" r="89" fill="#bd5d4e" stroke="#8e463b" strokeWidth="4" /><path d="m220 123-44-23 36 1 10-28 10 28 38-1-39 25" fill={green} /><ellipse cx="355" cy="248" rx="69" ry="49" fill="#df9a72" stroke="#9a4d3c" strokeWidth="5" />{[0,1,2,3,4,5].map(i => <ellipse key={i} cx={355 + Math.cos(i*Math.PI/3)*36} cy={248 + Math.sin(i*Math.PI/3)*24} rx="7" ry="4" fill="#f3d3a0" />)}</g>;
    case 'potato': return <g>{[0,1].map(i => <g key={i} transform={`translate(${i*130} ${i*43}) rotate(${i*25-18} 200 180)`}><ellipse cx="200" cy="180" rx="82" ry="64" fill="#b69b6f" stroke="#816e4d" strokeWidth="4" />{[[167,160],[204,149],[234,186],[183,211]].map(([x,y]) => <path key={x} d={`m${x-4} ${y}q4-5 8 0`} fill="none" stroke="#816e4d" strokeWidth="3" />)}</g>)}</g>;
    case 'onion': case 'garlic': return <Bulb garlic={concept === 'garlic'} />;
    case 'mushroom': return <g><path d="M236 159 221 282Q260 299 300 282L284 159" fill="#e1d3b5" stroke="#97846b" strokeWidth="4" /><path d="M132 178Q151 78 260 77Q369 78 389 178Z" fill="#ad8560" stroke="#785d45" strokeWidth="4" /><ellipse cx="260" cy="178" rx="128" ry="30" fill="#c6ad86" stroke="#785d45" strokeWidth="4" />{[-75,-45,-15,15,45,75].map(x => <path key={x} d={`M260 172l${x} 24`} stroke="#97846b" strokeWidth="2" />)}</g>;
    case 'egg': return <g><path d="M162 278Q103 245 145 145Q177 74 210 110Q284 218 231 270Q201 294 162 278Z" fill="#dec9a3" stroke="#9d8969" strokeWidth="4" /><ellipse cx="334" cy="228" rx="70" ry="85" fill="#f4f0df" stroke="#9d8969" strokeWidth="4" /><circle cx="334" cy="245" r="39" fill="#d7ae4d" /></g>;
    case 'cheese': return <g fill={paleGold} stroke={gold} strokeWidth="4"><path d="M131 166 334 96 388 193 131 252Z" /><path d="M131 166 334 96 388 126 388 193 131 252Z" /><path d="M131 166 388 126M131 166v86" fill="none" />{[[203,185],[283,181],[339,150]].map(([x,y]) => <ellipse key={x} cx={x} cy={y} rx="13" ry="10" fill={gold} stroke="none" />)}<path d="m242 278 159-35 15 19-156 35Z" /></g>;
    case 'nut': return <g><ellipse cx="207" cy="194" rx="76" ry="89" fill="#a77f54" stroke="#725739" strokeWidth="4" /><path d="M207 107q-21 88 0 175m-38-152q-26 62 0 125m75-121q29 61 1 118" fill="none" stroke="#725739" strokeWidth="4" /><path d="M334 155q-59 43-26 92q24 32 59 0q34-52-7-91q-12 24-26-1Z" fill="#d3ad76" stroke="#967446" strokeWidth="3" /></g>;
    case 'fork': case 'spoon': case 'knife': return <Utensil kind={concept} />;
    case 'cutlery': return <>{(['fork','knife','spoon'] as const).map((kind,i) => <g key={kind} transform={`translate(${(i-1)*115} 0)`}><Utensil kind={kind} /></g>)}</>;
    case 'bowl': return <Bowl />;
    case 'plate': return <g><ellipse cx="260" cy="203" rx="163" ry="90" fill="#c2d0cd" stroke={outline} strokeWidth="4" /><ellipse cx="260" cy="203" rx="116" ry="58" fill="#e3e9dc" stroke={outline} strokeWidth="3" /></g>;
    case 'cup': return <g><path d="M326 156h32q65 0 45 72q-13 30-64 22" fill="none" stroke={outline} strokeWidth="12" /><path d="M149 135H345L327 280Q248 310 168 280Z" fill="#b6c8c3" stroke={outline} strokeWidth="4" /><ellipse cx="247" cy="135" rx="98" ry="31" fill="#e3e9dc" stroke={outline} strokeWidth="4" /></g>;
    case 'glass': return <g><path d="M176 99H344L324 286Q260 303 196 286Z" fill="#b7d4de" fillOpacity=".25" stroke={outline} strokeWidth="4" /><path d="M190 184q70-20 140 0l-10 98q-60 15-120 0Z" fill={blue} /><ellipse cx="260" cy="99" rx="84" ry="17" fill="none" stroke={outline} strokeWidth="4" /></g>;
    case 'kettle': return <g><path d="M196 141q4-88 77-73q49 10 54 79" fill="none" stroke={outline} strokeWidth="13" /><path d="M159 162Q119 273 203 287H325Q390 273 353 162Z" fill="#b8c5c6" stroke={outline} strokeWidth="4" /><path d="m165 187-58-34 22 83 31 18M190 163h140l-20-25h-98Z" fill="#a0b1b8" stroke={outline} strokeWidth="4" /><path d="M253 137v-17h20v17" stroke={outline} strokeWidth="6" /></g>;
    case 'pan': case 'pot': return <Pot pan={concept === 'pan'} />;
    case 'boil': return <><Pot />{[[207,191],[248,209],[286,183],[318,220]].map(([x,y]) => <circle key={x} cx={x} cy={y} r="10" fill="#e7f0ee" stroke={blue} strokeWidth="3" />)}<RisingSteam /><path d="m221 316 12-16m26 16 12-16m26 16 12-16" stroke="#c88a50" strokeWidth="5" /></>;
    case 'steam': return <><Pot /><g transform="translate(0 -75)"><path d="M145 166h230l-21 39H166Z" fill={paleGold} stroke={outline} strokeWidth="4" /><circle cx="220" cy="163" r="17" fill={green} /><circle cx="272" cy="163" r="17" fill={green} /><circle cx="320" cy="163" r="17" fill={green} /></g><g transform="translate(0 65)"><RisingSteam /></g></>;
    case 'bake': return <g><rect x="114" y="65" width="294" height="238" rx="16" fill="#afbec0" stroke={outline} strokeWidth="4" /><rect x="145" y="122" width="232" height="146" rx="9" fill="#52636a" /><path d="M164 230h192M153 110h215" stroke={paleGold} strokeWidth="5" /><path d="M195 229v-30q50-65 102 0v30Z" fill={gold} /><circle cx="163" cy="91" r="9" fill={outline} /><circle cx="348" cy="91" r="9" fill={outline} /><path d="M203 154q-9 13 0 24m47-24q-9 13 0 24m47-24q-9 13 0 24" fill="none" stroke="#dc9e66" strokeWidth="4" /></g>;
    case 'fry': return <><Pot pan /><ellipse cx="245" cy="194" rx="110" ry="18" fill={gold} /><path d="M176 186q15-31 41 2t34 0t39-3t35 1" fill="none" stroke={paleGold} strokeWidth="17" strokeLinecap="round" /><path d="m197 300 13-17m37 17 13-17m37 17 13-17" stroke="#c88a50" strokeWidth="5" /></>;
    case 'evaporate': return <Change before="liquid" after="gas" labels={['Liquid', 'Gas']} />;
    case 'condense': return <Change before="gas" after="liquid" labels={['Gas', 'Liquid']} />;
    case 'freeze': return <Change before="liquid" after="solid" labels={['Liquid', 'Solid']} />;
    case 'melt': return <Change before="solid" after="liquid" labels={['Solid', 'Liquid']} />;
    case 'increase': case 'decrease': return <Quantity decrease={concept === 'decrease'} />;
  }
}
export function VocabularyConceptScene({ concept, term }: { concept: VocabularyVisualConcept; term: string }) {
  const description = vocabularyConceptDescription(concept);
  if (!description) return null;
  return <svg className="vocabulary-concept-scene" viewBox="0 0 520 350" role="img" aria-label={`${term}: ${description.alt}`}>
    <rect className="visual-scene-background" x="1" y="1" width="518" height="348" rx="16" />
    {scene(concept as DrawnConcept)}
  </svg>;
}
