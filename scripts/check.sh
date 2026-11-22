#!/usr/bin/env bash
# 本仓门禁：npm run verify（构建产物与 dist 一致、metadata 检查、类型检查、ESLint、Biome 认知复杂度、格式、全部测试），
# 再按 origin/master 基线核对版本计划（每个可安装脚本的版本变化是否合规）。
# wt land 在推送 master 前对要推的那个提交跑它，CI 的定时运行与手动运行也跑它。用法：bash scripts/check.sh，失败非零退出。
set -euo pipefail
cd "$(dirname "$0")/.."

# verify 在依赖没装或落后于锁文件时自己 npm ci；版本计划脚本要用 node_modules 里的包，所以排在它后面。
npm run verify
node scripts/version-plan.mjs check --base-ref origin/master --target-ref HEAD
