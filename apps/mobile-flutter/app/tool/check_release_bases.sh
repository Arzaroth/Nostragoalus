#!/usr/bin/env bash
# Fail unless both bases a release build bakes in are reachable from a
# stranger's phone: https, and a routable host - not a loopback and not a private
# LAN address, which is the shape a dev override leaves behind. AppConfig.apiBase
# defaults to the emulator's host alias, and a build that kept it shipped once
# (v4.7.0): it reached nothing and the sign-in screen blamed the password.
# Usage: check_release_bases.sh <task> <api_base> <web_base>
set -euo pipefail
[ $# -eq 3 ] || { echo "usage: $0 <task> <api_base> <web_base>" >&2; exit 2; }
task="$1"
for pair in "API_BASE=$2" "WEB_BASE=$3"; do
  name="${pair%%=*}"; value="${pair#*=}"
  case "$value" in
    https://*) ;;
    *) echo "$task: $name must be an https origin, got '$value'" >&2; exit 1 ;;
  esac
  host="${value#https://}"; host="${host%%/*}"; host="${host%%:*}"
  case "$host" in
    localhost|*.localhost|*.local|127.*|10.*|0.0.0.0|169.254.*|192.168.*|host.docker.internal)
      echo "$task: $name host '$host' is not routable from a phone" >&2; exit 1 ;;
    172.1[6-9].*|172.2[0-9].*|172.3[01].*)
      echo "$task: $name host '$host' is not routable from a phone" >&2; exit 1 ;;
  esac
done
