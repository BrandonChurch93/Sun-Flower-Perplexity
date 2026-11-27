#!/bin/sh
# Runs every check of the review page:  sh review/checks/run.sh [folder]
#
# Without a folder it first puts the page and the film together in review/checks/out/page with publish.sh, the
# way the page is deployed, and checks that. With a folder it checks the page in that folder.
#
# Needs node, python3, ffmpeg, the repository's dev dependencies (npm ci) and a Chromium for them
# (npx playwright-core install chromium).
#
# It starts two local servers and stops them at the end. One answers like the public host, which hands out
# no part of a file, so a film cannot jump until the whole file is in. The other hands out parts, like most hosts.
here=$(cd "$(dirname "$0")" && pwd)
src=$(cd "$here/.." && pwd)
a=${PORT_A:-8621}
b=${PORT_B:-8622}
failed=""

run() {
  name=$1
  shift
  echo
  echo "== $name"
  "$@" || failed="$failed
  $name"
}

if [ -n "$1" ]; then
  page=$(cd "$1" && pwd) || exit 2
else
  page="$here/out/page"
  run "publish" sh "$src/publish.sh" "$page"
fi

NORANGE=1 KBPS=160000 node "$here/serve.cjs" "$page" "$a" >/dev/null 2>&1 &
s1=$!
node "$here/serve.cjs" "$page" "$b" >/dev/null 2>&1 &
s2=$!
trap 'kill $s1 $s2 2>/dev/null' EXIT INT TERM
sleep 1

host="http://127.0.0.1:$a/"
ranges="http://127.0.0.1:$b/"

run "files"          python3 "$here/files.py" "$page"
run "links"          python3 "$here/links.py" "$page"
run "copy"           python3 "$here/copy.py" "$page"
run "film: stream"   node "$here/film.cjs" "$host" stream
run "film: phone"    node "$here/film.cjs" "$host" phone
run "film: refused"  node "$here/film.cjs" "$host" refused
run "film: reduce"   node "$here/film.cjs" "$host" reduce
run "film: ranges"   node "$here/film.cjs" "$ranges" ranges
run "text size"      node "$here/text-size.cjs" "$host"
run "ruler"          node "$here/ruler.cjs" "$host"
run "page"           node "$here/page.cjs" "$host"
run "hit area"       node "$here/hit-area.cjs" "$host"

echo
if [ -z "$failed" ]; then
  echo "EVERY CHECK PASSED"
else
  echo "FAILED:$failed"
  exit 1
fi
