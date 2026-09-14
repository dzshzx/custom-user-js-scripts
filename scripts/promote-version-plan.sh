#!/usr/bin/env bash
# Trusted final version-plan gate for promote.yml. The workflow checks this
# script out from master; the candidate commit is read only as Git object data.
set -euo pipefail

[ "$#" -eq 1 ] || { echo "usage: scripts/promote-version-plan.sh CANDIDATE_SHA" >&2; exit 2; }
candidate="$1"
[[ "$candidate" =~ ^[0-9a-f]{40}$ ]] || { echo "promote-version-plan: invalid candidate sha" >&2; exit 1; }

git fetch -q origin master
master_head="$(git rev-parse origin/master)"
[ "$candidate" != "$master_head" ] || { echo "promote-version-plan: candidate is already master" >&2; exit 1; }
git merge-base --is-ancestor "$master_head" "$candidate" || {
  echo "promote-version-plan: candidate does not descend from current master" >&2
  exit 1
}

node scripts/version-plan.mjs check \
  --base-ref origin/master \
  --target-ref "$candidate" \
  --approval-ref "$candidate"

# The lease closes the gap between the fresh baseline check and the write. It
# rejects even a still-fast-forwardable master advance, which needs a new plan.
git push --force-with-lease="refs/heads/master:$master_head" \
  origin "$candidate:refs/heads/master"
