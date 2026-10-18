# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| `.env` and `migrations/` → `permissions.deny` in settings | CLAUDE.md is context, not enforced configuration. Deny rules block in every permission mode, even `bypassPermissions`, and are evaluated before ask/allow. | "Must never read/edit X" → permissions deny, not a louder CLAUDE.md line |
| Prettier → `PostToolUse` hook with matcher `Edit\|Write` | Hooks are deterministic: they run every time. A CLAUDE.md "ALWAYS run prettier" is advisory. | "Every time, zero exceptions" → hook |
| "Tests must pass before stopping" → `Stop` hook (scenario G10) | A Stop hook that exits 2 blocks the turn from ending and feeds stderr back to Claude. | Deterministic gate on finishing |
| Route rules → `.claude/rules/http-routes.md` with `paths: ["src/routes/**/*.ts"]` | Path-scoped rules load only when Claude reads or edits a matching file. They cost nothing elsewhere and don't dilute CLAUDE.md. | "Convention for one part of the codebase" → rules with `paths` globs |
| Release procedure → a skill with `disable-model-invocation: true` | A skill's body loads only when invoked. Side effects (tag, push) should only start when a human types `/release`. | "Procedure / rarely needed knowledge" → skill; "side-effecting workflow" → user-invoked only |
| Webhook background (G9) → skill | Needed occasionally; a skill's description stays in context while the body loads on demand. | Same |
| `money-audit` → `context: fork` + `agent: Explore` | It reads many files. Forking keeps those reads out of the main context, `Explore` is read-only, and only the summary comes back. | O14: isolate a self-contained task to avoid cross-contaminating session state |
| `money-audit` body restates the rules and the output format | A forked skill doesn't see the conversation. Its content *is* the subagent's prompt. | "Forked skill returns poor results" → it lacks context it assumed it had |
| `money-style` NOT forked | Guidelines with no task produce no useful output in a fork. Inline (or `user-invocable: false` background knowledge) is right. | Over-forking trap |
| CLAUDE.md ≤ 25 lines | The docs target < 200 lines per file, and long files reduce adherence. Keep only what applies broadly and can't be inferred. | "Claude ignores rules in a long CLAUDE.md" → prune, move to rules/skills/hooks |

Mechanism order used by `chooseMechanism`: **access → permissions; must-always → hook; self-contained task → subagent
(or forked skill); procedure or occasional → skill; part of the codebase → path rule; everything else → CLAUDE.md.**
