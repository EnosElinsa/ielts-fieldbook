"""Complete offline audit of each legacy asset plus cached exact public supplements.
Metadata-confirmed is not listening-tested. Unknown and network failures are explicit.
"""
import json,re,html,urllib.parse,urllib.request,urllib.error,time,argparse
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parents[1]
VERSION='media-2026-10-11.2'
def read(p):return json.loads((ROOT/p).read_text(encoding='utf8'))
def clean(v):return re.sub(r'\s+',' ',re.sub(r'<[^>]+>','',html.unescape(v or ''))).strip()
def file_title(url):
 parts=urllib.parse.unquote(urllib.parse.urlsplit(url).path).split('/')
 return 'File:'+(parts[-2] if 'transcoded' in parts else parts[-1]).replace('_',' ')
def bare(url):
 parts=urllib.parse.urlsplit(url)
 def keep(parameter):
  name=urllib.parse.unquote_plus(parameter.split('=',1)[0]).lower()
  return not name.startswith('utm_') and name not in ['fbclid','gclid','dclid','msclkid','_ga','_gl','mc_cid','mc_eid']
 query='&'.join(parameter for parameter in parts.query.split('&') if keep(parameter))
 return parts._replace(query=query,fragment='').geturl()
def target(title,meta):
 cats=clean(meta.get('Categories',{}).get('value','')).lower()
 regions=[a for a,c in [('uk','british english pronunciation'),('us','u.s. english pronunciation'),('other','australian english pronunciation'),('other','canadian english pronunciation'),('other','new zealand english pronunciation')] if c in cats]
 if len(set(regions))==1:return regions[0],'Commons pronunciation category: '+cats
 # Filename explicitly contradicting UK/US is enough to reject legacy label, not enough to prove target.
 if re.search(r'\ben[-_ ](au|ca|nz)\b',title,re.I):return 'other','Filename explicitly specifies a non-UK/US region; requested UK/US label rejected.'
 return 'unknown','No exact regional pronunciation category; LL speaker IDs are not an accent.'
def term_matches(term,title):
 stem=title[5:].rsplit('.',1)[0].lower().replace('_',' ')
 stem=re.sub(r'^(?:en[- ](?:us|uk|gb|au|ca|nz)[- ])', '',stem)
 # Word-boundary match permits POS/speaker suffixes, not a different wordform.
 return bool(re.search(r'(?<!\w)'+re.escape(term.lower())+r'(?!\w)',stem))
def shard(id):
 h=0
 for c in id:h=(h*31+ord(c))&0xffffffff
 return format(h%16,'x')
def run(probe=False):
 catalog=read('public/vocabulary-catalog.json');cache=read('local/context-media-plan/commons-audio-metadata.json');probe_path=ROOT/'local/context-media-plan/audio-http-status.json';http=json.loads(probe_path.read_text(encoding='utf8')) if probe_path.exists() else {}; rows=[];by={};unique={}
 def recording(e,title,url,requested=None,supplement=False):
  page=cache.get(title);ii=((page or {}).get('imageinfo')or[{}])[0];meta=ii.get('extmetadata',{});accent,reason=target(title,meta);matches=term_matches(e['term'],title)
  mime=ii.get('mime','');format_ok=mime.startswith('audio/') or mime in ['application/ogg','application/x-ogg'] or not mime and re.search(r'\.(ogg|oga|wav|mp3|flac)$',title,re.I)
  author=clean(meta.get('Artist',{}).get('value',''));license=clean(meta.get('LicenseShortName',{}).get('value',''));license_url=meta.get('LicenseUrl',{}).get('value','');source=ii.get('descriptionurl') or 'https://commons.wikimedia.org/wiki/'+urllib.parse.quote(title.replace(' ','_'),safe=':')
  status='missing' if page is not None and 'missing' in page else 'rejected' if not matches or requested and accent!='unknown' and accent!=requested else 'verified' if ii and matches and accent in ['uk','us'] and format_ok and author and license and license_url else 'unknown'
  if not matches:reason+=' Wordform does not match the catalogue term.'
  if status=='unknown':reason+=' Author/license or accent evidence is incomplete; automatic target playback withheld.'
  original=bare(ii.get('url')or url);availability='metadata-only' if ii else 'network-unverified'
  if probe_state[0] and status=='verified' and original not in http:
   try:
    req=urllib.request.Request(original,headers={'User-Agent':'FieldbookMediaAudit/1.0','Range':'bytes=0-127'})
    with urllib.request.urlopen(req,timeout=20) as response:
     content_type=response.headers.get('Content-Type','');data=response.read(128);ok=(content_type.startswith('audio/') or content_type.split(';')[0]=='application/ogg') and len(data)>0;http[original]={'status':response.status,'mime':content_type,'availability':'http-audio' if ok else 'failed'}
   except urllib.error.HTTPError as error:
    http[original]={'status':error.code,'availability':'network-unverified' if error.code==429 or error.code>=500 else 'failed'}
    if error.code==429:print('Audio HTTP rate limit; stop probes and preserve statuses',flush=True);probe_state[0]=False
   except Exception as error:http[original]={'error':type(error).__name__,'availability':'network-unverified'}
   probe_path.write_text(json.dumps(http,indent=2),encoding='utf8');time.sleep(4.5)
  availability=http.get(original,{}).get('availability',availability)
  r={'url':original,'aliases':[bare(url)] if requested else [],'title':title,'accent':accent,'status':status,'availability':availability,'reason':reason,'author':author,'license':license,'licenseUrl':license_url,'sourceUrl':source,'changes':'Original Commons recording; no media edits.','wordformConfirmed':matches}
  if requested:r['legacyAccent']=requested
  rows.append({'entryId':e['id'],'term':e['term'],**r,'supplement':supplement,'metadataPresent':bool(page),'wordformConfirmed':matches,'mime':mime or 'unknown','listeningReviewed':False});return r
 probe_state=[probe]
 for e in catalog['entries']:
  rec=[]
  for accent in ['uk','us']:
   url=(e.get('pronunciation')or{}).get(accent)
   if url:
    t=file_title(url);unique[t]=url;rec.append(recording(e,t,url,accent))
  # Exact target probes only; no arbitrary runtime term search.
  for accent in ['uk','us']:
   t='File:En-'+accent+'-'+e['term'].lower()+'.ogg'
   if t in cache and cache[t].get('imageinfo') and not any(r['title']==t for r in rec):
    rec.append(recording(e,t,cache[t]['imageinfo'][0]['url'],supplement=True))
  if rec:by[e['id']]={'version':VERSION,'recordings':rec}
 shards={format(i,'x'):{} for i in range(16)}
 for eid,value in by.items():shards[shard(eid)][eid]=value
 directory=ROOT/'public/vocabulary-media/audio';directory.mkdir(parents=True,exist_ok=True)
 for sid,data in shards.items():(directory/(sid+'.json')).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
 bybook=[]
 context=read('src/domain/vocabulary/contextSenseOverlay.json');images=read('src/domain/vocabulary/illustrations.json')['images'];content=read('docs/vocabulary-context-audit.json')['summary']['byBook'];contentbooks={b['bookId']:b for b in content};entries={e['id']:e for e in catalog['entries']}
 for b in catalog['books']:
  ids={m['entryId'] for m in catalog['memberships'] if m['bookId']==b['id']};rr=[r for r in rows if r['entryId'] in ids];ee=[by.get(i,{'recordings':[]}) for i in ids]
  imageids=set()
  for membership in catalog['memberships']:
   if membership['bookId']!=b['id']:continue
   binding=next((item for item in context['bindings'] if item['entryId']==membership['entryId'] and item['bookId']==b['id'] and item['unitId']==membership['unitId']),None) or next((item for item in context['defaults'] if item['entryId']==membership['entryId']),None)
   if binding and any(image['entryId']==membership['entryId'] and image['senseId']==binding['sense']['id'] and (not image.get('bookId') or image['bookId']==b['id'] and image['unitId']==membership['unitId']) for image in images):imageids.add(membership['entryId'])
  bybook.append({'illustratedEntries':len(imageids),'contentCorrectedMemberships':contentbooks[b['id']]['contentCorrectedMemberships'],'contextResolvedMemberships':contentbooks[b['id']]['contextResolvedMemberships'],'bookId':b['id'],'title':b['title'],'uniqueEntries':len(ids),'ukMetadataVerifiedEntries':sum(any(r['accent']=='uk' and r['status']=='verified' for r in e['recordings']) for e in ee),'usMetadataVerifiedEntries':sum(any(r['accent']=='us' and r['status']=='verified' for r in e['recordings']) for e in ee),'httpAudioEntries':sum(any(r['availability']=='http-audio' for r in e['recordings']) for e in ee),'unknownEntries':sum(any(r['status']=='unknown' for r in e['recordings']) for e in ee),'missingRecordingEntries':sum(not e['recordings'] for e in ee),'networkUnverifiedRecordings':sum(r['availability']=='network-unverified' for r in rr),'rejectedLegacyLabels':sum(r['status']=='rejected' for r in rr)})
 summary={'version':VERSION,'entriesScanned':len(catalog['entries']),'legacyUniqueFiles':len(unique),'cachedLegacyUniqueFiles':sum(t in cache for t in unique),'unfetchedLegacyUniqueFiles':sum(t not in cache for t in unique),'records':len(rows),'status':dict(Counter(r['status'] for r in rows)),'availability':dict(Counter(r['availability'] for r in rows)),'verifiedUk':sum(r['status']=='verified' and r['accent']=='uk' for r in rows),'verifiedUs':sum(r['status']=='verified' and r['accent']=='us' for r in rows),'supplements':sum(r['supplement'] for r in rows),'cachedExactProbeMissingFiles':sum('missing' in p for t,p in cache.items() if t.startswith(('File:En-uk-', 'File:En-us-'))),'illustrationAssets':len({image['src'] for image in images}),'illustrationSenseBindings':len(images),'byBook':bybook}
 (ROOT/'docs/vocabulary-media-audit.json').write_text(json.dumps({'summary':summary,'recordings':rows},indent=2,ensure_ascii=False)+'\n',encoding='utf8')
 lines=['# Vocabulary media audit','', 'Generated by `python scripts/audit-vocabulary-media.py`. Every legacy asset is enumerated; Commons metadata/category verification is separate from listening and HTTP playability. No listening review is claimed. Runtime metadata is16on-demand public JSON shards, not a main bundle import.','',json.dumps({k:v for k,v in summary.items() if k!='byBook'},indent=2),'','| Book | Unique entries | UK metadata verified | US metadata verified | HTTP audio entries | Unknown entries | No recording | Network unverified recordings | Rejected labels | Illustrated entries | Content corrected memberships | Context resolved memberships |','|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
 for b in bybook:lines.append('| '+' | '.join(str(b[k]) for k in ['title','uniqueEntries','ukMetadataVerifiedEntries','usMetadataVerifiedEntries','httpAudioEntries','unknownEntries','missingRecordingEntries','networkUnverifiedRecordings','rejectedLegacyLabels','illustratedEntries','contentCorrectedMemberships','contextResolvedMemberships'])+' |')
 lines+=['','Unknown recordings preserve original URLs and legacy markers in static metadata. Only verified exact UK/US assets play automatically. Other/unknown recordings require explicit selection; absent verified target recordings use matching device speech. Metadata-only assets have not been HTTP/listening certified. Commons rate limiting leaves unknown evidence explicit. Existing pronunciation uk/us/ipa fields are unchanged.','', 'Six locally optimized image files were visually inspected. Eight sense bindings cover vegetable, food/plant fruit, fruit/geography core, cock, rock material and appliance. Geography core requires its book/group binding; rock music cannot receive the material image. No abstract placeholders.']
 (ROOT/'docs/vocabulary-media-audit.md').write_text('\n'.join(lines)+'\n',encoding='utf8');print(json.dumps(summary,indent=2),flush=True)
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--probe',action='store_true');args=parser.parse_args();run(args.probe)
