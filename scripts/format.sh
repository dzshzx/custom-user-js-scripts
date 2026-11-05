#!/usr/bin/env bash
# 统一格式化入口：JS/TS 与 Markdown/YAML/JSON 用 prettier（本仓没有 Python，Shell 只有本脚本）。
# 用法：scripts/format.sh [--check]
#   无参数：就地格式化本仓跟踪的文件与未被忽略的新文件；--check：只检查，不一致时列出文件并非零退出（CI 用）。
# prettier 固定在 package.json devDependencies（npm ci 安装）；配置：.prettierrc.json/.prettierignore、.editorconfig。
set -euo pipefail

# 字节必须保持不变的文件（git pathspec）；与 .prettierignore 保持一致。
EXCLUDE=(':(exclude)package-lock.json' ':(exclude)**/node_modules/**' ':(exclude)dist/**')

CHECK=0
case "${1:-}" in
  "") ;;
  --check) CHECK=1 ;;
  -h | --help)
    sed -n '2,5p' "$0"
    exit 0
    ;;
  *)
    echo "未知参数：$1" >&2
    exit 2
    ;;
esac
[ $# -le 1 ] || {
  echo "参数过多" >&2
  exit 2
}

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

files() {
  local f
  git ls-files -z --cached --others --exclude-standard -- "$@" "${EXCLUDE[@]}" | while IFS= read -r -d '' f; do
    [ -f "$f" ] || continue
    printf '%s\0' "$f"
  done
}

prettier() {
  [ -x node_modules/.bin/prettier ] || npm_config_loglevel=warn npm ci >&2
  node_modules/.bin/prettier "$@"
}

# 进程替换的退出码不会自动传出：< <(...) 之后 wait "$!" 取回，git ls-files 失败时随 set -e 退出。
mapfile -d '' PRETTIER < <(files '*.js' '*.mjs' '*.cjs' '*.jsx' '*.ts' '*.mts' '*.cts' '*.tsx' \
  '*.md' '*.yml' '*.yaml' '*.json')
wait "$!"

FAIL=0
if [ ${#PRETTIER[@]} -gt 0 ]; then
  if [ "$CHECK" -eq 1 ]; then
    prettier --check -- "${PRETTIER[@]}" || FAIL=1
  else
    prettier --write --log-level warn -- "${PRETTIER[@]}"
  fi
fi
if [ "$CHECK" -eq 1 ]; then
  if [ "$FAIL" -eq 0 ]; then
    echo "format: ok"
  else
    echo "format: 格式不一致，运行 scripts/format.sh 修复" >&2
  fi
fi
exit "$FAIL"
