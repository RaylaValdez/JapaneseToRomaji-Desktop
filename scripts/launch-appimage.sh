#!/bin/bash
DIR="$(dirname "$(readlink -f "$0")")"
APPIMAGE=$(ls "$DIR"/JapaneseToRomaji-*.AppImage 2>/dev/null | head -1)
if [ -z "$APPIMAGE" ]; then
    echo "JapaneseToRomaji AppImage not found in $DIR"
    exit 1
fi
exec "$APPIMAGE" --no-sandbox "$@"
