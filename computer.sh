#!/bin/bash
# computer.sh — GUI automation for Mac Mini
# Must be run via gui-run.sh for display access
# Requires: brew install cliclick
#
# Usage:
#   computer.sh click X Y           — left click at coordinates
#   computer.sh doubleclick X Y      — double click at coordinates
#   computer.sh rightclick X Y       — right click at coordinates
#   computer.sh move X Y             — move mouse to coordinates
#   computer.sh type "text"          — type a string of text
#   computer.sh key KEYNAME          — press a key (return, tab, escape, delete, space, arrow-up, arrow-down, arrow-left, arrow-right)
#   computer.sh combo MOD+KEY        — key combo like cmd+a, cmd+t, cmd+shift+t
#   computer.sh scroll up|down [N]   — scroll (default 3 clicks)
#   computer.sh open "url_or_path"   — open URL in browser or file/app
#   computer.sh activate "App Name"  — bring app to front

ACTION="$1"
shift

case "$ACTION" in
  click)
    cliclick "c:${1},${2}"
    echo "Clicked at ${1},${2}"
    ;;
  doubleclick)
    cliclick "dc:${1},${2}"
    echo "Double-clicked at ${1},${2}"
    ;;
  rightclick)
    cliclick "rc:${1},${2}"
    echo "Right-clicked at ${1},${2}"
    ;;
  move)
    cliclick "m:${1},${2}"
    echo "Moved mouse to ${1},${2}"
    ;;
  type)
    cliclick "t:${1}"
    echo "Typed: ${1}"
    ;;
  key)
    cliclick "kp:${1}"
    echo "Pressed key: ${1}"
    ;;
  combo)
    # Parse combo like cmd+a, cmd+shift+t
    IFS='+' read -ra PARTS <<< "$1"
    MODS=""
    KEY="${PARTS[-1]}"
    for ((i=0; i<${#PARTS[@]}-1; i++)); do
      MOD="${PARTS[$i]}"
      cliclick "kd:${MOD}"
      MODS="${MODS}${MOD}+"
    done
    cliclick "kp:${KEY}"
    # Release modifiers in reverse
    for ((i=${#PARTS[@]}-2; i>=0; i--)); do
      cliclick "ku:${PARTS[$i]}"
    done
    echo "Combo: ${MODS}${KEY}"
    ;;
  scroll)
    DIR="$1"
    AMOUNT="${2:-3}"
    if [ "$DIR" = "up" ]; then
      for ((i=0; i<AMOUNT; i++)); do
        cliclick "ku:5"  # scroll up
      done
    else
      for ((i=0; i<AMOUNT; i++)); do
        cliclick "kd:5"  # scroll down
      done
    fi
    echo "Scrolled ${DIR} ${AMOUNT}"
    ;;
  open)
    open "$1"
    echo "Opened: $1"
    ;;
  activate)
    osascript -e "tell application \"$1\" to activate"
    echo "Activated: $1"
    ;;
  *)
    echo "Unknown action: $ACTION"
    echo "Usage: computer.sh click|doubleclick|rightclick|move|type|key|combo|scroll|open|activate [args]"
    exit 1
    ;;
esac
