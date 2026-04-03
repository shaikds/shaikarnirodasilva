# Caching Dependencies

## Rule
ALWAYS cache dependencies to avoid re-downloading on every run.

## Code (npm)
```yaml
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-
```

## Code (Maven)
```yaml
- uses: actions/cache@v4
  with:
    path: ~/.m2/repository
    key: ${{ runner.os }}-maven-${{ hashFiles('**/pom.xml') }}
```

## Code (Gradle)
```yaml
- uses: actions/cache@v4
  with:
    path: |
      ~/.gradle/caches
      ~/.gradle/wrapper
    key: ${{ runner.os }}-gradle-${{ hashFiles('**/*.gradle*', '**/gradle-wrapper.properties') }}
```

## Code (pip)
```yaml
- uses: actions/cache@v4
  with:
    path: ~/.cache/pip
    key: ${{ runner.os }}-pip-${{ hashFiles('**/requirements.txt') }}
```

## Why
Can reduce build time from 5 minutes to 30 seconds. The `hashFiles` key ensures cache invalidates when dependencies change.

## Anti-pattern
```yaml
# BAD: No caching - downloads all dependencies every run
steps:
  - run: npm install  # 2-5 min wasted every time
```
