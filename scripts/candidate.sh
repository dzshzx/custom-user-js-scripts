#!/usr/bin/env bash
# Push the current clean commit as a candidate branch and wait for its promotion.
# The remote runs CI on the candidate; promote.yml fast-forwards master to the
# exact sha when every CI run for it is green, then deletes the candidate branch.
# Usage: scripts/candidate.sh [--no-wait] [--timeout SECONDS]
#        [--confirmed-version-plan sha256:...]
set -euo pipefail

timeout=900
wait=1
confirmed_version_plan=""
while [ $# -gt 0 ]; do
  case "$1" in
    --no-wait) wait=0 ;;
    --timeout) timeout="$2"; shift ;;
    --confirmed-version-plan) confirmed_version_plan="$2"; shift ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

die() { echo "candidate: $*" >&2; exit 1; }

[ -z "$(git status --porcelain --untracked-files=all)" ] || die "a candidate requires a clean committed checkout"
branch="$(git symbolic-ref --quiet --short HEAD || true)"
case "$branch" in
  master|candidate/*|"") die "run from a development branch, not '${branch:-detached HEAD}'" ;;
esac
git fetch -q origin master
sha="$(git rev-parse HEAD)"
git merge-base --is-ancestor origin/master "$sha" || die "rebase onto origin/master first"
[ "$sha" != "$(git rev-parse origin/master)" ] || die "HEAD is already master; nothing to promote"

version_plan_args=(
  check
  --base-ref origin/master
  --target-ref "$sha"
  --approval-ref "$sha"
  --require-confirmed-argument
)
if [ -n "$confirmed_version_plan" ]; then
  version_plan_args+=(--confirmed-version-plan "$confirmed_version_plan")
fi
node scripts/version-plan.mjs "${version_plan_args[@]}" || die "version plan was not authorized"

suffix="$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
candidate="candidate/${sha:0:12}-${suffix}"
git push -q origin "${sha}:refs/heads/${candidate}"
echo "pushed ${candidate} (${sha})"
if [ "$wait" -eq 0 ]; then
  echo "not waiting; master fast-forwards to ${sha} once CI is green"
  exit 0
fi

deadline=$((SECONDS + timeout))
while :; do
  git fetch -q origin master
  if git merge-base --is-ancestor "$sha" origin/master; then
    echo "promoted: origin/master now contains ${sha}"
    exit 0
  fi
  if command -v gh >/dev/null 2>&1; then
    failed="$(gh api "repos/{owner}/{repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100" \
      --jq '.workflow_runs[] | select(.status == "completed" and .conclusion != "success") | .html_url' 2>/dev/null || true)"
    [ -z "$failed" ] || die "CI did not succeed for ${sha}: ${failed} (candidate branch retained)"
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    die "not promoted after ${timeout}s; candidate branch ${candidate} retained"
  fi
  sleep 15
done
