#!/usr/bin/env bash
# scripts/purge-secrets.sh
# Helper script to purge sensitive files from git history using git-filter-repo.
# WARNING: This rewrites git history and requires a forced push to update remotes.

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "git-filter-repo not found. Install with: pip install git-filter-repo"
  exit 1
fi

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <path1> [path2 ...]"
  echo "Example: $0 .env config/PK-GPT-API.json"
  exit 1
fi

for path in "$@"; do
  echo "Purging $path from git history..."
  git filter-repo --path "$path" --invert-paths
done

echo "Purge complete. Review history, then force-push: git push --force --all && git push --force --tags"
