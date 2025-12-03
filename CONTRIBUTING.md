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

# Code of Conduct
Please refer to our [Code of Conduct](https://github.com/jaredwray/keyv/blob/main/CODE_OF_CONDUCT.md) readme for how to contribute to this open source project and work within the community. 
