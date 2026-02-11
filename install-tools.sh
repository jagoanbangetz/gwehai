#!/usr/bin/env bash
# Install pentest CLI tools used by the template (port_scan, dir_brute, verify_sqli, etc.).
# Supports: Debian/Ubuntu (apt), Fedora/RHEL (dnf), macOS (Homebrew).
# Usage: ./install-tools.sh [--skip-pip] [--dry-run]

set -e

SKIP_PIP=false
DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --skip-pip)   SKIP_PIP=true ;;
    --dry-run)   DRY_RUN=true ;;
    -h|--help)
      echo "Usage: $0 [--skip-pip] [--dry-run]"
      echo "  --skip-pip   Skip Python/pip installs (sqlmap, wfuzz, dirsearch, sslyze)."
      echo "  --dry-run    Print commands only, do not run."
      exit 0
      ;;
  esac
done

run() {
  if "$DRY_RUN"; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

need_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo "Required command missing: $1"
    exit 1
  fi
}

# --- Detect OS ---
OS_TYPE=""
PKG_UPDATE=""
PKG_INSTALL=""
if [ -f /etc/os-release ]; then
  # shellcheck source=/dev/null
  . /etc/os-release
  case "$ID" in
    debian|ubuntu|linuxmint)
      OS_TYPE="deb"
      PKG_UPDATE="apt-get update -qq"
      PKG_INSTALL="apt-get install -y -qq"
      ;;
    fedora|rhel|centos|rocky)
      OS_TYPE="rpm"
      PKG_UPDATE="true"
      PKG_INSTALL="dnf install -y -q"
      ;;
    *)
      OS_TYPE="deb"
      PKG_UPDATE="apt-get update -qq"
      PKG_INSTALL="apt-get install -y -qq"
      ;;
  esac
elif [ "$(uname -s)" = "Darwin" ]; then
  OS_TYPE="mac"
  need_cmd brew
  PKG_UPDATE="brew update -q"
  PKG_INSTALL="brew install -q"
else
  echo "Unsupported OS. Use apt, dnf, or Homebrew manually."
  exit 1
fi

echo "Detected OS type: $OS_TYPE"

# --- System packages (port_scan, info gathering, network, recon) ---
install_system() {
  if [ "$OS_TYPE" = "deb" ]; then
    run sudo $PKG_UPDATE
    run sudo $PKG_INSTALL --no-install-recommends \
      nmap \
      masscan \
      dnsutils \
      whois \
      curl \
      netcat-openbsd \
      traceroute \
      ca-certificates
    # Optional: nikto (often in universe/kali)
    run sudo $PKG_INSTALL -y nikto 2>/dev/null || true
  elif [ "$OS_TYPE" = "rpm" ]; then
    run sudo $PKG_INSTALL nmap masscan bind-utils whois curl traceroute
    run sudo $PKG_INSTALL -y nmap-ncat 2>/dev/null || run sudo $PKG_INSTALL -y nc 2>/dev/null || true
    run sudo $PKG_INSTALL -y nikto 2>/dev/null || true
  elif [ "$OS_TYPE" = "mac" ]; then
    run $PKG_UPDATE
    run $PKG_INSTALL nmap masscan bind whois curl netcat traceroute
    run $PKG_INSTALL nikto 2>/dev/null || true
  fi
}

# --- Python tools (pip/pipx): sqlmap, wfuzz, sslyze, dirsearch ---
install_pip_tools() {
  if "$SKIP_PIP"; then
    echo "Skipping pip installs (--skip-pip)."
    return 0
  fi
  need_cmd python3
  PIP_CMD=""
  if command -v pipx &>/dev/null; then
    PIP_CMD="pipx"
  elif command -v pip3 &>/dev/null; then
    PIP_CMD="pip3 install --user"
  else
    echo "Install pip3 or pipx to get sqlmap, wfuzz, dirsearch, sslyze."
    return 1
  fi
  for pkg in sqlmap wfuzz sslyze; do
    if [ "$PIP_CMD" = "pipx" ]; then
      run pipx install "$pkg" 2>/dev/null || run pip3 install --user "$pkg"
    else
      run pip3 install --user "$pkg"
    fi
  done
  # dirsearch: PyPI name may be dirsearch; else install from git
  if ! command -v dirsearch &>/dev/null; then
    run pip3 install --user dirsearch 2>/dev/null || true
  fi
  if ! command -v dirsearch &>/dev/null && command -v git &>/dev/null; then
    D="${XDG_DATA_HOME:-$HOME/.local/share}/dirsearch"
    if [ ! -d "$D" ]; then
      run git clone --depth 1 https://github.com/maurosoria/dirsearch.git "$D" 2>/dev/null || true
      echo "Add to PATH to use dirsearch: export PATH=\"$D:\$PATH\" (run: python3 $D/dirsearch.py -u URL)"
    fi
  fi
}

# --- Go / binary tools: (none required by default) ---
install_extra() {
  :
}

# --- Main ---
install_system
install_pip_tools
install_extra

echo "Done. Verify with: nmap -V; masscan --version; dig -v; sqlmap --version 2>/dev/null; sslyze --version 2>/dev/null"
