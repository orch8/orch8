import os, json, subprocess, hashlib
from pathlib import Path
root = Path('/home/hermes/projects/orch8-heartbeat-isolation')
out = Path('/home/hermes/orch8-evidence/heartbeat-isolation')
source = root/'packages/daemon/src/__tests__/heartbeat.service.test.ts'
before = hashlib.sha256(source.read_bytes()).hexdigest()
files = ['heartbeat.service.test.ts','heartbeat-idempotency.test.ts','heartbeat-integration.test.ts','heartbeat-broadcast.test.ts','startup.test.ts','pipeline-approval-safety.test.ts']
report = out/'independent-focused.json'
assert not report.exists(), 'Require fresh report'
cmd = ['node','node_modules/vitest/vitest.mjs','run', *['src/__tests__/'+f for f in files], '--no-file-parallelism','--maxWorkers=1','--reporter=json','--outputFile='+str(report)]
with (out/'independent-focused.log').open('w') as log:
    p = subprocess.run(cmd, cwd=root/'packages/daemon', env=dict(os.environ,TMPDIR='/dev/shm'),stdout=log,stderr=subprocess.STDOUT,timeout=240)
d = json.loads(report.read_text())
a = [a for t in d['testResults'] for a in t['assertionResults']]
summary = dict(command=cmd,exit=p.returncode,source_before=before,source_after=hashlib.sha256(source.read_bytes()).hexdigest(),success=d['success'],total=d['numTotalTests'],passed=d['numPassedTests'],failed=d['numFailedTests'],pending=d['numPendingTests'],files=[dict(name=t['name'],status=t['status'],assertions=len(t['assertionResults'])) for t in d['testResults']])
(out/'independent-validation.json').write_text(json.dumps(summary,indent=2))
print(json.dumps(summary,indent=2))
assert p.returncode==0 and d['success'] and d['numFailedTests']==d['numPendingTests']==0
assert len(a)==d['numTotalTests']==d['numPassedTests'] and all(x['status']=='passed' for x in a)
assert {Path(t['name']).name for t in d['testResults']}==set(files)
assert all(t['status']=='passed' for t in d['testResults']) and summary['source_before']==summary['source_after']
