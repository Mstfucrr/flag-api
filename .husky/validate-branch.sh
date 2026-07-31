#!/usr/bin/env sh

BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)

if [ -z "$BRANCH_NAME" ] || [ "$BRANCH_NAME" = "HEAD" ]; then
  exit 0
fi

case "$BRANCH_NAME" in
  main|master|develop)
    exit 0
    ;;
esac

BRANCH_PATTERN='^(feature|bugfix|hotfix|refactor|chore|docs)/[A-Z]+-[0-9]+$|^release/v[0-9]+\.[0-9]+\.[0-9]+$'

if ! printf '%s\n' "$BRANCH_NAME" | grep -Eq "$BRANCH_PATTERN"; then
  echo ""
  echo "────────────────────────────────────────────────────────"
  echo " Branch name rejected: ${BRANCH_NAME}"
  echo "────────────────────────────────────────────────────────"
  echo ""
  echo " Format: <type>/<TICKET-ID>  or  release/vX.Y.Z"
  echo ""
  echo " Allowed patterns:"
  echo ""
  echo "   feature/<TICKET-ID>     →  feature/FRAP-142"
  echo "   bugfix/<TICKET-ID>     →  bugfix/FRAP-142"
  echo "   hotfix/<TICKET-ID>      →  hotfix/FRAP-142"
  echo "   refactor/<TICKET-ID>    →  refactor/FRAP-142"
  echo "   chore/<TICKET-ID>       →  chore/FRAP-142"
  echo "   docs/<TICKET-ID>        →  docs/FRAP-142"
  echo "   release/vX.Y.Z          →  release/v1.2.3"
  echo ""
  echo " Rules:"
  echo "   • Lowercase type prefix only (kebab-case)"
  echo "   • Ticket ID required: uppercase board code + number (e.g. FRAP-142)"
  echo "   • No spaces, underscores, or Turkish characters"
  echo ""
  echo " Protected branches (no ticket required):"
  echo "   main | master | develop"
  echo ""
  echo " Rename example:"
  echo "   git branch -m feature/FRAP-142"
  echo ""
  echo "────────────────────────────────────────────────────────"
  exit 1
fi
