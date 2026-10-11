# Demo directory guidelines

This directory holds small, self-contained demonstrations used to show how Claude Code behaves in a repository. Everything here is meant to be read, run, and discarded without side effects on the rest of the project. These instructions apply to every file under `demo/` and are loaded whenever Claude works with files in this folder.

## Purpose

The demo folder exists to illustrate features: memory files, rules, skills, hooks, and plugin layout. A good demo is short, obvious, and honest. A reader should understand what it shows within a minute, and should be able to reproduce it without any hidden setup.

When adding or editing demo content, keep these goals in mind:

- Show one idea per demo. If a demo needs a long explanation, split it into two.
- Prefer plain files and standard tools over custom scaffolding.
- Make the expected outcome explicit so that a reader can tell whether the demo worked.
- Leave no residue. A demo must not modify files outside `demo/` unless it says so clearly at the top.

## Language and tone

Always write in English. Use plain, direct sentences. Avoid marketing language, filler, and hedging. Explain what something does, then stop. Prefer the active voice and present tense.

Headings use sentence case. Lists are used for parallel items only; if the items are not parallel, write a short paragraph instead. Do not use emoji in documentation or code comments.

## Directory layout

Each demo lives in its own subfolder. The expected structure is:

```
demo/
  CLAUDE.md          this file
  <demo-name>/
    README.md        what the demo shows and how to run it
    ...              the files that make up the demo
```

Folder names are lowercase and use hyphens between words, for example `hello-world` or `memory-lookup`. Do not use spaces, underscores, or uppercase letters. Keep nesting shallow: no more than two levels below `demo/`.

Every demo folder must contain a `README.md` with these sections, in this order:

1. What it shows
2. How to run it
3. Expected result
4. Cleanup, if any state is created

If a demo needs no cleanup, omit the last section rather than writing "none".

## Code style

Use two spaces for indentation in every code example and every code file in this directory, regardless of language. Never use tabs. This matches the repository style rule and keeps examples consistent when they are copied between files.

Example in JSON:

```json
{
  "name": "example",
  "version": "1.0.0",
  "scripts": {
    "start": "node index.js"
  }
}
```

Example in shell:

```bash
if [ -f "input.txt" ]; then
  echo "found input"
else
  echo "missing input"
fi
```

Example in TypeScript:

```ts
function greet(name: string): string {
  if (!name) {
    return "Hello, stranger";
  }
  return `Hello, ${name}`;
}
```

Additional conventions:

- Keep lines under 100 characters where practical.
- Use descriptive names. Single-letter names are fine only for short loop indices.
- Comments explain why, not what. If the code is clear, do not add a comment.
- Do not leave commented-out code, debugging statements, or TODO markers in a finished demo.
- End every file with a single trailing newline.

## Reading files in this repository

When you need to inspect a file or a folder, use the Read tool on each file individually. Do not use `cat`, `head`, `tail`, or `ls` to look at file contents. To discover which files exist in a folder, use Glob with a pattern such as `demo/**/*`, then Read the files it returns. This keeps file access visible and consistent with the project-wide rule in the root `CLAUDE.md`.

When searching for text, use Grep rather than piping shell commands together. When editing, use Edit for small changes and Write only for new files or full rewrites.

## Making changes

Before changing an existing demo, read its `README.md` and every file it lists. Make the smallest change that satisfies the request. If a change alters the expected result, update the README in the same commit so the two never disagree.

When creating a new demo:

1. Pick a short, descriptive folder name.
2. Write the README first, so the intent is fixed before the code exists.
3. Add only the files the demo needs.
4. Run the demo once from a clean checkout and confirm the expected result.
5. Remove temporary files created while testing.

Do not rename or delete a demo that other documents link to without updating those links. Search the repository for the old name first.

## Commits

Write commit messages in the imperative mood with a short subject line of at most 72 characters. Describe the change, not the process. A body is optional; add one only when the reason for the change is not obvious from the diff.

Good subjects:

- Add memory lookup demo
- Fix expected output in hello-world README
- Remove unused fixture from hook demo

Poor subjects:

- Updates
- Fixed stuff
- WIP

Commit only when asked. Never push to a branch other than the one assigned to the current task, and never create a pull request unless it has been requested explicitly.

## Testing demos

Where a demo includes a script or a program, include a way to check it. The simplest form is a short command in the README whose output can be compared with the expected result. If a demo needs dependencies, list the exact versions and the install command.

A demo is considered broken if any of the following is true:

- The README instructions fail on a clean checkout.
- The output differs from the documented expected result.
- Running it changes files outside the demo folder without saying so.
- It depends on a network resource that may disappear.

Fix broken demos promptly or remove them. A stale demo is worse than no demo, because it teaches the wrong thing.

## Security and safety

Never place secrets, tokens, passwords, or personal data in a demo. Use obvious placeholders such as `YOUR_API_KEY_HERE`. Do not include real email addresses, phone numbers, or account identifiers; use reserved example domains such as `example.com`.

Demos must not run destructive commands such as recursive deletes, force pushes, or disk operations. If a demo needs to illustrate a dangerous operation, describe it in prose and show it against a throwaway directory created for that purpose inside the demo folder.

Avoid downloading and executing remote scripts. If an external resource is essential, pin it to a specific version and explain why it is needed.

## Documentation checklist

Before finishing any change in this directory, confirm each of the following:

- The folder name follows the naming rule.
- The README has the required sections in the right order.
- Every code block uses two-space indentation.
- No secrets or personal data are present.
- The expected result in the README matches reality.
- No stray temporary files remain.
- The text is in English and free of filler.

## When in doubt

Choose the simpler option. If a request is ambiguous, state the assumption you are making and proceed with the most conservative interpretation. If a request would require breaking one of the rules above, say so and ask before continuing. Keep demos small, honest, and easy to delete.
