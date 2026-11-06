"""Print a pinned requirements.txt from the packages installed in the current environment.

Pins every installed package reachable from requirements.in's direct dependencies, at its
installed version; torch (and its CUDA wheels) are left out because the Dockerfile installs
the pinned CPU build of torch separately. Run inside a working ml image:

  docker run --rm -v "$PWD/apps/ml":/app -w /app --entrypoint python demo-predict-ml \
    scripts/pin_requirements.py requirements.in
"""
import re, sys
from importlib import metadata
from packaging.requirements import Requirement

def norm(n): return re.sub(r"[-_.]+", "-", n).lower()
installed = {norm(d.metadata["Name"]): d for d in metadata.distributions()}
roots = []
for line in open(sys.argv[1]):
    line = line.split("#")[0].strip()
    if line: roots.append(Requirement(line))
seen, stack = set(), [(norm(r.name), set(r.extras)) for r in roots]
while stack:
    name, extras = stack.pop()
    key = (name, frozenset(extras))
    if key in seen or name not in installed: continue
    seen.add(key)
    for req in installed[name].requires or []:
        r = Requirement(req)
        env = {"extra": e for e in extras} if extras else {"extra": ""}
        ok = r.marker is None or any(r.marker.evaluate({"extra": e}) for e in (extras or {""}))
        if ok: stack.append((norm(r.name), set(r.extras)))
names = sorted({n for n, _ in seen})
skip = re.compile(r"^(torch|nvidia-.*|triton)$")
for n in names:
    if skip.match(n): continue
    d = installed[n]
    print(f"{d.metadata['Name']}=={d.version}")
