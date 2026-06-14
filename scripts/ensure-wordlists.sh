#!/bin/bash
# Ensure pentest wordlists exist on host for Docker volume mount
set -e

WORDLISTS_DIR="/opt/wordlists"
mkdir -p "$WORDLISTS_DIR"

download() {
    local url="$1"
    local dest="$2"
    if [ ! -f "$dest" ] || [ ! -s "$dest" ]; then
        echo "Downloading $(basename "$dest")..."
        curl -sSL "$url" -o "$dest"
        echo "  ✓ $(basename "$dest") ($(wc -l < "$dest") lines)"
    else
        echo "  ⏭ $(basename "$dest") already exists ($(wc -l < "$dest") lines)"
    fi
}

# SecLists common wordlists
download "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/Web-Content/common.txt"     "$WORDLISTS_DIR/common.txt"

download "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/Web-Content/raft-small-directories.txt"     "$WORDLISTS_DIR/raft-small-directories.txt"

download "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/Web-Content/raft-small-files.txt"     "$WORDLISTS_DIR/raft-small-files.txt"

echo ""
echo "All wordlists ready at $WORDLISTS_DIR:"
ls -lh "$WORDLISTS_DIR/"
