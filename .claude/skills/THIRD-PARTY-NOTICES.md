# Third-party skills

All 166 skills in this directory are copied unchanged from
https://github.com/K-Dense-AI/scientific-agent-skills at commit
`065b734670d7d990627dbc06a05b5a99be33f1f1` (version 2.68.0), © 2025 K-Dense Inc., MIT License
(see `LICENSE-scientific-agent-skills.md`). Only `skills/` was copied; the upstream `docs/` folder is not included.

Update: `git clone https://github.com/K-Dense-AI/scientific-agent-skills` and copy `skills/.` over this directory.

Security notes (upstream report of 2026-09-28, reviewed before installing):
- 8 skills are flagged CRITICAL by the upstream scanner (autoskill, citation-management, infographics,
  latex-posters, literature-review, research-lookup, scientific-schematics, scientific-slides) because their
  scripts read an API key from the environment and call a network service. Each key is sent only to its own
  service (OpenRouter, NCBI, OpenAlex/Crossref, Anthropic, Parallel). `autoskill` also accepts a configurable
  Foundry endpoint: only point it at a service you trust.
- 3 skills flagged HIGH (histolab, modal, waypoint-bio) are false positives (`cv2.CV_64F`, model `.eval()`).
- nextflow, paperclip, pi-agent and literature-review document installing tools with `curl … | bash`;
  review those installers before running them.
