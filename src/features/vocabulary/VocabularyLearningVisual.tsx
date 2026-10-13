import { useState } from 'react';
import type { ResolvedVocabularyLearningContext } from '../../domain/vocabulary/context';
import { getVocabularyIllustration, getVocabularyVisualConcept, type VocabularyVisualConcept } from '../../domain/vocabulary/media';
import '../../styles/vocabulary-visual.css';

/** Edits and navigation reset a failed photo by keying the actual selected meaning. */
export function VocabularyLearningVisual({ resolved }: { resolved: ResolvedVocabularyLearningContext }) {
  const image = getVocabularyIllustration(resolved);
  return <LearningVisual key={JSON.stringify([resolved.entry.id, resolved.entry.term, resolved.sense?.id, resolved.sense?.definition, resolved.sense?.example, resolved.sense?.pos, image?.src])} resolved={resolved} />;
}
function LearningVisual({ resolved }: { resolved: ResolvedVocabularyLearningContext }) {
  const image = getVocabularyIllustration(resolved);
  const concept = getVocabularyVisualConcept(resolved);
  const [failed, setFailed] = useState(false);
  if (image && !failed) return <figure className="vocabulary-learning-visual is-photo">
    <div className="vocabulary-visual-frame"><img src={image.src} alt={image.alt} width={image.width} height={image.height} loading="lazy" decoding="async" onError={() => setFailed(true)} /></div>
    <figcaption>{image.caption}</figcaption>
    <details className="vocabulary-visual-credits"><summary>Image credits</summary><p>{image.author} · {image.license}</p><p>{image.changes}</p><div><a href={image.sourceUrl} target="_blank" rel="noreferrer">Source</a><a href={image.licenseUrl} target="_blank" rel="noreferrer">License</a></div></details>
  </figure>;
  if (!concept && !image) return null;
  return <figure className="vocabulary-learning-visual is-illustration">
    {concept ? <FoodScene concept={concept} term={resolved.entry.term} /> : null}
    <figcaption>{concept ? `Illustration · ${resolved.entry.term}` : null}</figcaption>
    {failed ? <div className="vocabulary-visual-recovery"><p role="status">Image could not load. You can keep learning from the definition and example.</p><button type="button" className="btn line" onClick={() => setFailed(false)}>Retry image</button></div> : null}
  </figure>;
}
function Peas() {
  return <g><path d="M74 214Q161 73 415 114Q342 259 150 264Q108 265 74 214Z" fill="#386c38" /><path d="M85 213Q161 117 399 121Q304 232 151 245Q108 246 85 213Z" fill="#bad784" stroke="#639545" strokeWidth="4" />{[[134,207,23],[189,184,28],[250,164,31],[316,145,29]].map(([x,y,r]) => <g key={x}><circle cx={x} cy={y} r={r} fill="#739e44" stroke="#386c38" strokeWidth="2" /><circle cx={x-6} cy={y-8} r={r*.32} fill="#c3dd93" opacity=".7" /></g>)}<path d="M414 115q26-47 45-24t-17 36" fill="none" stroke="#47733c" strokeWidth="5" strokeLinecap="round" /></g>;
}
function Carrot() {
  return <g transform="rotate(-20 260 200)"><path d="M236 120Q197 166 254 306Q268 318 280 299Q317 154 280 120Z" fill="#ed913c" stroke="#b35e25" strokeWidth="3" /><path d="M251 142Q238 187 264 280" fill="none" stroke="#ffc96c" strokeWidth="10" strokeLinecap="round" /><path d="m225 165 21 7m41 12-17 7m-34 27 22 4m25 25-13 5" stroke="#b35e25" strokeWidth="3" /><path d="M259 129Q214 99 210 48Q252 55 259 117Q259 73 285 30Q314 76 271 128Q310 88 339 85Q331 126 276 138Z" fill="#517c42" stroke="#315e35" strokeWidth="3" /><path d="m259 121-33-52m38 48 21-63m-12 76 45-33" fill="none" stroke="#94b46e" strokeWidth="3" /></g>;
}
function Apple() {
  return <g><path d="M253 138Q206 105 171 145Q137 185 174 259Q206 307 258 288Q309 308 341 255Q376 180 333 144Q296 111 253 138Z" fill="#bd5945" stroke="#8c3c30" strokeWidth="3" /><path d="M189 166Q168 193 188 233" fill="none" stroke="#efae8a" strokeWidth="12" strokeLinecap="round" /><path d="M258 143Q250 109 269 84" fill="none" stroke="#70533d" strokeWidth="8" strokeLinecap="round" /><path d="M267 107Q281 61 327 80Q321 112 267 107Z" fill="#618743" /><path d="M272 103 309 85" stroke="#bdd58a" strokeWidth="3" /></g>;
}
function Banana() {
  return <g><path d="M125 135Q232 275 399 107Q366 248 250 277Q146 292 125 135Z" fill="#e8ba47" stroke="#ae8631" strokeWidth="4" /><path d="M143 155Q241 286 377 143" fill="none" stroke="#fbe58c" strokeWidth="14" strokeLinecap="round" /><path d="m125 135-7-19 12-4 10 22m256-23 13-20 9 9-12 20" fill="#766140" /><path d="M166 192Q232 278 340 208" fill="none" stroke="#bb973a" strokeWidth="3" /></g>;
}
function Grapes() {
  return <g><path d="M260 110Q246 69 286 61" fill="none" stroke="#655b36" strokeWidth="7" /><path d="M266 101Q301 50 354 82Q327 131 266 101Z" fill="#527346" />{[[227,143],[284,143],[198,191],[256,194],[314,190],[225,241],[285,240],[256,284]].map(([x,y]) => <g key={`${x}-${y}`}><circle cx={x} cy={y} r="32" fill="#836e91" stroke="#584865" strokeWidth="3" /><ellipse cx={x-9} cy={y-10} rx="9" ry="7" fill="#c0aac8" /></g>)}</g>;
}
function Citrus({ lemon }: { lemon: boolean }) {
  return <g><path d="M253 115Q261 68 310 83Q295 114 258 115Z" fill="#567844" />{lemon ? <path d="M173 165Q179 135 220 133Q285 104 331 160Q352 181 347 220Q326 242 286 255Q222 282 179 232Q157 215 165 190Z" fill="#dec454" stroke="#a99437" strokeWidth="3" /> : <circle cx="259" cy="203" r="85" fill="#db9444" stroke="#af6c32" strokeWidth="3" />}<path d="M195 166Q172 199 194 222" fill="none" stroke={lemon ? '#f5e59d' : '#f7c17e'} strokeWidth="12" strokeLinecap="round" />{[[257,152],[302,185],[278,233],[222,247],[318,221]].map(([x,y]) => <circle key={x} cx={x} cy={y} r="2" fill={lemon ? '#a99437' : '#af6c32'} />)}</g>;
}
function Paste() {
  return <g><path d="M105 180Q260 138 415 180L390 266Q260 315 130 266Z" fill="#9b7050" stroke="#674c36" strokeWidth="4"/><ellipse cx="260" cy="180" rx="155" ry="44" fill="#d8c18e" stroke="#674c36" strokeWidth="4"/><path d="M147 181Q179 143 212 180T285 181T371 176M173 197Q248 215 332 193" fill="none" stroke="#b99c62" strokeWidth="8" strokeLinecap="round"/><path d="m307 184 81-105" stroke="#736347" strokeWidth="15" strokeLinecap="round"/><ellipse cx="302" cy="188" rx="30" ry="13" fill="#b79b64" transform="rotate(-25 302 188)"/></g>;
}
function FoodScene({ concept, term }: { concept: VocabularyVisualConcept; term: string }) {
  const subject = concept === 'paste' ? <Paste /> : concept === 'pea' ? <Peas /> : concept === 'carrot' ? <Carrot /> : concept === 'apple' ? <Apple /> : concept === 'banana' ? <Banana /> : concept === 'grape' ? <Grapes /> : concept === 'lemon' || concept === 'orange' ? <Citrus lemon={concept === 'lemon'} /> : concept === 'vegetable' ? <><g transform="translate(-35 -22) scale(.75)"><Carrot /></g><g transform="translate(136 126) scale(.67)"><Peas /></g></> : <><g transform="translate(-10 0) scale(.82)"><Apple /></g><g transform="translate(127 126) scale(.63)"><Banana /></g></>;
  const label = concept === 'paste' ? 'A bowl of thick mixture with a spoon' : concept === 'pea' ? 'Green peas in an open pod' : concept === 'carrot' ? 'An orange carrot root with green leaves' : concept === 'vegetable' ? 'Carrot roots and green peas, examples of vegetables' : concept === 'fruit' ? 'An apple and a banana, examples of fruit' : concept === 'grape' ? 'A bunch of grapes growing on a stem' : `A ${concept} fruit`;
  return <svg className="vocabulary-food-scene" viewBox="0 0 520 350" role="img" aria-label={`${term}: ${label}`}><rect className="visual-scene-background" x="1" y="1" width="518" height="348" rx="16" /><ellipse className="visual-scene-ground" cx="260" cy="301" rx="175" ry="16" />{subject}</svg>;
}
