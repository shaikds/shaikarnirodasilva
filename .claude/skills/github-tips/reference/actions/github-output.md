# GITHUB_OUTPUT (replacing deprecated set-output)

## Rule
ALWAYS use `$GITHUB_OUTPUT` for step outputs. NEVER use `::set-output` (deprecated, security vulnerability).

## Code
```yaml
- id: get-version
  run: echo "version=1.0.0" >> $GITHUB_OUTPUT

- run: echo "Version is ${{ steps.get-version.outputs.version }}"
```

## Multiline Output
```yaml
- id: get-changelog
  run: |
    {
      echo "changelog<<EOF"
      cat CHANGELOG.md
      echo "EOF"
    } >> $GITHUB_OUTPUT
```

## Environment Variables (GITHUB_ENV)
```yaml
- run: echo "MY_VAR=hello" >> $GITHUB_ENV
- run: echo "$MY_VAR"  # Available in subsequent steps
```

## Anti-pattern
```yaml
# BAD - DEPRECATED and has security vulnerabilities:
- run: echo "::set-output name=version::1.0.0"

# BAD - DEPRECATED:
- run: echo "::set-env name=MY_VAR::hello"
```

## Why
`set-output` was deprecated due to log injection vulnerabilities. `$GITHUB_OUTPUT` writes to a temp file instead of stdout, which is secure.
