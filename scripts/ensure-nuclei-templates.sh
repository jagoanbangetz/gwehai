#!/bin/bash
# Ensure nuclei-templates exist on host for Docker volume mount
set -e

TEMPLATES_DIR="/opt/nuclei-templates"

if [ -d "$TEMPLATES_DIR" ] && [ "$(ls -A "$TEMPLATES_DIR"/*.yaml 2>/dev/null | head -1)" ]; then
    echo "  ⏭ nuclei-templates already exist ($(find "$TEMPLATES_DIR" -name '*.yaml' | wc -l) templates)"
    exit 0
fi

echo "Cloning nuclei-templates..."
rm -rf "$TEMPLATES_DIR"
git clone --depth 1 https://github.com/projectdiscovery/nuclei-templates.git "$TEMPLATES_DIR"
echo "  ✓ nuclei-templates ready ($(find "$TEMPLATES_DIR" -name '*.yaml' | wc -l) templates)"
