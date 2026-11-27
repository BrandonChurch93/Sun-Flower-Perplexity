#!/bin/sh
# publish.sh OUTDIR : puts the public review page together in OUTDIR, the folder that gets deployed.
#
# The page's source is this folder: index.html, review.css, review.js and assets/. OUTDIR gets those and
# nothing else of this folder, so no note, check or tool goes out with the page.
#
# The two film files are not stored in this folder, because both are made from files the repository
# already holds:
#
#   assets/film/life-of-a-sunflower-1080p.mp4   a copy of portfolio/sunflower-video.mp4
#   assets/film/life-of-a-sunflower-720p.mp4    the picture of web/film/sunflower-720.mp4 with the sound of
#                                               portfolio/sunflower-video.mp4. Neither is encoded again.
#
# The script makes both in OUTDIR and compares them, by SHA-256, with the files the public page plays.
# Needs ffmpeg. Run it from anywhere:  sh review/publish.sh /tmp/sunflower-review-page
set -e

out=$1
[ -n "$out" ] || { echo "usage: sh review/publish.sh OUTDIR" >&2; exit 2; }
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/.." && pwd)
big="$root/portfolio/sunflower-video.mp4"
small="$root/web/film/sunflower-720.mp4"

published_1080=3259d4024c46b2b7c68064463f931e4edc96c45d499e913983cf39eaa3c71c69
published_720=6da9aa28dc13528d477f45e7f01ea148d1573d560d18e13859a0520828acec39
# The packets of the 720p file's picture and of its sound. They stay the same whatever a later ffmpeg writes around them.
published_720_picture=3cfab0358b2f55796e2a15516f697c76
published_720_sound=7d5d8c31ad38e5555442e932e13fb3dc

for f in "$big" "$small"; do
  [ -f "$f" ] || { echo "missing: $f" >&2; exit 1; }
done
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg is not installed" >&2; exit 1; }

made=no
[ -d "$out" ] || { mkdir -p "$out"; made=yes; }
out=$(cd "$out" && pwd)
case "$out/" in
  "$here/checks/out/"*) ;;
  "$root/"*)
    [ "$made" = yes ] && rmdir "$out"
    echo "OUTDIR is inside the repository. Name a folder outside it." >&2
    exit 2 ;;
esac

sum() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}
packets() {
  ffmpeg -v error -i "$1" -map "0:$2:0" -c copy -f md5 - | cut -d= -f2
}

rm -rf "$out/assets" "$out/index.html" "$out/review.css" "$out/review.js"
cp "$here/index.html" "$here/review.css" "$here/review.js" "$out/"
cp -R "$here/assets" "$out/assets"
mkdir -p "$out/assets/film"
cp "$big" "$out/assets/film/life-of-a-sunflower-1080p.mp4"
ffmpeg -v error -y -i "$small" -i "$big" -map 0:v:0 -map 1:a:0 -c copy -movflags +faststart "$out/assets/film/life-of-a-sunflower-720p.mp4"

status=0

got=$(sum "$out/assets/film/life-of-a-sunflower-1080p.mp4")
if [ "$got" = "$published_1080" ]; then
  echo "1080p: the same bytes as the file the public page plays"
else
  echo "1080p: NOT the file the public page plays. portfolio/sunflower-video.mp4 has changed."
  echo "       got $got"
  status=1
fi

got=$(sum "$out/assets/film/life-of-a-sunflower-720p.mp4")
if [ "$got" = "$published_720" ]; then
  echo "720p:  the same bytes as the file the public page plays"
else
  picture=$(packets "$out/assets/film/life-of-a-sunflower-720p.mp4" v)
  sound=$(packets "$out/assets/film/life-of-a-sunflower-720p.mp4" a)
  if [ "$picture" = "$published_720_picture" ] && [ "$sound" = "$published_720_sound" ]; then
    echo "720p:  the same picture and sound as the file the public page plays, in a file this ffmpeg wrote with other bytes around them"
  else
    echo "720p:  NOT the file the public page plays. web/film/sunflower-720.mp4 or portfolio/sunflower-video.mp4 has changed."
    echo "       got $got"
    echo "       picture packets $picture, sound packets $sound"
    status=1
  fi
fi

files=$(find "$out" -type f | wc -l | tr -d ' ')
echo "$files files in $out"
if [ "$status" != 0 ]; then
  echo "If the film was changed on purpose, read \"When the film changes\" in review/README.md before this folder is deployed."
fi
exit $status
