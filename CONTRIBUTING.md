# Contributing
When contributing to this repository, please first discuss the change you wish to make via issue, email, or any other method with the owners of this repository before making a change.

Please note we have a [Code of Conduct](CODE_OF_CONDUCT.md), please follow it in all your interactions with the project.

We release new versions of this project (maintenance/features) on a monthly cadence so please be aware that some items will not get released right away.

# Pull Request Process
You can contribute changes to this repo by opening a pull request:

1) After forking this repository to your Git account, make the proposed changes on your forked branch.
2) Run tests and linting locally.
	- [Install and run Docker](https://docs.docker.com/get-docker/) if you aren't already. NOTE: on docker set `enable host networking` to true as it is required for the tests in redis clustering.
	- Install `aws cli` as you will need it to run dynamodb tests.
	- Install `pnpm` by doing `npm install -g pnpm` if you haven't already, and run `pnpm install`
	- Run `pnpm test:services:start`, allow for the services to come up.
	- Run `pnpm test`.
3) Commit your changes and push them to your forked repository.
4) Navigate to the main `keyv` repository and select the *Pull Requests* tab.
5) Click the *New pull request* button, then select the option "Compare across forks"
6) Leave the base branch set to main. Set the compare branch to your forked branch, and open the pull request.
7) Once your pull request is created, ensure that all checks have passed and that your branch has no conflicts with the base branch. If there are any issues, resolve these changes in your local repository, and then commit and push them to git.
8) Similarly, respond to any reviewer comments or requests for changes by making edits to your local repository and pushing them to Git.
9) Once the pull request has been reviewed, those with write access to the branch will be able to merge your changes into the `keyv` repository.

If you need more information on the steps to create a pull request, you can find a detailed walkthrough in the [Github documentation](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request-from-a-fork)

# Updating Packages

We use `pnpm outdated` to check for outdated dependencies across the monorepo. When updating packages, we follow a cautious approach to avoid potential issues with newly released versions.

## Why We Use `minimumReleaseAge: 7200`

In our `pnpm-workspace.yaml`, we have configured `minimumReleaseAge: 7200` (5 days in minutes). This setting ensures that when running `pnpm update`, only packages that have been published for at least 5 days will be considered for updates.

This approach provides several benefits:

1. **Stability**: Newly published packages may contain undiscovered bugs or breaking changes. Waiting 5 days allows the community to identify and report issues.
2. **Security**: Malicious packages are often detected and removed within the first few days of publication. This delay provides a buffer against supply chain attacks.
3. **Reliability**: It gives package maintainers time to publish patch releases if critical issues are found shortly after a release.

To check for outdated packages:
```bash
pnpm outdated
```

To update packages (respecting the minimum release age):
```bash
pnpm update
```

# Release Process

Keyv has two release lines: **`main`** (v6, the current major) and the **`v5`** branch (maintenance / LTS). Both publish to npm through the same GitHub Actions workflow file, `.github/workflows/release.yaml` (each branch carries its own copy), using **npm staged publishing** with **OIDC trusted publishing** and **provenance**:

- CI never publishes live. It builds, tests, packs each package and runs `pnpm stage publish … --provenance`, which puts the version in npm's stage queue with a provenance attestation.
- A maintainer then approves each staged version on npm with 2FA; only then does it become installable.
- There are no npm tokens anywhere. The trusted publisher on npmjs.com (repo `jaredwray/keyv`, workflow `release.yaml`, environment `release`) is configured **stage-only**, and because both branches use the same workflow filename one configuration covers both lines.

| | `main` (v6) | `v5` branch |
| --- | --- | --- |
| Versioning | Every package shares one version (`pnpm version:sync`) | Each package keeps its own version |
| Trigger | Publishing a GitHub Release from a tag on `main` (`vX.Y.Z`, `vX.Y.Z-beta.N`) | Manual **Run workflow** from the `v5` branch (`workflow_dispatch`); GitHub Releases do not publish |
| What gets staged | Every package whose exact version is not on npm yet | Only the packages whose version is ahead of npm |
| Dist-tag | From the version and `LATEST_MAJOR`: pre-release → its channel (`beta`, `rc`), current major → `latest`, older major → `v{major}-lts` | From each package's own registry state, same tag names; a tag is never moved backwards |
| Script | `scripts/release-publish.ts` (`pnpm test:scripts`) | `scripts/release.mjs` (`pnpm test:release`, `pnpm release:dry`) |
| Release notes | The GitHub Release | `changelog/<name>.md` on the `v5` branch |

## Releasing v6 from `main`

1. Open a release PR: set the new version in the root `package.json`, run `pnpm version:sync` so every workspace package matches, and merge it.
2. Create a GitHub Release from a new tag on `main` (for example `v6.1.0` or `v6.1.0-beta.1`). Publishing it runs the `release` workflow from that tag: build, the full test suite, the Aikido release scan, the release-logic tests, then the stage step. Versions already on npm are skipped, and a release that would move `latest` backwards is refused.
3. Approve the staged versions on npm (see [Approving staged versions](#approving-staged-versions-both-lines)).

To preview without staging anything: Actions → `release` → **Run workflow** (Dry run is on by default).

## Releasing v5 from the `v5` branch

1. Open a release PR against `v5`: bump `version` in each package that has unreleased changes (never `6.0.0` or higher — the script refuses it), add `changelog/<name>.md`, and merge.
2. Actions → `release` → **Run workflow** → set "Use workflow from" to **`v5`**. Leave **Dry run** checked first: the job summary shows the stage plan (which packages would be staged, under which dist-tag, and which are skipped) and packaging is validated. Then run it again with Dry run unchecked to stage for real. Any ref other than `v5` is forced to a dry run.
3. Approve the staged versions on npm, dependencies first (`@keyv/serialize` → `keyv` → adapters).
4. Optionally create a GitHub Release tagged `v5-YYYY-MM-DD` for release notes. It publishes nothing: a GitHub Release runs the workflow file at the tag's commit, the `v5` branch's workflow has no `release` trigger, and main's release workflow refuses any tag whose commit is not on `main`.

The full v5 runbook, including re-run and recovery rules, is in `changelog/README.md` on the `v5` branch.

## Approving staged versions (both lines)

With pnpm 11.25 or later (or npm 11.15 or later) and an npm login that has 2FA:

```bash
pnpm stage list                 # staged versions awaiting approval
pnpm stage view <stage-id>      # verify version, dist-tag and provenance
pnpm stage approve <stage-id>…  # promote to the registry; one OTP covers a batch
pnpm stage reject <stage-id>    # discard a staged version
```

The **Staged Packages** tab on npmjs.com does the same. A few rules:

- Approve promptly and in dependency order. The dist-tag is fixed when a version is staged and applied when it is approved, so if `latest` has moved to a newer major in between, reject the staged version and re-run the release so the tag is recomputed.
- Never approve a package whose workspace dependency was not staged or approved.
- Staged versions are not visible in the public registry, so re-running a release before approving reports them as conflicts. Approve or reject them in the queue rather than re-staging.
- Verify afterwards with `npm view keyv dist-tags` (or the package in question).
- Release runs on both branches share one concurrency group with a FIFO queue, so a run dispatched while another release is in flight waits for it to finish rather than running alongside it.
- A brand-new package cannot be staged, and trusted publishing cannot create it. Creating it on npm is the one exception to "never publish directly": a maintainer publishes its first version by hand with 2FA, then adds its stage-only trusted publisher on npmjs.com; every later version goes through the workflow.

# Code of Conduct
Please refer to our [Code of Conduct](https://github.com/jaredwray/keyv/blob/main/CODE_OF_CONDUCT.md) readme for how to contribute to this open source project and work within the community. 
