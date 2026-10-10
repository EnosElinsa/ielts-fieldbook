"""Persistent, paced Commons metadata collection; no learning/account data. Stop on repeated rate limit."""
import json,time,urllib.parse,urllib.request,urllib.error,argparse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def file_title(url):
    parts=urllib.parse.unquote(urllib.parse.urlsplit(url).path).split('/')
    return 'File:'+(parts[-2] if 'transcoded' in parts else parts[-1]).replace('_',' ')
def collect(titles,cachepath):
    cache=json.loads(cachepath.read_text(encoding='utf8')) if cachepath.exists() else {}
    pending=sorted(set(titles)-set(cache)); limited=0
    for i in range(0,len(pending),40):
        group=pending[i:i+40]
        query=urllib.parse.urlencode({'action':'query','format':'json','prop':'imageinfo','iiprop':'url|mime|size|extmetadata','redirects':1,'titles':'|'.join(group),'maxlag':5})
        try:
            req=urllib.request.Request('https://commons.wikimedia.org/w/api.php?'+query,headers={'User-Agent':'FieldbookMediaAudit/1.0 (public educational media)'} )
            response=urllib.request.urlopen(req,timeout=35); result=json.load(response)
            if 'error' in result: print(result['error'],flush=True);break
            pages={p['title']:p for p in result.get('query',{}).get('pages',{}).values()}; transforms={t['from']:t['to'] for k in ['normalized','redirects'] for t in result.get('query',{}).get(k,[])}
            for title in group:
                name=title;seen=set()
                while name in transforms and name not in seen:seen.add(name);name=transforms[name]
                if name in pages:cache[title]=pages[name]
            temp=cachepath.with_suffix('.tmp');temp.write_text(json.dumps(cache,ensure_ascii=False),encoding='utf8');temp.replace(cachepath)
            print(json.dumps({'cached':len(cache),'remaining':len(pending)-i-len(group)}),flush=True)
        except urllib.error.HTTPError as error:
            print('HTTP',error.code,'cache retained',flush=True)
            if error.code==429:
                limited+=1
                if limited>=2:break
                try: wait=max(60,float(error.headers.get('Retry-After','60')))
                except ValueError:wait=60
                time.sleep(min(wait,300))
                break # don't immediately re-hit a server which rejected this collector
        except Exception as error:print(type(error).__name__,'cache retained',flush=True)
        time.sleep(4.5)
    return cache
if __name__=='__main__':
    catalog=json.loads((ROOT/'public/vocabulary-catalog.json').read_text(encoding='utf8'))
    titles=[file_title(url) for e in catalog['entries'] for a in ['uk','us'] if (url:=(e.get('pronunciation') or {}).get(a))]
    terms=['vegetable','fruit','apple','core','peel','strip','recipe','treat','order','bull','cock','rock','mandarin','courtship','appliance','temple','paste','democracy','warn','commitment','mantle','crust','gale','cathedral','horse','plant','earth','mountain','river','ocean','tree','leaf','flower','bird','dog','cat','table','chair','knife','bread','rice','meat','fish','milk','egg','water','cashier','kit','fitness','feature','reserve','discount','cultivation','impression','compound','discharge','concentration','fundamental','array','attitude','underlie']
    titles += ['File:En-'+a+'-'+term+'.ogg' for term in terms for a in ['uk','us']]
    cachepath=ROOT/'local/context-media-plan/commons-audio-metadata.json';collect(titles,cachepath)
