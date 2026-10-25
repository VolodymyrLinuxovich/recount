#!/bin/sh
# Every commit on main, newest first, grouped by day, with time and hash. Merge commits are left out.
#   sh scripts/changelog.sh > docs/CHANGELOG.md
set -e
echo "# Change log"
echo
echo "Every change to Recount, newest first. Made from git history by \`scripts/changelog.sh\`; the reasons behind the big ones are in [LOGBOOK.md](LOGBOOK.md)."
day=""
git log --no-merges --date=format:'%a %b %d|%H:%M' --format='%ad|%h|%s' | while IFS='|' read -r d t h s; do
  if [ "$d" != "$day" ]; then
    day="$d"
    printf '\n## %s\n\n' "$d"
  fi
  printf -- '- %s `%s` %s\n' "$t" "$h" "$s"
done
