import json,time,uuid,http.cookiejar,urllib.request,urllib.parse
from pathlib import Path
import sys
base=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1'
env=dict(line.split('=',1) for line in Path('/opt/singflow/backend.env').read_text().splitlines() if '=' in line)
jar=http.cookiejar.CookieJar()
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
measurements=[]
origin=env['SINGFLOW_PUBLIC_APP_URL']
def call(method,path,data=None,form=False,headers=None,label=None):
    headers=dict(headers or {})
    if method!='GET': headers['Origin']=origin
    if base=='http://127.0.0.1' and list(jar):
        headers['Cookie']='; '.join(c.name+'='+c.value for c in jar)
    body=None
    if data is not None:
        body=(urllib.parse.urlencode(data) if form else json.dumps(data)).encode()
        headers['Content-Type']='application/x-www-form-urlencoded' if form else 'application/json'
    request=urllib.request.Request(base+path,data=body,headers=headers,method=method)
    start=time.perf_counter()
    with opener.open(request,timeout=30) as response:
        raw=response.read()
        status=response.status
    elapsed=round((time.perf_counter()-start)*1000,1)
    if label: measurements.append({'operation':label,'http':status,'milliseconds':elapsed})
    return json.loads(raw) if raw else None
def post(path,data=None,form=False,label=None):
    csrf=call('GET','/api/auth/csrf')
    return call('POST',path,data,form,{csrf['headerName']:csrf['token']},label)
post('/api/auth/login',{'email':env['SINGFLOW_HOST_EMAIL'],'password':env['SINGFLOW_HOST_PASSWORD']},True,'login')
me=call('GET','/api/auth/me',label='account')
session=post('/api/sessions',{'operationId':str(uuid.uuid4()),'name':'Verificação AWS - '+time.strftime('%H:%M:%S')},label='create-session')
sid=session['id']
post('/api/sessions/'+sid+'/open',label='open-session')
for i in range(3):
    p=post('/api/sessions/'+sid+'/participants',{'operationId':str(uuid.uuid4()),'name':'Teste AWS '+str(i+1),'title':'Música teste '+str(i+1),'artist':'Validação AWS'},label='create-participant')
    pid=p['participant']['id']
    post('/api/sessions/'+sid+'/participants/'+pid+'/requests',{'operationId':str(uuid.uuid4()),'title':'Segunda música '+str(i+1),'artist':'Validação AWS'},label='add-song')
stage=call('GET','/api/sessions/'+sid+'/stage',label='stage')
first=stage['suggestions'][0]
stage=post('/api/sessions/'+sid+'/stage/calls',{'operationId':str(uuid.uuid4()),'participantId':first['participantId'],'expectedRequestId':first['requestId'],'allowOutOfOrder':False},label='call-participant')
assert stage['active']['participantId']==first['participantId']
stage=post('/api/sessions/'+sid+'/stage/calls/'+stage['active']['id']+'/resolve',{'outcome':'COMPLETED'},label='complete-performance')
assert stage['active'] is None and stage['history'][0]['status']=='COMPLETED'
entry=call('GET','/api/sessions/'+sid+'/entry-link')
assert entry['url'].startswith(origin+'/participante/')
post('/api/sessions/'+sid+'/close',label='close-session')
report={'result':'PASS','base':base,'qrHostCorrect':True,'measurements':measurements}
print(json.dumps(report))
