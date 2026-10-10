// Explicit regional spellings, rather than blanket letter substitutions.
// Inflections are generated only for the listed verbs and regular nouns.
const aliases = new Map<string, string>();
function pair(british: string, american: string) {
  aliases.set(british, american); aliases.set(american, american);
}
function pairs(list: string, plural = false) {
  list.trim().split(/\s+/).forEach(item => {
    const [uk, us] = item.split(':'); pair(uk, us);
    if (plural) pair(`${uk}s`, `${us}s`);
  });
}
pairs(`colour:color flavour:flavor honour:honor humour:humor labour:labor
  neighbour:neighbor behaviour:behavior favour:favor odour:odor rumour:rumor
  armour:armor harbour:harbor splendour:splendor vigour:vigor rigour:rigor
  centre:center metre:meter litre:liter theatre:theater fibre:fiber calibre:caliber
  centimetre:centimeter millimetre:millimeter kilometre:kilometer
  catalogue:catalog dialogue:dialog analogue:analog programme:program
  aeroplane:airplane aluminium:aluminum mould:mold kerb:curb
  pyjamas:pajamas tyre:tire cheque:check grey:gray cosy:cozy
  licence:license defence:defense offence:offense pretence:pretense
  jewellery:jewelry encyclopaedia:encyclopedia paediatric:pediatric
  anaemia:anemia diarrhoea:diarrhea oestrogen:estrogen foetus:fetus
  ageing:aging judgement:judgment acknowledgement:acknowledgment
  fulfilment:fulfillment skilful:skillful wilful:willful
  colourful:colorful colourless:colorless favourite:favorite favourable:favorable
  honourable:honorable humorous:humorous
  labourer:laborer neighbouring:neighboring behavioural:behavioral
  sceptic:skeptic sceptical:skeptical scepticism:skepticism
  recognisable:recognizable recognisably:recognizably honourably:honorably
  favourably:favorably unfavourable:unfavorable dishonour:dishonor
  dishonourable:dishonorable savour:savor savoury:savory tumour:tumor
  centrepiece:centerpiece centred:centered centring:centering
  storey:story storeys:stories plough:plow`, true);

// -ise/-ize and -yse/-yze families with their ordinary inflections.
const verbs = `organise recognise realise analyse paralyse catalyse standardise
  categorise summarise emphasise criticise apologise specialise normalise
  modernise optimise prioritise authorise characterise civilise colonise
  commercialise customise destabilise digitise economise equalise finalise
  generalise globalise harmonise idealise industrialise legalise liberalise
  localise materialise maximise minimise mobilise monopolise nationalise
  neutralise patronise personalise polarise popularise privatise publicise
  rationalise reorganise revitalise socialise stabilise sterilise subsidise
  symbolise synchronise synthesise terrorise urbanise utilise visualise`;
verbs.split(/\s+/).forEach(uk => {
  const us = uk.replace(/ise$/, 'ize').replace(/yse$/, 'yze');
  pair(uk, us); pair(`${uk}s`, `${us}s`); pair(`${uk}d`, `${us}d`);
  pair(`${uk.slice(0, -1)}ing`, `${us.slice(0, -1)}ing`);
});
pairs(`organisation:organization reorganisation:reorganization realisation:realization
  civilisation:civilization colonisation:colonization commercialisation:commercialization
  customisation:customization categorisation:categorization generalisation:generalization
  globalisation:globalization industrialisation:industrialization legalisation:legalization
  liberalisation:liberalization localisation:localization modernisation:modernization
  nationalisation:nationalization optimisation:optimization privatisation:privatization
  rationalisation:rationalization specialisation:specialization standardisation:standardization
  stabilisation:stabilization urbanisation:urbanization utilisation:utilization
  visualisation:visualization authorisation:authorization organisational:organizational
  organised:organized organiser:organizer recognised:recognized
  travelling:traveling travelled:traveled traveller:traveler
  cancelled:canceled cancelling:canceling counsellor:counselor counselling:counseling
  labelled:labeled labelling:labeling modelled:modeled modelling:modeling
  fuelled:fueled fuelling:fueling levelled:leveled levelling:leveling
  quarrelled:quarreled quarrelling:quarreling dialled:dialed dialling:dialing
  marvellous:marvelous woollen:woolen fulfils:fulfills fulfil:fulfill
  fulfilled:fulfilled fulfilling:fulfilling practised:practiced practising:practicing
  practise:practice practises:practices towards:toward afterwards:afterward`, true);
pairs(`coloured:colored colouring:coloring favoured:favored favouring:favoring
  honoured:honored honouring:honoring laboured:labored labouring:laboring
  flavoured:flavored flavouring:flavoring moulded:molded moulding:molding
  coloured:colored colourfully:colorfully discoloured:discolored discolouration:discoloration
  manoeuvre:maneuver manoeuvres:maneuvers manoeuvred:maneuvered manoeuvring:maneuvering`);

function normalized(value: unknown) {
  return String(value || '').normalize('NFKC').trim().toLocaleLowerCase('en')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' ');
}
function canonical(value: string) {
  return value.replace(/[a-z]+/g, token => aliases.get(token) || token);
}
export function matchesDictationSpelling(expected: unknown, response: unknown) {
  const answer = normalized(response);
  return Boolean(answer) && canonical(normalized(expected)) === canonical(answer);
}
export function isRegionalSpellingDifference(expected: unknown, response: unknown) {
  return normalized(expected) !== normalized(response) && matchesDictationSpelling(expected, response);
}
