#!/bin/bash
# Quick setup script for new client projects
# Usage: ./setup-new-project.sh "Project Name" "Client Name" "2025-06-01"

set -e

PROJECT_NAME="${1:?Usage: ./setup-new-project.sh \"Project Name\" \"Client Name\" \"Deadline\"}"
CLIENT_NAME="${2:?Please provide client name}"
DEADLINE="${3:?Please provide deadline (YYYY-MM-DD)}"

# Convert project name to directory-friendly format
DIR_NAME=$(echo "$PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
TODAY=$(date +%Y-%m-%d)

echo "Creating project: $PROJECT_NAME"
echo "Client: $CLIENT_NAME"
echo "Deadline: $DEADLINE"
echo "Directory: ../$DIR_NAME"
echo ""

# Copy template
cp -r "$(dirname "$0")" "../$DIR_NAME"
cd "../$DIR_NAME"

# Remove this setup script from the new project
rm -f setup-new-project.sh

# Replace placeholders in all files
find . -type f -name "*.md" -o -name "*.json" | while read -r file; do
    sed -i "s/\[PROJECT_NAME\]/$PROJECT_NAME/g" "$file"
    sed -i "s/\[CLIENT_NAME\]/$CLIENT_NAME/g" "$file"
    sed -i "s/\[DEADLINE\]/$DEADLINE/g" "$file"
    sed -i "s/\[DATE\]/$TODAY/g" "$file"
done

# Make hooks executable
chmod +x .claude/hooks/*.sh

# Init git
git init
git add .
git commit -m "Initial project setup: $PROJECT_NAME"

echo ""
echo "Done! Project created at: ../$DIR_NAME"
echo ""
echo "Next steps:"
echo "  1. cd ../$DIR_NAME"
echo "  2. npm init -y"
echo "  3. Edit docs/client-brief.md with project details"
echo "  4. Edit docs/architecture.md with tech decisions"
echo "  5. Update CLAUDE.md Compact Instructions with current focus"
echo "  6. Start coding with Claude Code!"
