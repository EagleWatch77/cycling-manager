#!/usr/bin/env bash
# Verifies the documented rollback of ONLY the S1+O5 training model (docs/S1O5_rollback_postup.md): the 4 prepared files / the patch change exactly 4 files, restore capSlope 1.25 and
# youthRoomFloor 0, keep every other test (Trh, radar, ...) green, match the OLD SQL function after ROLLBACK_S1O5_rozvoj.sql, and the reverse patch restores S1+O5 byte for byte.
# Run from anywhere as the repo owner (root in the sandbox); needs node/npx and a postgres OS user for the SQL part (set PGUSER_OS=postgres) — it leaves the tree unchanged.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$REPO"
MR=supabase/diagnostics/market_launch/manual_rollbacks; PATCH=$MR/S1O5_typescript_navrat.patch; FILES=$MR/S1O5_navrat_subory
PGUSER_OS=${PGUSER_OS:-postgres}
pass=0; fail=0; ok(){ pass=$((pass+1)); echo "  PASS  $1"; }; bad(){ fail=$((fail+1)); echo "  FAIL  $1  ($2)"; }
eq(){ [ "$2" = "$3" ] && ok "$1" || bad "$1" "got '$2', want '$3'"; }
tree_sum() { (cd "$REPO" && find apps packages -type f -not -path '*/node_modules/*' -not -path '*/.next/*' -not -name '*.tsbuildinfo' | sort | xargs sha256sum | sha256sum | cut -c1-16); }
CFG=apps/web/src/lib/training/development/config.ts
BEFORE=$(tree_sum)
eq "start state is S1+O5 (capSlope 1.5, youthRoomFloor 0.30)" "$(grep -c 'capSlope: 1.5\|youthRoomFloor: 0.30' $CFG)" "2"
eq "the patch touches exactly 4 files, all in training/development" "$(grep '^diff' $PATCH | grep -c 'apps/web/src/lib/training/development/')|$(grep -c '^diff' $PATCH)" "4|4"
eq "nothing of Trh / radar / rider / migrations is in the patch or in the prepared files" "$(( $(grep '^diff' $PATCH | grep -ci 'market\|radar\|rider/\|migrations\|supabase') + $(cd $FILES && find . -type f | grep -ci 'market\|radar\|rider/\|migrations\|supabase') ))" "0"
eq "the prepared files are exactly 4" "$(find $FILES -type f | wc -l)" "4"
eq "the patch applies cleanly (dry run)" "$(patch -p1 --dry-run -s < $PATCH >/dev/null 2>&1 && echo yes || echo no)" "yes"

echo "== route A: copy the 4 prepared files (what the owner does)"
cp -r $FILES/apps ./ 
eq "after the copy: capSlope 1.25 and youthRoomFloor 0" "$(grep -c 'capSlope: 1.25\|youthRoomFloor: 0,' $CFG)" "2"
eq "capSlope is no longer 1.5 and the floor is no longer 0.30" "$(grep -c 'capSlope: 1.5\|youthRoomFloor: 0.30' $CFG)" "0"
CHANGED=$(tree_sum)
cd "$REPO" && cp -r /dev/null /dev/null 2>/dev/null
echo "== route B: the patch gives byte-identical results to the copy"
SUM_A=$(cd "$REPO/apps/web/src/lib/training/development" && sha256sum config.ts development.test.ts softcap200.test.ts youthRoom.test.ts | sha256sum | cut -c1-16)
# go back to S1+O5 with the reverse patch of route B applied on a clean S1+O5 tree: first undo route A by restoring from the patch itself
patch -p1 -R -s < $PATCH >/dev/null 2>&1 && ok "reverse patch applies on the reverted tree (route A result == patch result)" || bad "reverse patch on route A tree" "route A and patch differ"
eq "after the reverse patch the whole tree is byte-identical to the start (S1+O5 is back)" "$(tree_sum)" "$BEFORE"
patch -p1 -s < $PATCH >/dev/null 2>&1; eq "route B (patch) gives the same 4 files as route A" "$(cd "$REPO/apps/web/src/lib/training/development" && sha256sum config.ts development.test.ts softcap200.test.ts youthRoom.test.ts | sha256sum | cut -c1-16)" "$SUM_A"

echo "== tests in the reverted state"
cd "$REPO" && npm run typecheck >/tmp/s1o5_tc.out 2>&1; eq "typecheck: 0 errors" "$(grep -c 'error TS' /tmp/s1o5_tc.out)" "0"
cd "$REPO/apps/web" && FAILED=""; N=0
for f in $(find src -name '*.test.ts' -o -name '*.test.tsx' | sort); do N=$((N+1)); npx tsx --tsconfig tsconfig.json $f >/tmp/s1o5_t.out 2>&1 || FAILED="$FAILED $f"; done
eq "all $N web test files pass (incl. Trh security, radar, generator) with S1+O5 OFF" "${FAILED:- none}" " none"
eq "youthRoom test confirms capSlope 1.25 / floor 0 / hard max 200" "$(npx tsx --tsconfig tsconfig.json src/lib/training/development/youthRoom.test.ts 2>&1 | grep -c 'FAIL')" "0"
cd "$REPO"
if id "$PGUSER_OS" >/dev/null 2>&1 && [ "$(id -u)" = 0 ]; then
  chmod -R a+rX "$REPO"
  OUT=$(su "$PGUSER_OS" -s /bin/bash -c "PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin} S1O5=rolledback bash supabase/tests/development_v2.test.sh" 2>&1)
  eq "SQL after ROLLBACK_S1O5_rozvoj.sql == reverted TypeScript (whole weeks + ageing)" "$(echo "$OUT" | grep -E '^ *[0-9]+ passed' | tail -1 | xargs)" "70 passed, 0 failed"
else echo "  (SQL parity skipped: needs root + a postgres OS user)"; fi

echo "== back to S1+O5 with the reverse patch"
patch -p1 -R -s < $PATCH >/dev/null 2>&1
eq "the tree is byte-identical to the start again" "$(tree_sum)" "$BEFORE"
eq "S1+O5 values are back" "$(grep -c 'capSlope: 1.5\|youthRoomFloor: 0.30' $CFG)" "2"
echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
