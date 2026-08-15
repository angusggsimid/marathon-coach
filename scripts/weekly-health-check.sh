#!/bin/zsh
# Marathon 自动化工作流周体检 — 由 launchd 每周日 10:00 触发
# 手动运行：zsh scripts/weekly-health-check.sh

export PATH="/Users/agg/.opencode/bin:/Users/agg/.codex/bin:/Users/agg/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export VERCEL_TELEMETRY_DISABLED=1

cd /Users/agg/Desktop/Marathon || exit 1
mkdir -p logs/health

/Users/agg/.opencode/bin/opencode run \
  --agent health-check \
  --model alibaba-token-plan-cn/qwen3.8-max \
  --title "weekly-health-check" \
  "执行 Marathon 项目每周一次的自动化工作流健康检查。严格按照你的系统提示中的 6 个检查项逐项执行，把报告写入 logs/health/<今天日期>.md，失败时弹系统通知。" \
  >> logs/health/launchd.out.log 2>> logs/health/launchd.err.log
