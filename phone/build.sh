#!/bin/sh
set -e
cd "$(dirname "$0")"
cache="$HOME/.cache/early-echo-phone"
mkdir -p "$cache"
if [ $# -eq 0 ]; then set -- assembleDebug; copy=1; fi
./gradlew --project-cache-dir "$cache/gradle" -Pkotlin.project.persistent.dir="$cache/kotlin" "$@"
if [ -n "$copy" ]; then
  mkdir -p dist
  tools=$(ls -d "$(sed -n 's/^sdk.dir=//p' local.properties)"/build-tools/* | tail -1)
  "$tools/zipalign" -f -P 16 4 app/build/outputs/apk/debug/app-debug.apk dist/early-echo.apk
  "$tools/apksigner" sign --ks "$HOME/.android/debug.keystore" --ks-pass pass:android --ks-key-alias androiddebugkey \
    --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --v4-signing-enabled false dist/early-echo.apk 2>&1 | grep -v -i warning || true
  "$tools/apksigner" verify -v dist/early-echo.apk 2>&1 | grep -E '^Verifies|scheme \(|v1 scheme'
  ls -la dist/early-echo.apk
fi
