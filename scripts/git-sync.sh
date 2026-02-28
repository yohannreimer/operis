#!/usr/bin/env bash
set -euo pipefail

REMOTE="${GIT_REMOTE:-origin}"
MAIN_BRANCH="${GIT_MAIN_BRANCH:-main}"
FEATURE_BRANCH="${1:-}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Erro: execute este script dentro de um repositório git."
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

CURRENT_BRANCH="$(git branch --show-current)"

if [[ -z "$CURRENT_BRANCH" ]]; then
  echo "Erro: HEAD destacado (detached). Faça checkout em uma branch antes."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Erro: existem alterações locais não commitadas."
  echo "Faça commit/stash antes de sincronizar."
  exit 1
fi

if [[ -z "$FEATURE_BRANCH" && "$CURRENT_BRANCH" != "$MAIN_BRANCH" ]]; then
  FEATURE_BRANCH="$CURRENT_BRANCH"
fi

echo "-> Fetch em $REMOTE"
git fetch "$REMOTE" --prune

echo "-> Atualizando $MAIN_BRANCH"
git switch "$MAIN_BRANCH"
git pull --rebase "$REMOTE" "$MAIN_BRANCH"

if [[ -n "$FEATURE_BRANCH" && "$FEATURE_BRANCH" != "$MAIN_BRANCH" ]]; then
  echo "-> Atualizando $FEATURE_BRANCH"
  git switch "$FEATURE_BRANCH"

  if git ls-remote --exit-code --heads "$REMOTE" "$FEATURE_BRANCH" >/dev/null 2>&1; then
    git pull --rebase "$REMOTE" "$FEATURE_BRANCH"
  else
    echo "Aviso: branch $FEATURE_BRANCH não existe em $REMOTE (pulando pull)."
  fi
fi

echo "-> Sincronização concluída."
