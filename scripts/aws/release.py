#!/usr/bin/env python3
"""Build and publish SingFlow images. Never deploys or starts application services."""
import argparse
import datetime
import json
import pathlib
import re
import subprocess
import tarfile
import tempfile

ACCOUNT = "505828739529"
REGION = "us-east-2"
REGISTRY = ACCOUNT + ".dkr.ecr." + REGION + ".amazonaws.com"
KNOWN_BROKEN_MAIN = "f78faa42b551a8af358f3622ebfe45a8243d52b1"


def run(args, capture=False, **kwargs):
    return subprocess.run(args, check=True, text=True, capture_output=capture, **kwargs)


def aws(profile, *args):
    return json.loads(run(["aws", *(["--profile", profile] if profile else []),
                           "--region", REGION, "--output", "json", *args], capture=True).stdout)


def validate_manifest(data):
    revision = data.get("revision", "")
    tag = data.get("tag", "")
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("Invalid commit SHA")
    if not re.fullmatch(r"(manual|ci)-" + revision + r"-[0-9]{8}T[0-9]{6}Z", tag):
        raise ValueError("Release tag must match the commit SHA")
    if data.get("schema") != 1 or data.get("account") != ACCOUNT or data.get("region") != REGION:
        raise ValueError("Unexpected release schema, account or region")
    expected = {name: REGISTRY + "/singflow/" + name + ":" + tag
                for name in ("backend", "frontend")}
    if data.get("images") != expected:
        raise ValueError("Unexpected image repositories or tags")
    return data


def inspect_local(image, revision):
    info = json.loads(run(["docker", "image", "inspect", image], capture=True).stdout)[0]
    if (info.get("Os"), info.get("Architecture")) != ("linux", "amd64"):
        raise ValueError("Image must be linux/amd64: " + image)
    labels = info.get("Config", {}).get("Labels") or {}
    if labels.get("org.opencontainers.image.revision") != revision:
        raise ValueError("Image revision does not match release: " + image)
    return info["Id"]


def ensure_buildable(source, revision):
    if revision == KNOWN_BROKEN_MAIN:
        lock = json.loads((source / "frontend/package-lock.json").read_text())
        if any("node_modules/@emnapi/" + name not in lock["packages"]
               for name in ("core", "runtime")):
            raise ValueError(
                "This main commit has the known Linux npm ci lockfile failure. "
                "Review and merge frontend/package-lock.json first; do not overlay local files.")


def write_new(path, data):
    with path.open("x") as stream:
        json.dump(data, stream, indent=2)
        stream.write("\n")


def build(source, revision, output, kind):
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("Invalid source revision")
    ensure_buildable(source, revision)
    if output.exists():
        raise ValueError("Output already exists; choose a new manifest path")
    tag = kind + "-" + revision + "-" + datetime.datetime.now(
        datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    data = {"schema": 1, "account": ACCOUNT, "region": REGION, "revision": revision,
            "tag": tag, "platform": "linux/amd64", "published": False,
            "images": {name: REGISTRY + "/singflow/" + name + ":" + tag
                       for name in ("backend", "frontend")}}
    run(["docker", "info"], capture=True)
    for name, image in data["images"].items():
        run(["docker", "buildx", "build", "--platform", "linux/amd64", "--load",
             "--provenance=false", "--sbom=false",
             "--label", "org.opencontainers.image.revision=" + revision,
             "--tag", image, str(source / name)])
        inspect_local(image, revision)
    write_new(output, data)
    print("Build complete. Manifest: " + str(output))


def build_main(repo, output, fetch=True):
    if fetch:
        run(["git", "-C", str(repo), "fetch", "--no-tags", "origin", "main"])
    revision = run(["git", "-C", str(repo), "rev-parse", "origin/main^{commit}"],
                   capture=True).stdout.strip()
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("Invalid origin/main revision")
    with tempfile.TemporaryDirectory(prefix="singflow-main-") as directory:
        root = pathlib.Path(directory)
        archive = root / "source.tar"
        source = root / "source"
        source.mkdir()
        run(["git", "-C", str(repo), "archive", "--format=tar", "--output",
             str(archive), revision, "backend", "frontend"])
        with tarfile.open(archive) as bundle:
            bundle.extractall(source, filter="data")
        build(source, revision, output, "manual")


def publish(path, profile):
    data = validate_manifest(json.loads(path.read_text()))
    receipt = path.with_name(path.stem + ".published.json")
    if receipt.exists():
        raise ValueError("Published receipt already exists; inspect it instead of overwriting")
    # Inspect both images and both repositories before sending any image.
    ids = {name: inspect_local(image, data["revision"])
           for name, image in data["images"].items()}
    identity = aws(profile, "sts", "get-caller-identity")
    if identity["Account"] != ACCOUNT or identity["Arn"].endswith(":root"):
        raise ValueError("Use the approved non-root account/profile")
    repositories = aws(profile, "ecr", "describe-repositories", "--repository-names",
                       "singflow/backend", "singflow/frontend")["repositories"]
    if {r["repositoryUri"] for r in repositories} != {
            REGISTRY + "/singflow/backend", REGISTRY + "/singflow/frontend"}:
        raise ValueError("Unexpected ECR destinations")
    if any(r.get("imageTagMutability") != "IMMUTABLE" for r in repositories):
        raise ValueError("ECR release repositories must use immutable tags")
    password = run(["aws", *(["--profile", profile] if profile else []), "--region", REGION, "ecr",
                    "get-login-password"], capture=True).stdout
    run(["docker", "login", "--username", "AWS", "--password-stdin", REGISTRY],
        input=password, capture=True)
    del password
    digests = {}
    for name, image in data["images"].items():
        def lookup():
            return aws(profile, "ecr", "batch-get-image", "--repository-name",
                       "singflow/" + name, "--image-ids", "imageTag=" + data["tag"])
        found = lookup()
        if not found.get("images"):
            failures = found.get("failures", [])
            if not failures or any(f.get("failureCode") != "ImageNotFound" for f in failures):
                raise ValueError("ECR lookup failed; refusing to assume the tag is absent")
            run(["docker", "push", image])
            found = lookup()
        images = found.get("images", [])
        if len(images) != 1:
            raise ValueError("Cannot verify published image: " + name)
        manifest = json.loads(images[0]["imageManifest"])
        if manifest.get("config", {}).get("digest") != ids[name]:
            raise ValueError("Existing/published image differs from local image: " + name)
        digests[name] = REGISTRY + "/singflow/" + name + "@" + images[0]["imageId"]["imageDigest"]
    data.update(published=True, digests=digests)
    write_new(receipt, data)
    print("Both images verified in ECR. No deployment performed. Receipt: " + str(receipt))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    manual = commands.add_parser("build-main")
    manual.add_argument("--repo", type=pathlib.Path, default=pathlib.Path.cwd())
    manual.add_argument("--output", type=pathlib.Path, required=True)
    manual.add_argument("--no-fetch", action="store_true",
                        help="Use cached origin/main; only for explicit offline operation")
    ci = commands.add_parser("build-source")
    ci.add_argument("--source", type=pathlib.Path, required=True)
    ci.add_argument("--revision", required=True)
    ci.add_argument("--output", type=pathlib.Path, required=True)
    push = commands.add_parser("publish")
    push.add_argument("--manifest", type=pathlib.Path, required=True)
    push.add_argument("--profile", default="singflow-teste")
    args = parser.parse_args()
    try:
        if args.command == "build-main":
            build_main(args.repo.resolve(), args.output.resolve(), not args.no_fetch)
        elif args.command == "build-source":
            build(args.source.resolve(), args.revision, args.output.resolve(), "ci")
        else:
            publish(args.manifest.resolve(), args.profile)
    except (ValueError, subprocess.CalledProcessError) as error:
        # Do not print subprocess input, captured output, tokens or environment.
        parser.exit(1, "Release stopped: " + (
            str(error) if isinstance(error, ValueError) else "external command failed") + "\n")


if __name__ == "__main__":
    main()
