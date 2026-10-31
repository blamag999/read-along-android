#!/usr/bin/env python3
"""Generate channel-scoped Vietnamese release notes from categorized commits."""
import json
import os
import re
import subprocess

CATEGORIES = {
    "feature": "Tính năng mới",
    "improve": "Cải tiến",
    "fix": "Sửa lỗi",
    "security": "Bảo mật",
}
ALIASES = {"perf": "improve"}
VERSION_RE = re.compile(r"v?(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$")


def release_version(tag):
    match = VERSION_RE.fullmatch(tag or "")
    return tuple(int(value or 0) for value in match.groups()) if match else None


def latest_channel_release(releases, channel):
    want_prerelease = channel == "beta"
    candidates = []
    for release in releases:
        if bool(release.get("isPrerelease")) != want_prerelease:
            continue
        version = release_version(release.get("tagName"))
        if version is not None:
            candidates.append((version, release.get("publishedAt", ""), release["tagName"]))
    return max(candidates)[2] if candidates else None


def collect_entries(commit_text):
    groups = {key: [] for key in CATEGORIES}
    for line in commit_text.splitlines():
        line = line.strip()
        if not line.startswith("[") or "]" not in line:
            continue
        marker, description = line[1:].split("]", 1)
        marker = ALIASES.get(marker.strip().lower(), marker.strip().lower())
        description = description.strip()
        if marker in groups and description and description not in groups[marker]:
            groups[marker].append(description)
    return groups


def render_notes(groups):
    sections = []
    for key, heading in CATEGORIES.items():
        entries = groups.get(key, [])
        if entries:
            sections.append(heading + ":\n" + "\n".join("• " + item for item in entries[:5]))
    return "\n\n".join(sections)


def main():
    channel = os.environ["CHANNEL"]
    releases = json.loads(os.environ.get("RELEASES", "[]"))
    tag = latest_channel_release(releases, channel)
    verified_tag = tag and subprocess.run(
        ["git", "rev-parse", "-q", "--verify", tag + "^{commit}"],
        capture_output=True, text=True
    ).returncode == 0
    command = ["git", "log", "--no-merges", "--format=%s%n%b"]
    command += [tag + "..HEAD"] if verified_tag else ["-30"]
    history = subprocess.run(command, check=True, capture_output=True, text=True).stdout
    notes = render_notes(collect_entries(history))
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        output.write("changelog<<CHANGELOG_EOF\n" + notes + "\nCHANGELOG_EOF\n")
    print("Release channel:", channel)
    print("Previous channel tag:", tag or "(first release)")
    print("Release notes characters:", len(notes))


if __name__ == "__main__":
    main()
