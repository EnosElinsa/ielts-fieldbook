import learningSenses from './learningSenseOverlay.json';
import type { VocabularyEntry, VocabularySense } from './types';
export const VOCABULARY_CONTENT_VERSION = 'reviewed-2026-10-10.1';
export type VocabularyLearningTask = { prompt: string; acceptedAnswers: string[]; explanation: string; options?: string[] };
// These substitutions were reviewed in these specific contexts, never pooled across senses.
const reviewed: Record<string, { definition: string; example: string; answers: string[]; explanation: string; forms?: string[] }> = {
 order: {definition:'The arrangement or sequence of things.',example:'Put the documents in chronological order.',answers:['sequence','arrangement'],explanation:'Order here means a sequence, not a command or a religious society.'},
 treat: {definition:'To give medical care to a person or condition.',example:'Doctors treat this infection with antibiotics.',answers:[],explanation:'Treat here means provide medical care, not the archaic meaning negotiate.'},
 recipe: {definition:'Instructions for preparing a dish, including its ingredients.',example:'This recipe uses fresh tomatoes and basil.',answers:[],explanation:'Recipe here means cooking instructions. Receipt is not a modern synonym.'},
 significant: {definition:'Large or important enough to deserve attention.',example:'The new policy brought a significant improvement.',answers:['substantial','notable'],explanation:'Substantial and notable describe an important improvement; statistical significance is a different sense.'},
 reliable: {definition:'Able to be trusted or depended on.',example:'The railway provides a reliable service.',answers:['dependable'],explanation:'Dependable describes a service that can be trusted.'},
 approximately: {definition:'Close to, but not exactly, a stated amount.',example:'The journey takes approximately twenty minutes.',answers:['roughly','about'],explanation:'Roughly and about both mark an estimate before a number.'},
 nevertheless: {definition:'Despite what has just been said.',example:'The task was difficult; nevertheless, we completed it.',answers:['nonetheless'],explanation:'Nonetheless expresses the same contrast between difficulty and completion.'},
 affect: {definition:'To influence someone or something.',example:'Noise can affect concentration.',answers:['influence'],explanation:'Influence is a verb taking a direct object in this context.'},
 adapt: {definition:'To change something to suit new conditions.',example:'We need to adapt the plan to local conditions.',answers:['adjust'],explanation:'Adjust means change the plan to fit the conditions; adopt means begin using it.'},
 economical: {definition:'Using little money, fuel or other resources.',example:'This car is economical to run.',answers:['inexpensive'],explanation:'Inexpensive to run describes low running costs; economic concerns the economy.'},
 increase: {definition:'To become greater in amount or number.',example:'Prices increase when demand exceeds supply.',answers:['rise'],explanation:'Rise fits this intransitive description of prices becoming higher.',forms:['increase','increases','increased','increasing']},
 reduce: {definition:'To make something smaller in amount or degree.',example:'The new equipment reduced energy consumption.',answers:['decreased','lowered'],explanation:'Decreased and lowered are past-tense replacements for reduced, meaning made consumption smaller.',forms:['reduced']},
 improve: {definition:'To make or become better.',example:'Regular practice improves pronunciation.',answers:['enhances'],explanation:'Enhances keeps the third-person singular form of improves and means makes pronunciation better.',forms:['improves']},
};
reviewed['abandon'] = {definition:'To leave a place or thing behind.',example:'They had to abandon the damaged ship.',answers:['leave'],explanation:'In this context, leave expresses the meaning of abandon.'};
reviewed['accurate'] = {definition:'Correct and free from errors.',example:'The report provides accurate measurements.',answers:['precise'],explanation:'In this context, precise expresses the meaning of accurate.'};
reviewed['achieve'] = {definition:'To succeed in doing something.',example:'The team worked hard to achieve its goal.',answers:['accomplish'],explanation:'In this context, accomplish expresses the meaning of achieve.'};
reviewed['adequate'] = {definition:'Enough for a particular purpose.',example:'The building has adequate ventilation.',answers:['sufficient'],explanation:'In this context, sufficient expresses the meaning of adequate.'};
reviewed['annual'] = {definition:'Happening once every year.',example:'The annual survey begins in March.',answers:['yearly'],explanation:'In this context, yearly expresses the meaning of annual.'};
reviewed['assist'] = {definition:'To help someone.',example:'Volunteers assist visitors at the entrance.',answers:['help'],explanation:'In this context, help expresses the meaning of assist.'};
reviewed['attempt'] = {definition:'To try to do something.',example:'We will attempt to repair the engine.',answers:['try'],explanation:'In this context, try expresses the meaning of attempt.'};
reviewed['brief'] = {definition:'Lasting only a short time.',example:'The speaker gave a brief introduction.',answers:['short'],explanation:'In this context, short expresses the meaning of brief.'};
reviewed['cease'] = {definition:'To stop doing something.',example:'The factory will cease production in June.',answers:['stop'],explanation:'In this context, stop expresses the meaning of cease.'};
reviewed['commence'] = {definition:'To begin something.',example:'Construction will commence next month.',answers:['begin'],explanation:'In this context, begin expresses the meaning of commence.'};
reviewed['complex'] = {definition:'Having many connected parts that are difficult to understand.',example:'This is a complex problem with many causes.',answers:['complicated'],explanation:'In this context, complicated expresses the meaning of complex.'};
reviewed['considerable'] = {definition:'Large in amount or degree.',example:'The project requires considerable investment.',answers:['substantial'],explanation:'In this context, substantial expresses the meaning of considerable.'};
reviewed['consequence'] = {definition:'Something that happens as a result.',example:'Unemployment was a consequence of the closure.',answers:['result'],explanation:'In this context, result expresses the meaning of consequence.'};
reviewed['construct'] = {definition:'To build something.',example:'Workers will construct a new bridge.',answers:['build'],explanation:'In this context, build expresses the meaning of construct.'};
reviewed['consume'] = {definition:'To use a resource.',example:'Modern appliances consume less electricity.',answers:['use'],explanation:'In this context, use expresses the meaning of consume.'};
reviewed['decline'] = {definition:'To become smaller in amount.',example:'Sales continue to decline.',answers:['decrease'],explanation:'In this context, decrease expresses the meaning of decline.'};
reviewed['demonstrate'] = {definition:'To show something clearly.',example:'These results demonstrate the need for change.',answers:['show'],explanation:'In this context, show expresses the meaning of demonstrate.'};
reviewed['difficult'] = {definition:'Requiring effort or skill.',example:'The exam was difficult.',answers:['hard'],explanation:'In this context, hard expresses the meaning of difficult.'};
reviewed['enormous'] = {definition:'Very large.',example:'The project has an enormous budget.',answers:['huge'],explanation:'In this context, huge expresses the meaning of enormous.'};
reviewed['essential'] = {definition:'Completely necessary.',example:'Clean water is essential for health.',answers:['necessary'],explanation:'In this context, necessary expresses the meaning of essential.'};
reviewed['establish'] = {definition:'To create or start an organisation.',example:'The university plans to establish a research centre.',answers:['set up'],explanation:'In this context, set up expresses the meaning of establish.'};
reviewed['expand'] = {definition:'To make something larger.',example:'The company plans to expand its warehouse.',answers:['enlarge'],explanation:'In this context, enlarge expresses the meaning of expand.'};
reviewed['expensive'] = {definition:'Costing a lot of money.',example:'Replacing the roof will be expensive.',answers:['costly'],explanation:'In this context, costly expresses the meaning of expensive.'};
reviewed['fundamental'] = {definition:'Forming a basic or necessary part.',example:'Access to water is a fundamental requirement.',answers:['basic'],explanation:'In this context, basic expresses the meaning of fundamental.'};
reviewed['initial'] = {definition:'Happening at the beginning.',example:'The initial results were promising.',answers:['first'],explanation:'In this context, first expresses the meaning of initial.'};
reviewed['maintain'] = {definition:'To keep something at the same level.',example:'We must maintain the quality of the service.',answers:['preserve'],explanation:'In this context, preserve expresses the meaning of maintain.'};
reviewed['major'] = {definition:'Very important or serious.',example:'Air pollution is a major concern.',answers:['important'],explanation:'In this context, important expresses the meaning of major.'};
reviewed['obtain'] = {definition:'To get something.',example:'Students can obtain a permit from reception.',answers:['acquire'],explanation:'In this context, acquire expresses the meaning of obtain.'};
reviewed['occur'] = {definition:'To happen.',example:'Floods occur after heavy rain.',answers:['happen'],explanation:'In this context, happen expresses the meaning of occur.'};
reviewed['permit'] = {definition:'To allow something.',example:'The rules permit visitors to take photographs.',answers:['allow'],explanation:'In this context, allow expresses the meaning of permit.'};
reviewed['purchase'] = {definition:'To buy something.',example:'Customers can purchase tickets online.',answers:['buy'],explanation:'In this context, buy expresses the meaning of purchase.'};
reviewed['rapid'] = {definition:'Happening quickly.',example:'The region experienced rapid growth.',answers:['fast'],explanation:'In this context, fast expresses the meaning of rapid.'};
reviewed['require'] = {definition:'To need something.',example:'These plants require plenty of sunlight.',answers:['need'],explanation:'In this context, need expresses the meaning of require.'};
reviewed['retain'] = {definition:'To keep something.',example:'Please retain your receipt.',answers:['keep'],explanation:'In this context, keep expresses the meaning of retain.'};
reviewed['select'] = {definition:'To choose something.',example:'Please select one answer.',answers:['choose'],explanation:'In this context, choose expresses the meaning of select.'};
reviewed['sufficient'] = {definition:'Enough for a purpose.',example:'There is sufficient evidence to support the claim.',answers:['enough'],explanation:'In this context, enough expresses the meaning of sufficient.'};
reviewed['utilise'] = {definition:'To use something.',example:'The system can utilise solar energy.',answers:['use'],explanation:'In this context, use expresses the meaning of utilise.'};
reviewed['utilize'] = {definition:'To use something.',example:'The system can utilize solar energy.',answers:['use'],explanation:'In this context, use expresses the meaning of utilize.'};
reviewed['vital'] = {definition:'Extremely important or necessary.',example:'Accurate information is vital for planning.',answers:['essential'],explanation:'In this context, essential expresses the meaning of vital.'};
reviewed['begin'] = {definition:'To start an event or action.',example:'The conference began on Monday.',answers:['started'],explanation:'Started is the past-tense replacement for began in this completed event.',forms:['began']};
reviewed['catastrophic'] = {definition:'Causing very great damage.',example:'The flood had catastrophic consequences.',answers:['disastrous'],explanation:'In this context, disastrous expresses the meaning of catastrophic.'};
reviewed['calamity'] = {definition:'An event causing serious damage or suffering.',example:'The earthquake was a calamity for the region.',answers:['disaster'],explanation:'In this context, disaster expresses the meaning of calamity.'};
reviewed['inappropriate'] = {definition:'Not suitable for a particular situation.',example:'The footwear was inappropriate for hiking.',answers:['unsuitable'],explanation:'In this context, unsuitable expresses the meaning of inappropriate.'};
reviewed['marine'] = {definition:'Relating to the sea.',example:'Scientists study marine ecosystems.',answers:['ocean'],explanation:'In this context, ocean expresses the meaning of marine.'};
reviewed['damp'] = {definition:'Slightly wet.',example:'The soil remains damp after the rain.',answers:['moist'],explanation:'In this context, moist expresses the meaning of damp.'};
reviewed['artificial'] = {definition:'Made by people rather than occurring naturally.',example:'The jacket contains artificial fibres.',answers:['synthetic'],explanation:'In this context, synthetic expresses the meaning of artificial.'};
reviewed['eco-friendly'] = {definition:'Causing little harm to the environment.',example:'The company uses eco-friendly packaging.',answers:['environmentally friendly'],explanation:'In this context, environmentally friendly expresses the meaning of eco-friendly.'};
reviewed['stable'] = {definition:'Not changing significantly.',example:'The temperature remained stable throughout the experiment.',answers:['steady'],explanation:'In this context, steady expresses the meaning of stable.'};
reviewed['fragment'] = {definition:'A small broken part of something.',example:'A fragment of glass lay on the floor.',answers:['piece'],explanation:'In this context, piece expresses the meaning of fragment.'};
reviewed['primary'] = {definition:'Most important.',example:'The primary cause was a lack of funding.',answers:['main'],explanation:'In this context, main expresses the meaning of primary.'};
reviewed['expertise'] = {definition:'Special knowledge or skill in a subject.',example:'The project requires expertise in chemistry.',answers:['specialist knowledge'],explanation:'In this context, specialist knowledge expresses the meaning of expertise.'};
reviewed['quantity'] = {definition:'An amount of something.',example:'We measured the quantity of water in the tank.',answers:['amount'],explanation:'In this context, amount expresses the meaning of quantity.'};
reviewed['component'] = {definition:'A part of a larger whole.',example:'The battery is a component of the device.',answers:['part'],explanation:'In this context, part expresses the meaning of component.'};
reviewed['detect'] = {definition:'To discover or identify something.',example:'The test can detect traces of lead.',answers:['identify'],explanation:'In this context, identify expresses the meaning of detect.'};
reviewed['predict'] = {definition:'To say what will happen in the future.',example:'Experts predict heavy rainfall tomorrow.',answers:['forecast'],explanation:'In this context, forecast expresses the meaning of predict.'};
reviewed['disclose'] = {definition:'To make information known.',example:'The report will disclose the results.',answers:['reveal'],explanation:'In this context, reveal expresses the meaning of disclose.'};
reviewed['accumulate'] = {definition:'To gather over time.',example:'Dust can accumulate on the shelves.',answers:['collect'],explanation:'In this context, collect expresses the meaning of accumulate.'};
reviewed['adversity'] = {definition:'A difficult or unpleasant situation.',example:'The community showed courage in adversity.',answers:['hardship'],explanation:'In this context, hardship expresses the meaning of adversity.'};
reviewed['imitate'] = {definition:"To copy someone's behaviour.",example:'Children often imitate their parents.',answers:['copy'],explanation:'In this context, copy expresses the meaning of imitate.'};
reviewed['fragile'] = {definition:'Easily broken or damaged.',example:'The vase is fragile and must be handled carefully.',answers:['delicate'],explanation:'In this context, delicate expresses the meaning of fragile.'};
reviewed['durable'] = {definition:'Able to last a long time.',example:'These boots are durable enough for daily use.',answers:['hard-wearing'],explanation:'In this context, hard-wearing expresses the meaning of durable.'};
reviewed['vicinity'] = {definition:'The area around a place.',example:'There are several cafes in the vicinity.',answers:['area'],explanation:'In this context, area expresses the meaning of vicinity.'};
reviewed['vanish'] = {definition:'To disappear from sight.',example:'The clouds may vanish by noon.',answers:['disappear'],explanation:'In this context, disappear expresses the meaning of vanish.'};
reviewed['swift'] = {definition:'Happening quickly.',example:'The hospital made a swift response to the emergency.',answers:['rapid'],explanation:'In this context, rapid expresses the meaning of swift.'};
reviewed['aid'] = {definition:'Help given to someone in need.',example:'Volunteers offer aid to displaced families.',answers:['help'],explanation:'In this context, help expresses the meaning of aid.'};
reviewed['accelerate'] = {definition:'To make something happen faster.',example:'The new machinery will accelerate production.',answers:['speed up'],explanation:'In this context, speed up expresses the meaning of accelerate.'};
reviewed['reject'] = {definition:'To refuse to accept something.',example:'The committee may reject the proposal.',answers:['refuse'],explanation:'In this context, refuse expresses the meaning of reject.'};
reviewed['halt'] = {definition:'To stop moving or doing something.',example:'Police ordered the driver to halt.',answers:['stop'],explanation:'In this context, stop expresses the meaning of halt.'};
reviewed['prohibit'] = {definition:'To officially forbid something.',example:'The regulations prohibit smoking indoors.',answers:['ban'],explanation:'In this context, ban expresses the meaning of prohibit.'};
reviewed['conceal'] = {definition:'To hide something from view.',example:'The curtains conceal the damaged wall.',answers:['hide'],explanation:'In this context, hide expresses the meaning of conceal.'};
reviewed['prolong'] = {definition:'To make something last longer.',example:"The treatment may prolong the patient's life.",answers:['extend'],explanation:'In this context, extend expresses the meaning of prolong.'};
reviewed['reluctant'] = {definition:'Not willing to do something.',example:'She was reluctant to sign the agreement.',answers:['unwilling'],explanation:'In this context, unwilling expresses the meaning of reluctant.'};
reviewed['resemble'] = {definition:'To look similar to something.',example:'The new building will resemble the old one.',answers:['look like'],explanation:'In this context, look like expresses the meaning of resemble.'};
reviewed['ignore'] = {definition:'To pay no attention to something.',example:'Do not ignore the safety warnings.',answers:['disregard'],explanation:'In this context, disregard expresses the meaning of ignore.'};
reviewed['feasible'] = {definition:'Possible to do successfully.',example:'The engineers believe the plan is feasible.',answers:['practical'],explanation:'In this context, practical expresses the meaning of feasible.'};
reviewed['hinder'] = {definition:'To make progress difficult.',example:'Heavy traffic can hinder progress.',answers:['obstruct'],explanation:'In this context, obstruct expresses the meaning of hinder.'};
reviewed['ancient'] = {definition:'Belonging to a very distant past.',example:'The museum displays ancient tools.',answers:['very old'],explanation:'In this context, very old expresses the meaning of ancient.'};
reviewed['beneficial'] = {definition:'Having a positive effect.',example:'Regular exercise is beneficial for health.',answers:['helpful'],explanation:'In this context, helpful expresses the meaning of beneficial.'};
reviewed['confidential'] = {definition:'Intended to be kept secret.',example:'These medical records are confidential.',answers:['private'],explanation:'In this context, private expresses the meaning of confidential.'};
reviewed['eliminate'] = {definition:'To remove something completely.',example:'The filter can eliminate impurities.',answers:['remove'],explanation:'In this context, remove expresses the meaning of eliminate.'};
reviewed['explicit'] = {definition:'Stated clearly and directly.',example:'The instructions must be explicit.',answers:['clear'],explanation:'In this context, clear expresses the meaning of explicit.'};
reviewed['foe'] = {definition:'An enemy.',example:'The soldiers faced a powerful foe.',answers:['enemy'],explanation:'In this context, enemy expresses the meaning of foe.'};
reviewed['gifted'] = {definition:'Having a natural ability.',example:'The school supports gifted musicians.',answers:['talented'],explanation:'In this context, talented expresses the meaning of gifted.'};
reviewed['mainly'] = {definition:'For the most part.',example:'The survey mainly concerns transport.',answers:['primarily'],explanation:'In this context, primarily expresses the meaning of mainly.'};
reviewed['manufacture'] = {definition:'To produce goods in a factory.',example:'The factory will manufacture electric motors.',answers:['produce'],explanation:'In this context, produce expresses the meaning of manufacture.'};
reviewed['ordinary'] = {definition:'Not unusual or special.',example:'The device works in ordinary conditions.',answers:['normal'],explanation:'In this context, normal expresses the meaning of ordinary.'};
reviewed['paramount'] = {definition:'More important than anything else.',example:'Public safety is the paramount concern.',answers:['supreme'],explanation:'In this context, supreme expresses the meaning of paramount.'};
reviewed['rare'] = {definition:'Not often seen or found.',example:'This bird is rare in the region.',answers:['uncommon'],explanation:'In this context, uncommon expresses the meaning of rare.'};
reviewed['solely'] = {definition:'Only and not for anything else.',example:'The fund is used solely for research.',answers:['only'],explanation:'In this context, only expresses the meaning of solely.'};
reviewed['tremendous'] = {definition:'Very great in amount or degree.',example:'The project required tremendous effort.',answers:['enormous'],explanation:'In this context, enormous expresses the meaning of tremendous.'};
reviewed['unbiased'] = {definition:'Not favouring any particular side.',example:'The panel must provide an unbiased assessment.',answers:['impartial'],explanation:'In this context, impartial expresses the meaning of unbiased.'};
export function escapePattern(text: string) { return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
export function concealWord(text: string, answer: string) { return text.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escapePattern(answer)}(?![\\p{L}\\p{N}_])`, 'giu'), '_____'); }
export function reviewedEntry(entry: VocabularyEntry): VocabularyEntry {
 if (!entry.id.startsWith('vocab:') && !entry.id.startsWith('guixue:') && !entry.senses.some(sense => sense.source?.includes('Kaikki') || sense.source === 'Fieldbook editorial')) return entry;
 const item = reviewed[entry.term.toLowerCase()];
 const replacement = (learningSenses as Record<string, VocabularySense>)[entry.term.toLowerCase()];
 if (replacement) {
  const found = entry.senses.find(sense => sense.id === replacement.id);
  return {...entry,meaning:replacement.definition,example:replacement.example,senses:[found || replacement,...entry.senses.filter(sense => sense.id !== replacement.id)]};
 }
 if (!item) return entry;
 // Supplement tasks without mutating learner notes or stable sense identifiers.
 return {...entry, senses:entry.senses.map((sense,index)=> index !== 0 ? sense : {...sense, ...(entry.term === 'order' || entry.term === 'treat' || entry.term === 'recipe' ? {synonyms:[]} : {})})};
}
const confusion: Record<string, VocabularyLearningTask> = {
'affect':{prompt:'Noise can _____ concentration.',acceptedAnswers:['affect'],options:['affect','effect'],explanation:'Affect is the verb influence. Effect is usually a noun meaning result.'},
'effect':{prompt:'The policy had a positive _____ on attendance.',acceptedAnswers:['effect'],options:['effect','affect'],explanation:'The noun effect means result; affect is the verb influence.'},
'adapt':{prompt:'We must _____ the plan to local needs.',acceptedAnswers:['adapt'],options:['adapt','adopt'],explanation:'Adapt means change to fit. Adopt means accept and begin using.'},
'adopt':{prompt:'The board will _____ the new policy.',acceptedAnswers:['adopt'],options:['adopt','adapt'],explanation:'Adopt means accept and begin using a policy; adapt means change it.'},
'economic':{prompt:'The region experienced rapid _____ growth.',acceptedAnswers:['economic'],options:['economic','economical'],explanation:'Economic relates to the economy; economical means saving resources.'},
'economical':{prompt:'This car is _____ to run because it uses little fuel.',acceptedAnswers:['economical'],options:['economical','economic'],explanation:'Economical means inexpensive to operate.'},
'recipe':{prompt:'The chef followed a _____ for vegetable soup.',acceptedAnswers:['recipe'],options:['recipe','receipt'],explanation:'Recipe gives cooking instructions. Receipt proves payment.'},
'receipt':{prompt:'Keep the _____ as proof that you paid.',acceptedAnswers:['receipt'],options:['receipt','recipe'],explanation:'Receipt is proof of payment. Recipe gives cooking instructions.'},
'historic':{prompt:'The agreement was a _____ event that changed the country.',acceptedAnswers:['historic'],options:['historic','historical'],explanation:'Historic means important in history. Historical means relating to the past.'},
'historical':{prompt:'The archive contains _____ records from the nineteenth century.',acceptedAnswers:['historical'],options:['historical','historic'],explanation:'Historical records relate to the past; historic means historically important.'},
'rise':{prompt:'Prices may _____ next year.',acceptedAnswers:['rise'],options:['rise','raise'],explanation:'Rise has no direct object. Raise needs an object.'},
'raise':{prompt:'The council will _____ parking fees.',acceptedAnswers:['raise'],options:['raise','rise'],explanation:'Raise takes the object parking fees.'},
'principal':{prompt:'Cost was the _____ reason for the delay.',acceptedAnswers:['principal'],options:['principal','principle'],explanation:'Principal means main. Principle is a rule or belief.'},
'principle':{prompt:'Equal access is a basic _____ of the policy.',acceptedAnswers:['principle'],options:['principle','principal'],explanation:'Principle means a rule or belief. Principal means main.'},
'accept':{prompt:'The university will _____ applications until Friday.',acceptedAnswers:['accept'],options:['accept','except'],explanation:'Accept means receive or agree to. Except means excluding.'},
'except':{prompt:'Everyone attended _____ the manager.',acceptedAnswers:['except'],options:['except','accept'],explanation:'Except introduces the person excluded; accept is a verb.'},
'borrow':{prompt:'Can I _____ your dictionary for an hour?',acceptedAnswers:['borrow'],options:['borrow','lend'],explanation:'Borrow means receive temporarily; lend means give temporarily.'},
'lend':{prompt:'Could you _____ me your dictionary?',acceptedAnswers:['lend'],options:['lend','borrow'],explanation:'Lend means give temporarily; borrow means receive temporarily.'}
};
export function learningTask(entry: VocabularyEntry, sense: VocabularySense, mode: string): VocabularyLearningTask | undefined {
 const eligible = entry.id.startsWith('vocab:') || entry.id.startsWith('guixue:') || entry.senses.some(sense => sense.source?.includes('Kaikki') || sense.source === 'Fieldbook editorial');
 const item = eligible ? reviewed[entry.term.toLowerCase()] : undefined;
 const primary = sense.id === entry.senses[0]?.id;
 if (mode === 'synonym') {
  if (!item || !primary || !item.answers.length) return;
  return {prompt:`Replace “${item.forms?.[0] || entry.term}” with a synonym in this context: ${item.example}`,acceptedAnswers:item.answers,explanation:item.explanation};
 }
 if (mode === 'distinction' && eligible && primary && confusion[entry.term.toLowerCase()]) return confusion[entry.term.toLowerCase()];
 if (mode === 'distinction' && sense.distinctionTask) return {prompt:sense.distinctionTask.prompt,acceptedAnswers:[sense.distinctionTask.answer],options:sense.distinctionTask.options,explanation:sense.distinctionTask.explanation};
 if (mode === 'cloze') {
  const context = item && primary ? item.example : sense.example;
  const candidates = item && primary ? item.forms || [entry.term] : [entry.term];
  const answer = candidates.find(form => concealWord(context,form) !== context);
  if (!answer) return;
  return {prompt:concealWord(context,answer),acceptedAnswers:[answer],explanation:item && primary ? item.explanation : `The context uses “${answer}”.`};
 }
 if (mode === 'definition' && item && primary) return {prompt:item.definition,acceptedAnswers:[entry.term],explanation:item.explanation};
}
