import json, subprocess, time, hashlib
from pathlib import Path
repo=Path('/home/hermes/projects/orch8-test-investigation')
out=Path('/home/hermes/orch8-evidence/reliability-package')
out.mkdir(exist_ok=True)
results=[]
def run(name,args,cwd):
    started=time.time()
    with (out/(name+'.log')).open('w') as log:
        p=subprocess.run(args,cwd=cwd,stdout=log,stderr=subprocess.STDOUT)
    row={'name':name,'command':args,'cwd':str(cwd),'exitCode':p.returncode,'started':started,'finished':time.time()}
    results.append(row)
    (out/'gates.json').write_text(json.dumps(results,indent=2)+'\n')
    print(name,p.returncode,flush=True)
    assert p.returncode==0,row
    return row

def validate(path,expected,files=None):
    d=json.loads(path.read_text())
    assertions=[a for f in d['testResults'] for a in f['assertionResults']]
    assert d['success'] is True and d['numTotalTests']==expected and d['numPassedTests']==expected,d
    assert d['numFailedTests']==0 and d['numPendingTests']==0
    assert len(assertions)==expected and all(a['status']=='passed' for a in assertions)
    assert all(f['status']=='passed' for f in d['testResults'])
    if files is not None: assert len(d['testResults'])==files
    return {'report':str(path),'tests':expected,'files':len(d['testResults']),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
full=[validate(repo/'packages'/pkg/'vitest-review-final.json',n) for pkg,n in [('shared',180),('daemon',770),('dashboard',276),('cli',4)]]
(out/'full-validation.json').write_text(json.dumps({'reports':full,'total':sum(r['tests'] for r in full)},indent=2)+'\n')
for name,args in [('build',['pnpm','exec','turbo','run','build','--force']),('typecheck',['pnpm','exec','turbo','run','typecheck','--force']),('lint',['pnpm','lint'])]:
    run(name,args,repo)
files=['src/__tests__/'+s+'.test.ts' for s in ['async-work','heartbeat-integration','chats-routes','chat-message-replay','chat.service']]
for mode in ['normal','single-worker']:
    for i in range(1,4):
        name=f'focused-{mode}-{i}'
        report=out/(name+'.json')
        assert not report.exists()
        args=['pnpm','exec','vitest','run',*files,'--reporter=json','--outputFile='+str(report)]
        if mode=='single-worker': args+=['--maxWorkers=1','--no-file-parallelism']
        row=run(name,args,repo/'packages/daemon')
        row['validation']=validate(report,33,5)
        assert report.stat().st_mtime>=row['started']
        (out/'gates.json').write_text(json.dumps(results,indent=2)+'\n')
print('ALL GATES PASSED',flush=True)
