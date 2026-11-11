const PREREQUISITES = "https://developers.openai.com/codex/concepts/sandboxing#prerequisites";

/** Show recovery only for recognized failures from the agent that failed. */
export function SandboxRecoveryGuidance({ message, adapterType }: { message: string; adapterType: string }) {
  if (adapterType === "claude_local" && /Claude authentication expired|OAuth access token has expired/i.test(message)) {
    return <aside aria-label="Claude authentication recovery" className="space-y-2 rounded border border-amber-700/60 bg-amber-950/20 p-3 text-xs text-amber-100">
      <h3 className="font-semibold">Claude Code needs a fresh sign-in</h3>
      <p>Claude Code's saved account may still appear logged in even after its access token expires. Sign in from a terminal as the same user running Orch8, then retry Check agent runtime. No feature run was started.</p>
      <pre className="max-w-full overflow-auto whitespace-pre-wrap break-all rounded bg-zinc-950 p-2 text-zinc-200">claude auth login</pre>
      <p>If sign-in needs a browser, complete it interactively; Orch8 cannot approve it for you. Do not bypass agent permissions or the runtime check.</p>
    </aside>;
  }
  if (adapterType !== "codex_local" || !/\b(?:bwrap|bubblewrap)\b/i.test(message) || !/Failed RTM_NEWADDR|user namespace/i.test(message)) return null;

  return <aside aria-label="Codex sandbox recovery" className="space-y-2 rounded border border-amber-700/60 bg-amber-950/20 p-3 text-xs text-amber-100">
    <h3 className="font-semibold">Codex sandbox needs host setup</h3>
    <p>The agent could not run a shell command, so planning cannot inspect this repository. On Ubuntu or Debian, a host administrator should install the distribution bubblewrap package:</p>
    <pre className="max-w-full overflow-auto whitespace-pre-wrap break-all rounded bg-zinc-950 p-2 text-zinc-200">sudo apt install bubblewrap</pre>
    <p>On Ubuntu 24.04, if the sandbox still fails, install and load the scoped AppArmor profile:</p>
    <pre className="max-w-full overflow-auto whitespace-pre-wrap break-all rounded bg-zinc-950 p-2 text-zinc-200">{`sudo apt update
sudo apt install apparmor-profiles apparmor-utils
sudo install -m 0644 /usr/share/apparmor/extra-profiles/bwrap-userns-restrict /etc/apparmor.d/bwrap-userns-restrict
sudo apparmor_parser -r /etc/apparmor.d/bwrap-userns-restrict`}</pre>
    <p>Do not disable AppArmor globally or bypass the Codex sandbox. Once an administrator has repaired the host, retry Check agent runtime before preparing a branch. These commands are guidance, not actions Orch8 runs for you.</p>
    <a href={PREREQUISITES} target="_blank" rel="noopener noreferrer" className="text-blue-300 underline">Codex sandbox prerequisites</a>
  </aside>;
}
