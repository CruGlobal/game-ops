#!/usr/bin/env bash
# Boot the production image against a scratch database and prove it serves.
#
# Jest builds its own small Express apps, so it never loads server.js: session store,
# passport, helmet, ejs views, Socket.IO and the MCP endpoint only meet each other here.
# CI runs this on every PR so a dependency bump that breaks startup cannot auto-merge.
#
# Usage: DATABASE_URL=postgresql://... scripts/smoke-test.sh <image>
# The container uses host networking and binds port 3000, so DATABASE_URL is resolved
# from the Docker host and nothing else may be listening on 3000.
set -euo pipefail

image="${1:?usage: scripts/smoke-test.sh <image>}"
: "${DATABASE_URL:?DATABASE_URL must point at a scratch database}"

name=game-ops-smoke
base=http://localhost:3000
body=$(mktemp)
failures=0
curl_opts=(--silent --max-time 10)

cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }

on_exit() {
    local rc=$?
    if [ "$rc" -ne 0 ] && docker container inspect "$name" >/dev/null 2>&1; then
        echo "--- last 50 lines of app logs"
        docker logs "$name" 2>&1 | tail -50
    fi
    cleanup
    rm -f "$body"
    exit "$rc"
}
trap on_exit EXIT

fail() {
    echo "FAIL: $*"
    failures=$((failures + 1))
}

# in_image <command...>: run a one-off command in the image against the database.
in_image() {
    docker run --rm --network host -e DATABASE_URL "$image" "$@"
}

# start <extra docker run args...>: run the app and wait for /api/health to answer 200.
start() {
    cleanup
    docker run -d --name "$name" --network host \
        -e DATABASE_URL \
        -e SESSION_SECRET=smoke \
        -e GITHUB_CLIENT_ID=smoke \
        -e GITHUB_CLIENT_SECRET=smoke \
        "$@" "$image" >/dev/null

    for _ in $(seq 1 60); do
        if [ "$(curl "${curl_opts[@]}" -o "$body" -w '%{http_code}' "$base/api/health" || true)" = 200 ]; then
            echo "ok   GET /api/health -> 200"
            return 0
        fi
        if [ "$(docker inspect -f '{{.State.Running}}' "$name")" != true ]; then
            break
        fi
        sleep 1
    done

    echo "FAIL: app never reported healthy. Last /api/health response:"
    cat "$body" 2>/dev/null || true
    echo
    exit 1
}

# expect_status <path> <code> [location-prefix]
expect_status() {
    local path=$1 want=$2 location=${3:-}
    local got
    got=$(curl "${curl_opts[@]}" -o "$body" -w '%{http_code} %{redirect_url}' "$base$path" || true)
    if [ "${got%% *}" != "$want" ]; then
        fail "GET $path returned ${got%% *}, expected $want"
    elif [ -n "$location" ] && [[ "${got#* }" != "$location"* ]]; then
        fail "GET $path redirected to '${got#* }', expected $location..."
    else
        echo "ok   GET $path -> $got"
    fi
}

# expect_page <path> <code> <title>: the full template rendered, not a partial page.
expect_page() {
    local path=$1 want=$2 title=$3
    local got
    got=$(curl "${curl_opts[@]}" -o "$body" -w '%{http_code}' "$base$path" || true)
    if [ "$got" != "$want" ]; then
        fail "GET $path returned $got, expected $want"
    elif ! grep -q "<title>$title</title>" "$body" || ! grep -q '</html>' "$body"; then
        fail "GET $path did not render a complete '$title' page"
    else
        echo "ok   GET $path -> $got '$title'"
    fi
}

# expect_json <path>: a 200 whose body is a JSON object or array.
expect_json() {
    local path=$1
    local got
    got=$(curl "${curl_opts[@]}" -o "$body" -w '%{http_code}' "$base$path" || true)
    if [ "$got" != 200 ]; then
        fail "GET $path returned $got, expected 200"
    elif ! head -c 1 "$body" | grep -q '[{[]'; then
        fail "GET $path did not return JSON: $(head -c 200 "$body")"
    else
        echo "ok   GET $path -> 200 JSON"
    fi
}

# expect_mcp <method> <params-json> <text-in-result>
expect_mcp() {
    local method=$1 params=$2 want=$3
    local got
    got=$(curl "${curl_opts[@]}" -X POST "$base/mcp" \
        -H 'Content-Type: application/json' \
        -H 'Accept: application/json, text/event-stream' \
        -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":$params}" || true)
    if grep -q "$want" <<<"$got" && ! grep -q '"isError":true' <<<"$got"; then
        echo "ok   POST /mcp $method"
    else
        fail "POST /mcp $method returned: ${got:0:300}"
    fi
}

echo "== Schema push (the exact command the ECS db-migrate container runs)"
in_image npx prisma db push --accept-data-loss

echo "== Seed one contributor so profile and leaderboards have a row to render"
in_image node --input-type=module -e "
import { prisma } from './lib/prisma.js';
await prisma.contributor.upsert({
    where: { username: 'smoke-test-user' },
    update: {},
    create: { username: 'smoke-test-user' }
});
await prisma.\$disconnect();
"

echo "== Production mode"
start
expect_status /leaderboard 302 "$base/auth/github"
expect_status /auth/github 302 https://github.com/login/oauth/authorize
expect_status '/socket.io/?EIO=4&transport=polling' 200
grep -q '"sid"' "$body" || fail "Socket.IO handshake returned no session id"
expect_status /modern-design-system.css 200

echo "== Pages, API and MCP (development mode, auth bypassed)"
start -e NODE_ENV=development -e DISABLE_AUTH=true
expect_page /leaderboard 200 'Leaderboard - Game Ops'
expect_page /challenges 200 'Challenges - Game Ops'
expect_page /activity 200 'Activity - Game Ops'
expect_page /charts 200 'Charts - Game Ops'
expect_page /analytics 200 'Analytics Dashboard - Game Ops'
expect_page /admin 200 'Settings - Game Ops'
expect_page /admin/challenges 200 'Challenge Management - Admin'
expect_page /profile/smoke-test-user 200 'Profile - Game Ops'
expect_page /profile/smoke-test-nobody 404 '404 - Game Ops'
expect_json /api/leaderboard/all-time
expect_json /api/leaderboard/quarterly
expect_json /api/quarter-info
expect_json /api/challenges/active
expect_json /api/analytics/overview
expect_mcp tools/list '{}' '"tools"'
expect_mcp tools/call '{"name":"get_leaderboard","arguments":{"view":"all_time"}}' 'smoke-test-user'

if [ "$failures" -gt 0 ]; then
    echo "$failures smoke check(s) failed"
    exit 1
fi
echo "All smoke checks passed"
