// @ts-nocheck
// Source hierarchy verified from the public Guixue metadata API on 2026-10-10.
const metadata = [
  ['10174', 'IELTS Vocabulary', 3632, [
    ['21794','Natural geography','21795:55 21796:47 21797:52 21798:50 21799:37'],['21800','Plant research','21801:65 21802:65'],['21803','Animal protection','21804:55 21805:53 21806:60'],['21807','Space exploration','21808:50 21809:26'],['21810','School education','21811:52 21812:51 21813:50 21814:52 21815:48 21816:49 21817:51 21818:46'],['21819','Technology and invention','21820:61 21821:53'],['21822','Culture and history','21823:51 21824:28'],['21825','Language evolution','21826:68'],['21827','Entertainment and sport','21828:52 21829:49 21830:74'],['21831','Objects and materials','21832:50 21833:53 21834:49'],['21835','Fashion and trends','21836:58 21837:55'],['21838','Food and health','21839:57 21840:55 21841:61'],['21842','Buildings and places','21843:67 21844:65'],['21845','Transport and travel','21846:68 21847:66'],['21848','Nations and government','21849:74 21850:75'],['21851','Society and economy','21852:56 21853:58 21854:57'],['21855','Law and regulation','21856:58 21857:59'],['21858','Conflict and competition','21859:52 21860:51 21861:53 21862:57'],['21863','Social roles','21864:60 21865:60'],['21866','Actions and behaviour','21867:52 21868:53 21869:55 21870:46 21871:61'],['21872','Physical and mental health','21873:53 21874:52 21875:52 21876:52 21877:50 21878:47 21879:28 21880:55'],['21881','Time and dates','21882:52'],
  ]],
  ['10176','IELTS Reading Keywords',376,[['21936','Key words: Category 1','21937:20'],['21938','Key words: Category 2','21939:50 21940:50'],['21941','Key words: Category 3','21942:50 21943:50 21944:50 21945:50 21946:56']]],
  ['11320','IELTS Listening Vocabulary',3051,[['34997','Chapter 3','34998:112 35003:143 35004:113 35005:112 35006:145 35007:113 35008:104 35009:151 35010:142'],['35011','Chapter 4','35012:104 35013:104 35014:126 35015:12'],['35016','Chapter 5','35017:115 35018:111 35019:114 35020:105 35021:100 35022:108 35023:130 35024:144 35025:139 35026:142 35027:127 35028:235']]],
  ['10177','IELTS Listening Essentials',1399,[['21947','179 key words','21948:30 21949:30 21950:31 21951:30 21952:30 21953:28'],['23783','Core listening scenarios','23784:47 23785:36 23786:79 23787:27 23788:100 23789:54 23790:22 23791:67 23792:44 23793:48 23794:58 23795:25 23796:37 23797:45 23798:25 23799:23 23800:29 23801:32'],['21960','Essential listening phrases','21961:26 21962:61 21963:59 21964:60 21965:58'],['21954','72 words with multiple meanings','21955:36 21956:36'],['21957','Irregular verbs','21958:51 21959:35']]],
  ['21953','IELTS Listening Practice 21',361,[['135336','Test 1','135337:15 135338:17 135339:15 135340:13'],['135341','Test 2','135342:24 135343:27 135344:36 135345:32'],['135346','Test 3','135347:20 135348:36 135349:36 135350:29'],['135351','Test 4','135352:11 135353:17 135354:16 135355:17']]],
  ['10216','IELTS Listening Practice 20',386,[['22056','Test 1','22057:14 22254:21 22255:19 22256:15'],['22257','Test 2','22258:20 22259:25 22260:34 22261:33'],['22262','Test 3','22263:17 22264:29 22265:28 22266:31'],['22267','Test 4','22268:15 22269:31 22270:26 22271:28']]],
];

// These are original English editorial definitions and examples, not source-book word lists.
const rows = [
 ['significant','adjective','Large or important enough to deserve attention.','The survey found a significant difference between the two age groups.','significant difference;significant improvement;significant proportion'],
 ['account for','verb','Explain a result, or form a particular part of a total.','Transport costs account for nearly a quarter of the household budget.','account for a difference;account for a proportion;fully account for'],
 ['affect','verb','Influence someone or something.','Higher rents affect students who live away from home.','adversely affect;directly affect;affect the outcome'],
 ['effect','noun','A change produced by a cause.','The new timetable had a positive effect on attendance.','have an effect on;long-term effect;side effect'],
 ['economic','adjective','Connected with the economy, trade or production.','The city benefited from a period of economic growth.','economic growth;economic policy;economic recovery'],
 ['economical','adjective','Using little money, fuel or other resources.','Travelling by bus is more economical than driving alone.','economical to run;economical use;economical solution'],
 ['rise','verb','Move upwards or become greater without a direct object.','Average temperatures are expected to rise over the next decade.','rise sharply;rise steadily;rise by'],
 ['raise','verb','Move something upwards or increase its amount.','The council plans to raise parking fees next year.','raise awareness;raise standards;raise funds'],
 ['adapt','verb','Change to suit a new situation or purpose.','Schools must adapt their teaching to meet different learning needs.','adapt to change;adapt a method;adapt quickly'],
 ['adopt','verb','Begin to use a policy, method or idea.','Several universities have adopted a more flexible admissions policy.','adopt an approach;adopt a policy;widely adopted'],
 ['principal','adjective','Most important or main.','The principal cause of the delay was a shortage of trained staff.','principal cause;principal reason;principal objective'],
 ['principle','noun','A basic rule or belief that guides behaviour.','Equal access to education is a central principle of the policy.','basic principle;guiding principle;in principle'],
 ['accommodation','noun','A place where someone can live or stay.','The college provides accommodation for first-year students.','student accommodation;temporary accommodation;book accommodation'],
 ['reservation','noun','An arrangement to keep a room, seat or place available.','The receptionist confirmed our reservation for Saturday night.','make a reservation;confirm a reservation;hotel reservation'],
 ['receipt','noun','A document showing that something has been paid for.','Keep your receipt in case you need to return the equipment.','original receipt;request a receipt;proof of receipt'],
 ['itinerary','noun','A plan of the places to be visited during a journey.','The revised itinerary includes a guided tour of the museum.','travel itinerary;detailed itinerary;revised itinerary'],
 ['departure','noun','The act or time of leaving a place.','Passengers should arrive one hour before departure.','departure time;departure lounge;scheduled departure'],
 ['destination','noun','The place to which someone or something is going.','The coastal town has become a popular holiday destination.','final destination;tourist destination;reach a destination'],
 ['commute','verb','Travel regularly between home and work or study.','Many residents commute to the city by train.','commute to work;daily commute;long commute'],
 ['pedestrian','noun','A person who is walking in a public place.','The new crossing makes the junction safer for pedestrians.','pedestrian crossing;pedestrian access;pedestrian safety'],
 ['congestion','noun','A condition in which roads or places become too crowded.','Improved bus services could reduce traffic congestion.','traffic congestion;reduce congestion;congestion charge'],
 ['infrastructure','noun','The basic systems and facilities needed by a society.','The region needs investment in transport infrastructure.','public infrastructure;transport infrastructure;infrastructure investment'],
 ['sustainable','adjective','Able to continue without using up resources or causing serious harm.','The project aims to create a sustainable source of clean energy.','sustainable development;sustainable transport;sustainable approach'],
 ['renewable','adjective','Replaced naturally and therefore available for continued use.','Wind is a renewable source of energy.','renewable energy;renewable resource;renewable electricity'],
 ['biodiversity','noun','The variety of living organisms in an area.','Protecting wetlands helps maintain local biodiversity.','protect biodiversity;biodiversity loss;rich biodiversity'],
 ['habitat','noun','The natural place in which an organism lives.','Road construction can destroy the habitat of rare species.','natural habitat;habitat loss;protect a habitat'],
 ['species','noun','A group of organisms that share characteristics and can reproduce together.','Several bird species return to the lake each spring.','endangered species;native species;protect a species'],
 ['conservation','noun','Protection of the natural environment or careful use of resources.','The charity supports the conservation of coastal habitats.','wildlife conservation;energy conservation;conservation programme'],
 ['emission','noun','The release of a substance such as gas into the environment.','The factory reduced its carbon emissions by installing new equipment.','carbon emissions;reduce emissions;emission target'],
 ['pollutant','noun','A substance that makes air, water or land dirty or harmful.','Researchers measured pollutants in water samples from the river.','air pollutant;harmful pollutant;remove pollutants'],
 ['drought','noun','A long period with little or no rain.','The prolonged drought reduced crop yields across the region.','severe drought;prolonged drought;drought conditions'],
 ['erosion','noun','Gradual removal of soil or rock by water, wind or other forces.','Planting trees can help prevent soil erosion on steep slopes.','soil erosion;coastal erosion;prevent erosion'],
 ['agriculture','noun','The activity of growing crops and raising animals for food.','Agriculture remains a major source of employment in rural areas.','sustainable agriculture;commercial agriculture;agricultural production'],
 ['cultivate','verb','Prepare land and grow crops, or develop a quality or relationship.','Local farmers cultivate vegetables on small plots of land.','cultivate crops;cultivate an interest;cultivate relationships'],
 ['yield','noun','The quantity produced by a crop or investment.','Better irrigation increased the annual rice yield.','crop yield;annual yield;high yield'],
 ['urban','adjective','Connected with a town or city.','Urban residents often have easier access to public transport.','urban area;urban development;urban population'],
 ['rural','adjective','Connected with the countryside.','The programme brings broadband services to rural communities.','rural community;rural area;rural development'],
 ['population','noun','All the people living in an area, or a group being studied.','The population of the district doubled over twenty years.','population growth;ageing population;population density'],
 ['migration','noun','Movement of people or animals from one place to another.','Seasonal migration changes the number of birds on the island.','rural migration;seasonal migration;migration pattern'],
 ['demographic','adjective','Connected with the characteristics of a population.','Demographic changes have increased demand for healthcare.','demographic change;demographic data;demographic trend'],
 ['employment','noun','Paid work, or the state of having a job.','The tourism industry provides seasonal employment for local people.','full-time employment;employment opportunities;employment rate'],
 ['revenue','noun','Money received by a business or government.','Ticket sales provide most of the museum\'s revenue.','annual revenue;generate revenue;tax revenue'],
 ['expenditure','noun','Money spent on a particular purpose.','Public expenditure on education increased last year.','public expenditure;household expenditure;capital expenditure'],
 ['subsidy','noun','Money provided to reduce the cost of an activity or product.','A government subsidy made the new bus route financially viable.','government subsidy;receive a subsidy;subsidy scheme'],
 ['investment','noun','Money or effort put into something to obtain a future benefit.','Investment in staff training improved the company\'s productivity.','long-term investment;foreign investment;investment in education'],
 ['productivity','noun','The amount produced compared with the resources used.','Modern machinery helped increase productivity on the farm.','labour productivity;increase productivity;productivity growth'],
 ['inequality','noun','An unfair difference in resources, rights or opportunities.','Access to affordable childcare can reduce economic inequality.','income inequality;social inequality;reduce inequality'],
 ['accessible','adjective','Easy to reach, use or understand.','The library entrance is accessible to wheelchair users.','readily accessible;accessible information;accessible facilities'],
 ['curriculum','noun','The subjects and content taught in a course or school.','Environmental science is now part of the school curriculum.','school curriculum;core curriculum;curriculum development'],
 ['tuition','noun','Teaching, or the money charged for instruction.','The scholarship covers tuition and basic living expenses.','tuition fees;private tuition;tuition costs'],
 ['assessment','noun','An evaluation of knowledge, quality or performance.','The course includes a written assessment and a practical project.','continuous assessment;risk assessment;assessment criteria'],
 ['qualification','noun','A formally recognised achievement that shows a level of knowledge or skill.','Applicants need a recognised teaching qualification.','professional qualification;academic qualification;gain a qualification'],
 ['scholarship','noun','Financial support awarded to help a student study.','She received a scholarship to complete her postgraduate degree.','award a scholarship;scholarship application;full scholarship'],
 ['research','noun','Careful study intended to discover facts or develop knowledge.','Recent research suggests that sleep influences memory.','conduct research;research findings;academic research'],
 ['evidence','noun','Information that supports or challenges a claim.','The report provides evidence that the scheme improved attendance.','strong evidence;empirical evidence;evidence suggests'],
 ['hypothesis','noun','A proposed explanation that can be tested.','The experiment was designed to test the hypothesis.','test a hypothesis;working hypothesis;support a hypothesis'],
 ['sample','noun','A smaller selection used to represent or examine a larger whole.','The researchers interviewed a representative sample of residents.','representative sample;sample size;random sample'],
 ['variable','noun','A factor that can change or take different values.','The study controlled for age as a possible confounding variable.','independent variable;dependent variable;control a variable'],
 ['correlation','noun','A relationship in which two measures vary together.','The study found a correlation between income and life expectancy.','positive correlation;strong correlation;correlation between'],
 ['reliable','adjective','Consistently dependable or producing trustworthy results.','The team used a reliable method to measure air quality.','reliable evidence;reliable source;reliable measurement'],
 ['valid','adjective','Well founded or suitable for the purpose for which it is used.','A large sample does not automatically make a conclusion valid.','valid conclusion;valid argument;valid measurement'],
 ['approximately','adverb','Close to an amount but not exactly equal to it.','Approximately forty students attended the workshop.','approximately equal;approximately half;approximately twice'],
 ['proportion','noun','A part or share of a whole.','A growing proportion of residents work from home.','large proportion;proportion of;equal proportions'],
 ['fluctuate','verb','Change repeatedly between higher and lower levels.','Demand for electricity fluctuates throughout the day.','fluctuate widely;fluctuate between;fluctuate over time'],
 ['decline','verb','Become smaller, fewer or weaker.','The number of visitors declined after the admission fee increased.','decline gradually;decline sharply;decline in'],
 ['peak','noun','The highest point or level.','Visitor numbers reached a peak in August.','reach a peak;peak demand;at its peak'],
 ['plateau','noun','A period or level at which change stops after a rise.','After rapid growth, sales reached a plateau.','reach a plateau;growth plateau;remain at a plateau'],
 ['whereas','conjunction','Used to compare two contrasting facts.','The northern region grew rapidly, whereas the southern region remained stable.','whereas the other;whereas previously;whereas in'],
 ['nevertheless','adverb','Despite what has just been said.','The initial cost is high; nevertheless, the system may save money over time.','nevertheless remain;nevertheless important;nevertheless possible'],
 ['in contrast','phrase','Used to introduce a clear difference.','City residents preferred buses; in contrast, rural residents relied on cars.','in contrast to;in sharp contrast;by contrast'],
 ['take into account','phrase','Consider something when making a decision or judgement.','The analysis takes into account differences in household size.','take costs into account;take circumstances into account;fully take into account'],
 ['on balance','phrase','After considering the advantages and disadvantages.','On balance, the benefits of the new service outweigh its costs.','on balance beneficial;on balance positive;on balance preferable'],
];

const distinctions = {
 affect: ['Affect is usually a verb meaning influence; effect is usually a noun meaning result.'],
 effect: ['An effect is a result; to affect something is to influence it.'],
 economic: ['Economic relates to the economy; economical describes efficient use of resources.'],
 economical: ['An economical car uses little fuel; economic growth concerns the economy.'],
 rise: ['Rise has no direct object: prices rise. Raise takes an object: shops raise prices.'],
 raise: ['Raise takes an object and has raised as its past form; rise has rose and risen.'],
 adapt: ['Adapt means change to fit a situation; adopt means begin to use something.'],
 adopt: ['Adopt a policy; adapt a policy to suit a new context.'],
 principal: ['Principal means main, or a school leader; principle is a rule or belief.'],
 principle: ['A principle is a rule; principal describes the most important thing.'],
 correlation: ['Correlation alone does not establish that one variable causes the other.'],
 significant: ['A statistically significant result need not have a large practical effect.'],
 'account for': ['Account for can explain a cause or describe a share of a total; these uses need different contexts.'],
};
const relations = {
 significant:{synonyms:['substantial','notable'],antonyms:['negligible'],usage:'Use significant with difference, increase, improvement or impact; it does not always mean statistically significant.'},
 affect:{synonyms:['influence'],usage:'Affect takes a direct object: affect attendance. Avoid adding on after affect.'},
 effect:{synonyms:['impact','consequence'],usage:'Use have an effect on, or the effect of a policy on a group.'},
 economic:{usage:'Economic describes conditions or policies involving production, trade and money.'},
 economical:{synonyms:['cost-effective','efficient'],antonyms:['wasteful'],usage:'Use economical to describe a method that saves money or resources.'},
 rise:{synonyms:['increase'],antonyms:['fall'],usage:'Use rise by for the size of a change and rise to for the final value.'},
 raise:{synonyms:['increase'],antonyms:['lower'],usage:'Raise requires an object: raise prices, funds or awareness.'},
 adapt:{synonyms:['adjust'],usage:'Use adapt to followed by a situation, or adapt something for a particular purpose.'},
 adopt:{usage:'Use adopt an approach or policy; the object is the idea or practice selected.'},
 accommodation:{synonyms:['lodging'],usage:'Accommodation is normally uncountable in British English: some accommodation, not an accommodation.'},
 evidence:{usage:'Evidence is uncountable: strong evidence or a piece of evidence, not many evidences.'},
 research:{usage:'Research is usually uncountable when describing an activity: conduct research into a subject.'},
 accessible:{synonyms:['available','reachable'],antonyms:['inaccessible'],usage:'Use accessible to a group of users; explain whether access is physical, financial or informational.'},
 reliable:{synonyms:['dependable','consistent'],antonyms:['unreliable'],usage:'A reliable measurement is consistent across repetitions; validity concerns what it measures.'},
 valid:{synonyms:['sound','well-founded'],antonyms:['invalid'],usage:'Use valid for a supported argument or a measurement suited to its intended interpretation.'},
 'account for':{synonyms:['explain','represent'],usage:'Use account for followed by an outcome when explaining, or an amount when stating a share.'},
 'take into account':{synonyms:['consider'],usage:'The object may follow take or account: take costs into account; take into account the cost.'},
 whereas:{usage:'Whereas connects two clauses. Each clause must contain a subject and a finite verb.'},
 nevertheless:{synonyms:['nonetheless'],usage:'Nevertheless links complete ideas; use a full stop or semicolon before it when joining independent sentences.'},
 sustainable:{antonyms:['unsustainable'],usage:'Specify what can be sustained: resource use, financial operations or a long-term policy.'},
 fluctuate:{usage:'Use fluctuate between two limits or fluctuate around an average, rather than describing one sustained rise.'},
 approximately:{synonyms:['roughly','about'],usage:'Place approximately before a number; avoid combining it with an exact claim.'},
};

const entries = rows.map(([term,pos,definition,example,collocations]) => ({
 id: `vocab:${term.replace(/\s+/g,'-')}`, term, category: term.includes(' ') ? 'phrase' : 'word', meaning: definition, example,
 tags: ['ielts','editorial-starter'], sources: [{type:'personal',id:'fieldbook-starter',context:'Original editorial starter; source-book membership is unverified.'}],
 senses: [{id:'general',definition,example,pos,collocations:collocations.split(';'),usage:relations[term]?.usage || `Typical combinations: ${collocations.split(';').join(', ')}.`,synonyms:relations[term]?.synonyms || [],antonyms:relations[term]?.antonyms || [],distinctions:distinctions[term] || [],source:'Fieldbook editorial',license:'CC-BY-4.0'}], enrichmentPending:false,
}));
const confusionTasks = {
  affect: {prompt:'Noise from nearby construction may _____ concentration.',options:['affect','effect'],answer:'affect',explanation:'Affect is the verb meaning influence; effect is usually the noun meaning result.'},
  effect: {prompt:'The new timetable had a positive _____ on attendance.',options:['affect','effect'],answer:'effect',explanation:'An effect is a result. The noun phrase is have an effect on.'},
  economic: {prompt:'The city has experienced rapid _____ growth.',options:['economic','economical'],answer:'economic',explanation:'Economic growth concerns production and trade; economical means using few resources.'},
  economical: {prompt:'This small car is _____ to run because it uses little fuel.',options:['economic','economical'],answer:'economical',explanation:'Economical describes saving fuel or money; economic relates to the economy.'},
  rise: {prompt:'Average prices are expected to _____ next year.',options:['rise','raise'],answer:'rise',explanation:'Rise is intransitive. Raise needs a direct object.'},
  raise: {prompt:'The council will _____ parking fees next year.',options:['rise','raise'],answer:'raise',explanation:'Raise takes the direct object parking fees.'},
  adapt: {prompt:'The school must _____ its teaching methods to new needs.',options:['adapt','adopt'],answer:'adapt',explanation:'Adapt means change to fit. Adopt means begin to use.'},
  adopt: {prompt:'The committee decided to _____ the proposed policy.',options:['adapt','adopt'],answer:'adopt',explanation:'Adopt means formally accept and begin using a policy.'},
  principal: {prompt:'Lack of funding was the _____ cause of the delay.',options:['principal','principle'],answer:'principal',explanation:'Principal is an adjective meaning main; principle is a noun meaning a rule or belief.'},
  principle: {prompt:'Equal access is a central _____ of the policy.',options:['principal','principle'],answer:'principle',explanation:'A principle is a basic rule or belief.'},
};
entries.forEach(entry => { if(confusionTasks[entry.term]) entry.senses[0].distinctionTask = confusionTasks[entry.term]; });
const wordFamilies = { significant:['significance','significantly','insignificant'], economic:['economy','economist','economics'], economical:['economically','economize'], affect:['affected','affecting'], effect:['effective','effectively','effectiveness'], adapt:['adaptation','adaptable'], adopt:['adoption','adopted'], sustainable:['sustainability','sustainably','sustain'] };
entries.forEach(entry=> { entry.senses[0].register = 'General or academic English'; entry.senses[0].wordFamily = wordFamilies[entry.term] || []; });
entries.find(entry => entry.term === 'significant').senses.push({id:'statistical',definition:'Unlikely under a specified statistical model and significance threshold.',example:'The measured difference was statistically significant at the five per cent level.',pos:'adjective',collocations:['statistically significant','significant association'],usage:'Name the test or threshold when interpreting a statistical result.',synonyms:[],antonyms:['statistically insignificant'],distinctions:distinctions.significant,source:'Fieldbook editorial',license:'CC-BY-4.0'});
entries.find(entry => entry.term === 'account for').senses.push({id:'explain',definition:'Provide an explanation for something.',example:'Differences in prior experience may account for the variation in scores.',pos:'verb',collocations:['account for variation','account for a discrepancy'],usage:'Use account for plus the outcome that is being explained.',source:'Fieldbook editorial',license:'CC-BY-4.0',distinctions:distinctions['account for']});

const units = [];
const books = metadata.map(([sourceBookId,title,totalSourceWords,chapters], bookIndex) => {
 const id = `guixue:${sourceBookId}`;
 chapters.forEach(([chapterId,chapterTitle,groups], chapterIndex) => {
  units.push({id:chapterId,bookId:id,sourceUnitId:chapterId,parentId:null,title:chapterTitle,order:chapterIndex,kind:'chapter',contentStatus:'pending'});
  groups.split(' ').forEach((group,index) => {
   const [unitId,count] = group.split(':');
   units.push({id:unitId,bookId:id,sourceUnitId:unitId,parentId:chapterId,title:bookIndex > 3 ? `Part ${index+1}` : `Group ${index+1}`,order:index,kind:'group',totalSourceWords:Number(count),contentStatus:'pending'});
  });
 });
 units.push({id:`starter:${sourceBookId}`,bookId:id,parentId:null,title:'Editorial starter selection',order:-1,kind:'starter',contentStatus:'starter'});
 return {id,sourceBookId,title,totalSourceWords,chapterCount:chapters.length,contentStatus:'starter',importedEntryCount:0,starterEntryCount:12,description:'Public hierarchy verified. Full source words await an authorised personal import. Included practice is an original editorial starter selection.',source:'Guixue public book metadata',metadataVerifiedAt:'2026-10-10',skill:bookIndex===1?'reading':bookIndex===0?'writing':'listening'};
});
const memberships = books.flatMap((book,index) => entries.slice(index*12,index*12+12).map((entry,order) => ({id:`${book.id}:starter:${entry.id}`,entryId:entry.id,bookId:book.id,unitId:`starter:${book.sourceBookId}`,order,source:'Fieldbook editorial starter selection',verifiedSourceMembership:false})));
books.forEach(book => { book.starterEntryCount = memberships.filter(member => member.bookId === book.id).length; });

export const VOCABULARY_CATALOG = { entries, books, units, memberships };
