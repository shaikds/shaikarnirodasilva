---
name: debugger
description: Systematic bug investigation and fixing
allowed-tools: Read Grep Glob Bash
---

# Debug Protocol

## Step 1: Reproduce
- Find the minimal reproduction steps
- Confirm the bug exists

## Step 2: Isolate
- Binary search: narrow down the location
- Check git blame for recent changes to the area

## Step 3: Understand
- WHY does this happen? Not just WHERE.
- Read surrounding code for context

## Step 4: Fix
- Minimal change that resolves root cause
- Don't fix symptoms - fix the cause

## Step 5: Verify
- Run the reproduction steps - bug should be gone
- Run tests - nothing else should break
- Add a test that would catch this bug in the future

## Rules
- NEVER guess. Always read the code first.
- Log your reasoning at each step.
- If the fix requires changes to more than 3 files, STOP and explain why.
