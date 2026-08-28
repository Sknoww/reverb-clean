#!/usr/bin/env bash
set -euo pipefail

shopt -s nullglob
apps=(release/mac*/Reverb.app)

if (( ${#apps[@]} == 0 )); then
  echo "No packaged Reverb.app was produced." >&2
  exit 1
fi

for app_path in "${apps[@]}"; do
  codesign --verify --deep --strict --verbose=2 "$app_path"
  identifier=$(codesign -dv --verbose=4 "$app_path" 2>&1 | sed -n 's/^Identifier=//p')
  if [[ "$identifier" != "com.sknow.reverb" ]]; then
    echo "Unexpected signing identifier for $app_path: $identifier" >&2
    exit 1
  fi
  echo "Verified ad-hoc signature for $app_path ($identifier)"
done
