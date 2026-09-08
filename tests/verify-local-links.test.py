#!/usr/bin/env python3
"""Regression tests for repository-relative Markdown link validation."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


REPOSITORY = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("verify", REPOSITORY / "scripts/verify.py")
assert SPEC is not None and SPEC.loader is not None
verify = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(verify)


class LocalLinksTest(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory(prefix="verify-local-links-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.git("init", "--quiet")
        root_patch = patch.object(verify, "ROOT", self.root)
        root_patch.start()
        self.addCleanup(root_patch.stop)

    def git(self, *arguments: str) -> None:
        subprocess.run(["git", *arguments], cwd=self.root, check=True,
                       capture_output=True, text=True)

    def write(self, name: str, content: str) -> None:
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def test_private_runtime_and_venv_are_ignored(self) -> None:
        self.write(".gitignore", (REPOSITORY / ".gitignore").read_text(encoding="utf-8"))
        for name in (".claude-orch/plugins/cache/README.md", ".venv/README.md"):
            self.write(name, "[missing](not-in-cache.md)\n")
        verify.local_links()
        # Ignoring a private runtime must not hide a new repository document.
        self.write("README.md", "[missing](not-in-repository.md)\n")
        with self.assertRaisesRegex(RuntimeError, r"broken local link: README\.md -> not-in-repository\.md"):
            verify.local_links()

    def test_tracked_claude_document_is_checked_even_when_directory_is_ignored(self) -> None:
        self.write(".gitignore", ".claude/\n")
        self.write(".claude/README.md", "[missing](not-in-repository.md)\n")
        self.git("add", "--force", ".claude/README.md")
        self.write(".claude/worktrees/local/README.md", "[missing](not-in-cache.md)\n")
        with self.assertRaisesRegex(RuntimeError, "not-in-repository"):
            verify.local_links()
        self.write(".claude/not-in-repository.md", "# Target\n")
        verify.local_links()

    def test_new_claude_document_is_checked_when_not_ignored(self) -> None:
        # Override user/global ignore rules in this disposable repository.
        self.write(".gitignore", "!.claude/\n!.claude/**\n")
        self.write(".claude/README.md", "[missing](absent.md)\n")
        with self.assertRaisesRegex(RuntimeError, r"absent\.md"):
            verify.local_links()

    def test_valid_links_and_markdown_inside_code_fences(self) -> None:
        self.write("docs/target name.md", "# Target\n")
        self.write("docs/README.md", "[relative](target%20name.md#target)\n"
                   "[spaced](<target name.md>)\n[anchor](#local)\n"
                   "[external](https://example.invalid/page)\n"
                   "```markdown\n[example](missing.md)\n```\n")
        verify.local_links()

    def test_broken_tracked_document_is_checked(self) -> None:
        self.write("docs/README.md", "[missing](absent.md)\n")
        self.git("add", "docs/README.md")
        with self.assertRaisesRegex(RuntimeError, r"absent\.md"):
            verify.local_links()

    def test_deleted_tracked_document_is_skipped_but_links_to_it_fail(self) -> None:
        self.write("docs/removed.md", "# Removed document\n")
        self.git("add", "docs/removed.md")
        (self.root / "docs/removed.md").unlink()
        verify.local_links()
        self.write("README.md", "[removed](docs/removed.md)\n")
        with self.assertRaisesRegex(RuntimeError, r"broken local link: README\.md -> docs/removed\.md"):
            verify.local_links()

    def test_unreadable_document_is_not_silently_skipped(self) -> None:
        self.write("README.md", "# Document\n")
        with patch.object(Path, "read_text", side_effect=PermissionError("fixture unreadable")):
            with self.assertRaises(PermissionError):
                verify.local_links()

    def test_git_listing_failure_is_not_a_pass(self) -> None:
        with patch.object(verify.subprocess, "run", return_value=subprocess.CompletedProcess(
                ["git"], 1, stdout="", stderr="fixture failure")):
            with self.assertRaisesRegex(RuntimeError, "could not list repository Markdown"):
                verify.local_links()


if __name__ == "__main__":
    unittest.main()
