import importlib.util
import json
import pathlib
import tempfile
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("release", pathlib.Path(__file__).with_name("release.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def manifest(self):
        sha = "a" * 40
        tag = "manual-" + sha + "-20261114T120000Z"
        return {"schema": 1, "revision": sha, "tag": tag,
                "account": release.ACCOUNT, "region": release.REGION,
                "images": {n: release.REGISTRY + "/singflow/" + n + ":" + tag
                           for n in ("backend", "frontend")}}

    def test_rejects_wrong_account_or_repository_or_revision(self):
        for mutate in (lambda d: d.update(account="000000000000"),
                       lambda d: d["images"].update(backend="attacker/image:latest"),
                       lambda d: d.update(revision="; shell"),
                       lambda d: d.update(tag="manual-" + "b"*40 + "-20261114T120000Z")):
            with self.subTest(mutate=mutate):
                d = self.manifest()
                mutate(d)
                with self.assertRaises(ValueError):
                    release.validate_manifest(d)

    def test_rejects_arm_image_even_on_apple_silicon(self):
        info = {"Os": "linux", "Architecture": "arm64", "Id": "sha256:x",
                "Config": {"Labels": {"org.opencontainers.image.revision": "a"*40}}}
        with patch.object(release, "run", return_value=types.SimpleNamespace(stdout=json.dumps([info]))):
            with self.assertRaises(ValueError):
                release.inspect_local("image", "a"*40)

    def test_rejects_image_from_other_commit(self):
        info = {"Os": "linux", "Architecture": "amd64", "Id": "sha256:x",
                "Config": {"Labels": {"org.opencontainers.image.revision": "b"*40}}}
        with patch.object(release, "run", return_value=types.SimpleNamespace(stdout=json.dumps([info]))):
            with self.assertRaises(ValueError):
                release.inspect_local("image", "a"*40)

    def test_refuses_known_main_lockfile_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / "frontend").mkdir()
            (root / "frontend/package-lock.json").write_text('{"packages":{}}')
            with self.assertRaises(ValueError):
                release.ensure_buildable(root, release.KNOWN_BROKEN_MAIN)

    def test_local_build_exports_main_not_dirty_head(self):
        sha = "a"*40
        calls = []
        def runner(args, **kwargs):
            calls.append(args)
            if "rev-parse" in args:
                return types.SimpleNamespace(stdout=sha+"\n")
            if "archive" in args:
                import tarfile
                with tarfile.open(args[args.index("--output")+1], "w"):
                    pass
            return types.SimpleNamespace(stdout="")
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(release, "run", side_effect=runner), patch.object(release, "build") as build:
                release.build_main(pathlib.Path(tmp), pathlib.Path(tmp)/"result.json", fetch=False)
                self.assertEqual(build.call_args.args[1], sha)
                archive = next(a for a in calls if "archive" in a)
                self.assertEqual(archive[-3:], [sha, "backend", "frontend"])
                self.assertFalse(any("checkout" in a or "reset" in a for a in calls))

    def test_failing_second_build_does_not_create_release_manifest(self):
        from subprocess import CalledProcessError
        def runner(args, **kwargs):
            if args[:3] == ["docker", "buildx", "build"] and args[-1].endswith("frontend"):
                raise CalledProcessError(1, args)
            return types.SimpleNamespace(stdout="")
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp)/"release.json"
            with patch.object(release, "run", side_effect=runner), patch.object(release, "inspect_local"):
                with self.assertRaises(CalledProcessError):
                    release.build(pathlib.Path(tmp), "a"*40, out, "manual")
            self.assertFalse(out.exists())

    def test_wrong_aws_account_prevents_login_and_push(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp)/"release.json"
            path.write_text(json.dumps(self.manifest()))
            with patch.object(release, "inspect_local", return_value="sha256:abc"),                  patch.object(release, "aws", return_value={"Account":"000000000000","Arn":"arn:x"}),                  patch.object(release, "run") as runner:
                with self.assertRaises(ValueError):
                    release.publish(path, "profile")
                runner.assert_not_called()

    def test_failure_during_second_push_does_not_report_published_release(self):
        from subprocess import CalledProcessError
        manifest = self.manifest()
        counts = {}
        def aws(profile, *args):
            if args[0] == "sts":
                return {"Account": release.ACCOUNT, "Arn":"arn:aws:sts::x:assumed-role/test/user"}
            if args[1] == "describe-repositories":
                return {"repositories":[{"repositoryUri":release.REGISTRY+"/singflow/"+n,
                                          "imageTagMutability":"IMMUTABLE"} for n in ("backend","frontend")]}
            name = args[args.index("--repository-name")+1].split("/")[-1]
            counts[name] = counts.get(name, 0)+1
            if counts[name] == 1:
                return {"images":[], "failures":[{"failureCode":"ImageNotFound"}]}
            return {"images":[{"imageManifest":json.dumps({"config":{"digest":"sha256:abc"}}),
                              "imageId":{"imageDigest":"sha256:"+"a"*64}}]}
        def runner(args, **kwargs):
            if args[:2] == ["docker","push"] and "/frontend:" in args[-1]:
                raise CalledProcessError(1,args)
            return types.SimpleNamespace(stdout="token-never-printed")
        with tempfile.TemporaryDirectory() as tmp:
            path=pathlib.Path(tmp)/"release.json"
            path.write_text(json.dumps(manifest))
            with patch.object(release,"inspect_local",return_value="sha256:abc"),                  patch.object(release,"aws",side_effect=aws), patch.object(release,"run",side_effect=runner):
                with self.assertRaises(CalledProcessError):
                    release.publish(path,"profile")
            self.assertFalse(path.with_name("release.published.json").exists())

    def test_existing_tag_with_other_contents_is_never_overwritten(self):
        def aws(profile,*args):
            if args[0]=="sts":
                return {"Account":release.ACCOUNT,"Arn":"arn:aws:sts::x:assumed-role/test/user"}
            if args[1]=="describe-repositories":
                return {"repositories":[{"repositoryUri":release.REGISTRY+"/singflow/"+n,
                                          "imageTagMutability":"IMMUTABLE"} for n in ("backend","frontend")]}
            return {"images":[{"imageManifest":json.dumps({"config":{"digest":"sha256:other"}}),
                              "imageId":{"imageDigest":"sha256:"+"b"*64}}]}
        with tempfile.TemporaryDirectory() as tmp:
            path=pathlib.Path(tmp)/"release.json"; path.write_text(json.dumps(self.manifest()))
            with patch.object(release,"inspect_local",return_value="sha256:abc"),                  patch.object(release,"aws",side_effect=aws),                  patch.object(release,"run",return_value=types.SimpleNamespace(stdout="token")) as runner:
                with self.assertRaises(ValueError):
                    release.publish(path,"profile")
                self.assertFalse(any(c.args[0][:2]==["docker","push"] for c in runner.call_args_list))


if __name__ == "__main__":
    unittest.main()
