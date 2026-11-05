# GitHub URL in repository setup

A Chromium session opened the current dashboard at `http://127.0.0.1:5189/projects/new` and showed the optional GitHub repository URL field and its draft-PR explanation. The screenshot is `setup.png`.

This inspection ran with only the Vite dashboard; its sidebar shows the daemon loading. No project was created in this browser run, no agent executed, and no pull request was published through Orch8. The component test checks that the create-project payload includes a supplied URL and omits it for a local-only checkout. The host Codex sandbox still fails before command execution, so the end-to-end agent workflow remains unproven.
