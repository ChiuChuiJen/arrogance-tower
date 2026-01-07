#!/usr/bin/env python3
"""
Bump app version (patch) and update:
- data/version.js
- VERSION.txt
- README.md (optional line)
Version format: vMAJOR.MINOR.PATCH-test (default) or vMAJOR.MINOR.PATCH
Usage:
  python bump_version.py
  python bump_version.py --release
"""
from __future__ import annotations
from pathlib import Path
import re
import argparse

ROOT = Path(__file__).resolve().parent
VER_TXT = ROOT / "VERSION.txt"
VER_JS = ROOT / "data" / "version.js"
README = ROOT / "README.md"

def parse(v: str):
  v = v.strip()
  m = re.fullmatch(r"v(\d+)\.(\d+)\.(\d+)(-test)?", v)
  if not m:
    raise SystemExit(f"Unrecognized version: {v}")
  return int(m.group(1)), int(m.group(2)), int(m.group(3)), bool(m.group(4))

def format_ver(maj, minor, patch, is_test):
  return f"v{maj}.{minor}.{patch}" + ("-test" if is_test else "")

def main():
  ap = argparse.ArgumentParser()
  ap.add_argument("--release", action="store_true", help="drop -test suffix")
  args = ap.parse_args()

  if VER_TXT.exists():
    cur = VER_TXT.read_text(encoding="utf-8").strip()
  else:
    cur = "v0.0.0-test"

  maj, minor, patch, is_test = parse(cur)
  patch += 1
  if args.release:
    is_test = False
  newv = format_ver(maj, minor, patch, is_test)

  VER_TXT.write_text(newv + "\n", encoding="utf-8")
  VER_JS.write_text(f'export const APP_VERSION = "{newv}";\n', encoding="utf-8")

  if README.exists():
    txt = README.read_text(encoding="utf-8")
    # Keep a simple version line at top if present
    if "版本：" in txt:
      txt = re.sub(r"版本：\s*v[\d\.]+(-test)?", f"版本：{newv}", txt)
    else:
      txt = f"版本：{newv}\n\n" + txt
    README.write_text(txt, encoding="utf-8")

  print(newv)

if __name__ == "__main__":
  main()
