#!/usr/bin/env python3
"""Keep only the just-published APK in one Read Along OTA channel in R2."""
import json
import os
import re
import subprocess
import sys

BUCKET = "read-along-releases"
CHANNELS = {"beta", "official"}
APK_NAME = re.compile(r"read-along-v\\d+\\.\\d+\\.\\d+-android\\.apk$")


def stale_apk_keys(objects, prefix, keep_key):
    """Return old APK keys in this channel, requiring the current APK to exist."""
    keys = [item.get("Key", "") for item in objects]
    if keep_key not in keys:
        raise ValueError(f"Current OTA APK is missing from R2: {keep_key}")
    return sorted(
        key for key in keys
        if key.startswith(prefix) and key.endswith(".apk") and key != keep_key
    )


def aws_json(endpoint, *args):
    result = subprocess.run(
        ["aws", "--no-cli-pager", "--endpoint-url", endpoint, "s3api", *args],
        check=True, capture_output=True, text=True,
    )
    return json.loads(result.stdout or "{}")


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: prune-ota-releases.py <beta|official> <current-apk-filename>")
    channel, filename = sys.argv[1:]
    if channel not in CHANNELS or not APK_NAME.fullmatch(filename):
        raise SystemExit("Invalid OTA channel or APK filename")

    endpoint = os.environ.get("R2_ENDPOINT", "")
    if not endpoint:
        raise SystemExit("R2_ENDPOINT is required")

    prefix = f"releases/{channel}/"
    keep_key = prefix + filename

    # Fail closed: never prune a channel unless the newly published APK is present.
    aws_json(endpoint, "head-object", "--bucket", BUCKET, "--key", keep_key)
    listing = aws_json(
        endpoint, "list-objects-v2", "--bucket", BUCKET, "--prefix", prefix,
    )
    objects = listing.get("Contents", [])
    stale = stale_apk_keys(objects, prefix, keep_key)

    for offset in range(0, len(stale), 1000):
        batch = stale[offset:offset + 1000]
        payload = json.dumps({
            "Objects": [{"Key": key} for key in batch],
            "Quiet": True,
        }, separators=(",", ":"))
        aws_json(
            endpoint, "delete-objects", "--bucket", BUCKET, "--delete", payload,
        )

    # Verify the invariant after cleanup; leave manifests and the other channel untouched.
    verified = aws_json(
        endpoint, "list-objects-v2", "--bucket", BUCKET, "--prefix", prefix,
    )
    remaining = sorted(
        item.get("Key", "") for item in verified.get("Contents", [])
        if item.get("Key", "").endswith(".apk")
    )
    if remaining != [keep_key]:
        raise RuntimeError(
            f"OTA retention verification failed for {channel}: {remaining}"
        )

    print(f"OTA retention verified: {channel} keeps {filename}; removed {len(stale)} old APK(s).")


if __name__ == "__main__":
    main()
