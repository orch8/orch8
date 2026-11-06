const PREREQUISITES = "https://developers.openai.com/codex/concepts/sandboxing#prerequisites";

/** Shown only for the known Linux bubblewrap namespace failure, not for arbitrary agent errors. */
export function SandboxRecoveryGuidance({ message }: { message: string }) {
  if (!/\b(?:bwrap|bubblewrap)\b/i.test(message) || !/Failed RTM_NEWADDR|user namespace/i.test(message)) return null;

  return <aside aria-label="Codex sandbox recovery" className="space-y-2 rounded border border-amber-700/60 bg-amber-950/20 p-3 text-xs text-amber-100">
    <h3 className="font-semibold">Codex sandbox needs host setup</h3>
    <p>The agent could not run a shell command, so planning cannot inspect this repository. On Ubuntu or Debian, a host administrator should install the distribution bubblewrap package:</p>
    <pre className="overflow-auto rounded bg-zinc-950 p-2 text-zinc-200">sudo apt install bubblewrap</pre>
    <p>On Ubuntu 24.04, if the sandbox still fails, install and load the scoped AppArmor profile:</p>
    <pre className="overflow-auto rounded bg-zinc-950 p-2 text-zinc-200">{`sudo apt update
sudo apt install apparmor-profiles apparmor-utils
sudo install -m 0644 /usr/share/apparmor/extra-profiles/bwrap-userns-restrict /etc/apparmor.d/bwrap-userns-restrict
sudo apparmor_parser -r /etc/apparmor.d/bwrap-userns-restrict`}</pre>
    <p>Do not disable AppArmor globally or bypass the Codex sandbox. Once an administrator has repaired the host, retry Check agent runtime before preparing a branch. These commands are guidance, not actions Orch8 runs for you.</p>
    <a href={PREREQUISITES} target="_blank" rel="noopener noreferrer" className="text-blue-300 underline">Codex sandbox prerequisites</a>
  </aside>;
}
