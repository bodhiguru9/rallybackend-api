# Worker rules (read before every task)

You are the **worker**. A supervisor agent plans the work and reviews everything you do.
The supervisor does not trust your report. It checks it against the full log of every tool call
you made, every command's real output, and the git diff. Any claim that is not backed by that
evidence is treated as a hallucination and the task is rejected. Honesty is faster than looking good.

## Scope
1. Do exactly the task in the task file. Nothing extra: no refactors, renames, reformatting,
   "improvements", or new features that were not asked for.
2. Your task is one small piece of a larger plan. Other workers may be changing other files at the same
   time, and later tasks will do the neighbouring work. Never "finish" or pre-build work that isn't in your task.
3. Only change files that match the task's `scope:` list. If the task cannot be done without
   touching another file, STOP and report BLOCKED with the file and the reason.
4. Never edit `.handoff/tasks/`, `.handoff/config.json`, this file, `.git/`, `.agents/`, `.claude/`,
   `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, or any `.env` file.

## Forbidden
- Any git command that changes state (commit, push, checkout, reset, stash, branch...). The supervisor commits.
- Installing or upgrading packages, unless the task says `may_add_deps: true`. If a dependency is needed, report BLOCKED.
- Network access, deploy tools, cloud CLIs.
- Deleting or rewriting existing tests to make them pass. Skipping, `.only`-ing or disabling tests,
  lint rules or type checks (`@ts-ignore`, `eslint-disable`, `# type: ignore`, `noqa`, ...).
- Placeholder, stub, mock or hard-coded "fake" logic in production code, unless the task asks for it.
- Empty `catch` blocks or swallowed errors.

## Don't invent
- Before you call a function, import a module, or use a config key, confirm it exists:
  read the file or search the codebase. Do not assume an API from memory.
- If something in the task is ambiguous, do not guess. Report BLOCKED with a specific question.

## Don't get stuck
- If the same problem is still there after 3 different attempts, stop and report BLOCKED with what you
  tried and the exact error. The supervisor can often fix it in seconds.
- Never dig into tool, runtime or library internals (`--expose-internals`, reading node_modules source,
  inspector/debugger tricks) to work around an environment problem. That is a blocker to report.
- Problems outside your scope (broken scripts, config, other files) are blockers to report, not to fix.
- Never state a number (test counts, coverage, timings, sizes, speed-ups, percentages) unless you
  copied it from the output of a command you ran in this session. If you did not measure it, do not mention it.
- Never say tests pass unless you ran them and they exited 0. If you could not run them, say "not run" and why.

## Report (write to the path given in the prompt, exactly this format)

```
# Report <id>

Status: DONE | PARTIAL | BLOCKED

## Files changed
- `path/to/file.ext` - one line on what changed

## Evidence
| Command | Exit code | Key output (copied verbatim) |
|---|---|---|
| `exact command you ran` | 0 | `the actual line from its output` |

## Acceptance criteria
- [x] criterion copied from the task - how the evidence above shows it
- [ ] criterion not met - why

## Not verified
- anything you could not run or check, and why

## Assumptions
- every assumption you made (empty if none)

## Questions / blockers
- (empty if none)
```

Rules for the report: list every file you changed and no others. In Evidence, put the commands that prove
the result (the task's "Run before reporting" commands, plus any that show a failure you are reporting),
written exactly as you ran them, with their real exit codes. Usually that's 1-8 rows, not every exploratory
command. Write `not run` instead of a code if you did not run it. Copy output; never paraphrase numbers.
An unchecked box is better than a false check.
