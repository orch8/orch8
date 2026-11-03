"""Exercise the exact workflow report guard with synthetic inputs, not app results."""
import json
from pathlib import Path
import subprocess
import tempfile
import yaml

root = Path(__file__).resolve().parents[2]
workflow = yaml.safe_load((root / '.github/workflows/v2-verification.yml').read_text())
step = next(s for s in workflow['jobs']['verify']['steps'] if s['name'] == 'Test')
script = step['run'].split("<<'NODE'", 1)[1].split('\n', 1)[1].rsplit('\nNODE', 1)[0]
valid = dict(success=True, numTotalTests=2, numPassedTests=2, numFailedTests=0, numFailedTestSuites=0)
cases = {
    'valid': (valid, True),
    'failed': ({**valid, 'success': False, 'numFailedTests': 1}, False),
    'empty': ({**valid, 'numTotalTests': 0, 'numPassedTests': 0}, False),
    'skipped': ({**valid, 'numPassedTests': 1}, False),
    'absent_counts': (dict(success=True, numFailedTests=0, numFailedTestSuites=0), False),
    'numeric_strings': ({**valid, 'numTotalTests': '2', 'numPassedTests': '2'}, False),
    'negative': ({**valid, 'numFailedTestSuites': -1}, False),
    'fractional': ({**valid, 'numTotalTests': 2.5, 'numPassedTests': 2.5}, False),
    'null_counts': ({**valid, 'numTotalTests': None, 'numPassedTests': None}, False),
    'missing_file': (None, False),
    'malformed_json': ('{', False),
}
for name, (report, expected) in cases.items():
    with tempfile.TemporaryDirectory(prefix='orch8-report-guard-') as tmp:
        for package in ['cli', 'shared', 'dashboard', 'daemon']:
            p = Path(tmp) / 'packages' / package / 'vitest-results.json'
            p.parent.mkdir(parents=True)
            value = report if package == 'daemon' else valid
            if value is not None:
                p.write_text(value if isinstance(value, str) else json.dumps(value))
        result = subprocess.run(['node', '--input-type=module', '-e', script], cwd=tmp, capture_output=True, text=True)
        assert (result.returncode == 0) == expected, (name, result.stdout, result.stderr)
        print(f'{name}: PASS (exit {result.returncode}, expected {"accept" if expected else "reject"})')
print(f'{len(cases)} synthetic guard cases passed')
