import re
from pathlib import Path

vfile = Path(__file__).parent / "data" / "version.js"
text = vfile.read_text(encoding="utf-8")

m = re.search(r'APP_VERSION\s*=\s*"v(\d+)\.(\d+)\.(\d+)(-[^"]*)?"', text)
if not m:
    raise SystemExit("Cannot find APP_VERSION")

maj = int(m.group(1)); minor = int(m.group(2)); patch = int(m.group(3))
suffix = m.group(4) or ""

# rule: .9 carries to next digit (semantic-ish carry)
patch += 1
if patch >= 10:
    patch = 0
    minor += 1
if minor >= 10:
    minor = 0
    maj += 1

new_ver = f'v{maj}.{minor}.{patch}{suffix}'
vfile.write_text(f'export const APP_VERSION = "{new_ver}";\n', encoding="utf-8")
print(new_ver)
