#!/usr/bin/env python3
"""SELAE in one command.

    python run.py          development server (hot reload), http://localhost:5173
    python run.py venue    build once and serve it from one Node server on port 8080
    python run.py test     run the unit tests

Dependencies are installed on the first run and skipped afterwards, unless
package.json or package-lock.json changed since.
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
STAMP = os.path.join(ROOT, "node_modules", ".selae-installed")
MIN_NODE = 20
sys.stdout.reconfigure(line_buffering=True)


def fail(msg):
    print(f"\n{msg}\n")
    sys.exit(1)


def tool(name):
    path = shutil.which(name)
    if not path:
        fail(f"{name} is not installed. Get the Node.js LTS installer from nodejs.org, then run this again.")
    return path


def check_node(node):
    out = subprocess.run([node, "-p", "process.versions.node"], capture_output=True, text=True, cwd=ROOT).stdout.strip()
    major = int(out.split(".")[0] or 0)
    if major < MIN_NODE:
        fail(f"Node {out} is too old. SELAE needs Node {MIN_NODE} or newer: get the LTS installer from nodejs.org.")
    print(f"Node {out}")


def mtime(*parts):
    try:
        return os.path.getmtime(os.path.join(ROOT, *parts))
    except OSError:
        return None


def needs_install():
    installed = mtime("node_modules", ".selae-installed")
    if installed is None:
        return True
    for f in ("package.json", "package-lock.json"):
        changed = mtime(f)
        if changed is not None and changed > installed:
            return True
    return False


def data_backend():
    env = os.path.join(ROOT, ".env")
    try:
        with open(env, encoding="utf-8") as f:
            for line in f:
                k, _, v = line.strip().partition("=")
                if k == "SUPABASE_URL" and v and "your-project" not in v:
                    return f"Supabase ({v.strip()})"
    except OSError:
        pass
    return "local file data/selae.json (no .env with SUPABASE_URL; see .env.example)"


def run(cmd):
    try:
        return subprocess.call(cmd, cwd=ROOT)
    except KeyboardInterrupt:
        return 0


def main():
    mode = (sys.argv[1] if len(sys.argv) > 1 else "dev").lower()
    if mode not in ("dev", "venue", "test"):
        fail(__doc__)

    node, npm = tool("node"), tool("npm")
    check_node(node)

    if needs_install():
        print("Installing dependencies. This takes a minute or two, and only happens once.\n")
        if run([npm, "install"]) != 0:
            fail("npm install failed. Check the messages above, then run this again.")
        with open(STAMP, "w") as f:
            f.write("written by run.py after a successful npm install\n")
    else:
        print("Dependencies already installed.")

    script = {"dev": "dev", "venue": "start", "test": "test"}[mode]
    if mode != "test":
        print(f"Data: {data_backend()}")
    print()
    sys.exit(run([npm, "run", script]))


if __name__ == "__main__":
    main()
