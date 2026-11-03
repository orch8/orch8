import json, os, subprocess
from pathlib import Path
root = Path('/home/hermes/projects/orch8-heartbeat-isolation/packages/daemon')
out = Path('/home/hermes/orch8-evidence/heartbeat-isolation')
env = dict(os.environ, TMPDIR='/dev/shm')
results = []
for i in range(1, 6):
    name = f'focused-{i}'
    command = ['node', 'node_modules/vitest/vitest.mjs', 'run', 'src/__tests__/heartbeat.service.test.ts', 'src/__tests__/heartbeat-idempotency.test.ts', 'src/__tests__/heartbeat-integration.test.ts', 'src/__tests__/heartbeat-broadcast.test.ts', '--no-file-parallelism', '--maxWorkers=1', '--reporter=json', f'--outputFile={out / (name + ".json")}']
    with (out / (name + '.log')).open('w') as log:
        p = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=180)
    d = json.loads((out / (name + '.json')).read_text())
    assertions = [a for t in d['testResults'] for a in t['assertionResults']]
    record = dict(name=name, command=command, exit=p.returncode, success=d['success'], total=d['numTotalTests'], failed=d['numFailedTests'], files=len(d['testResults']))
    results.append(record)
    (out / 'validation.json').write_text(json.dumps(results, indent=2))
    print(record, flush=True)
    assert p.returncode == 0 and d['success'] and d['numFailedTests'] == 0
    assert len(d['testResults']) == 4 and all(a['status'] == 'passed' for a in assertions)
with (out / 'typecheck.log').open('w') as log:
    p = subprocess.run(['node', 'node_modules/typescript/bin/tsc', '--noEmit'], cwd=root, stdout=log, stderr=subprocess.STDOUT, timeout=120)
print('typecheck exit', p.returncode, flush=True)
assert p.returncode == 0
