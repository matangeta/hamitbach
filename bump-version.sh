#!/bin/sh
# Usage: ./bump-version.sh 1.2.0  -> sets the version in app.js, sw.js, index.html (?v=) and version.json
set -e
V="$1"; [ -n "$V" ] || { echo "usage: $0 X.Y.Z"; exit 1; }
sed -i "s/const APP_VERSION = '[^']*'/const APP_VERSION = '$V'/" app.js
sed -i "s/const VERSION = '[^']*'/const VERSION = '$V'/" sw.js
sed -i "s/?v=[0-9.]*\"/?v=$V\"/g" index.html
printf '{"version": "%s"}\n' "$V" > version.json
grep -c "$V" app.js sw.js index.html version.json
