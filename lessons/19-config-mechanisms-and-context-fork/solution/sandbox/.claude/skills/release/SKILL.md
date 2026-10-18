---
name: release
description: "Cut a Ledgerly release: bump version, write notes, tag and push."
argument-hint: "[major|minor|patch]"
disable-model-invocation: true
---

Cut a $ARGUMENTS release:

1. Run `npm test`; stop if anything fails.
2. Bump the version in package.json.
3. Collect merged PR titles since the last tag with `git log --merges`.
4. Write release notes grouped by Features / Fixes / Internal.
5. Commit "release: vX.Y.Z", tag `vX.Y.Z`, push the tag.
