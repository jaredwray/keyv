<h1 align="center"><img width="250" src="https://jaredwray.com/images/keyv.svg" alt="keyv"></h1>

> Simple key-value storage with support for multiple backends

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![bun](https://github.com/jaredwray/keyv/actions/workflows/bun-test.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/bun-test.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/dm/keyv.svg)](https://www.npmjs.com/package/keyv)
[![npm](https://img.shields.io/npm/v/keyv.svg)](https://www.npmjs.com/package/keyv)

# How to Use the Keyv Mono Repo

Keyv and its storage adapters are in this mono repo and there are details below on how to use this repository. In addtion we have a couple of other documents for review:

* [CODE_OF_CONDUCT](CODE_OF_CONDUCT.md) - Our code of conduct
* [CONTRIBUTING](CONTRIBUTING.md) - How to contribute to this project
* [SECURITY](SECURITY.md) - Security guidelines and supported versions

## Getting Started

Keyv is a simple key-value storage system that supports multiple backends. It's designed to be a simple and consistent way to work with key-value stores.

To learn how to use Keyv, check out the [keyv](https://github.com/jaredwray/keyv/blob/main/packages/keyv/README.md) README. To learn how to use a specific storage adapter, check out the README for that adapter under [Storage Adapters](#storage-adapters).

## Open a Pull Request

You can contribute changes to this repo by opening a pull request:

1) After forking this repository to your Git account, make the proposed changes on your forked branch.
2) Run tests and linting locally.
	- [Install and run Docker](https://docs.docker.com/get-docker/) if you aren't already. NOTE: on docker set `enable host networking` to true as it is required for the tests in redis clustering.
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

## Post an Issue

To post an issue, navigate to the "Issues" tab in the main repository, and then select "New Issue." Enter a clear title describing the issue, as well as a description containing additional relevant information. Also select the label that best describes your issue type. For a bug report, for example, create an issue with the label "bug." In the description field, Be sure to include replication steps, as well as any relevant error messages.

If you're reporting a security violation, be sure to check out the project's [security policy](https://github.com/jaredwray/keyv/blob/main/SECURITY.md).

Please also refer to our [Code of Conduct](https://github.com/jaredwray/keyv/blob/main/CODE_OF_CONDUCT.md) for more information on how to report issues.

## Ask a Question

To ask a question, create an issue with the label "question." In the issue description, include the related code and any context that can help us answer your question.

## Request the Addition of a Storage Adapter

To request a new storage adapter, create an issue with the label "storage adapter." In the issue description, include any relevant information about the storage adapter that you would like to be added. 

Once this request has been submitted in "issues" we will give it 30-60 days for any upvotes to take place. If there is little interest in the request, it will be closed.

If there is already an adapter that you would like to add, please post an issue with the label "storage adapter" and include the name of the adapter you would like to add with the description and any relevant information. 

## Packages in this Repository

* [keyv](https://github.com/jaredwray/keyv/tree/main/packages/keyv): Simple key-value storage with support for multiple backends
* [test-suite](https://github.com/jaredwray/keyv/tree/main/packages/test-suite): Test suite for Keyv API compliance

### Storage Adapters in this Repository

* [etcd](https://github.com/jaredwray/keyv/tree/main/packages/etcd): Etcd storage adapter
* [memcache](https://github.com/jaredwray/keyv/tree/main/packages/memcache): Memcache storage adapter
* [mongo](https://github.com/jaredwray/keyv/tree/main/packages/mongo): MongoDB storage adapter
* [mysql](https://github.com/jaredwray/keyv/tree/main/packages/mysql): MySQL/MariaDB storage adapter
* [postgres](https://github.com/jaredwray/keyv/tree/main/packages/postgres): PostgreSQL storage adapter
* [redis](https://github.com/jaredwray/keyv/tree/main/packages/redis): Redis storage adapter
* [valkey](https://github.com/jaredwray/keyv/tree/main/packages/valkey): Valkey (Open Source Redis) storage adapter
* [sqlite](https://github.com/jaredwray/keyv/tree/main/packages/sqlite): SQLite storage adapter

### Compression Adapters in this Repository

* [brotli](https://github.com/jaredwray/keyv/tree/main/packages/compress-brotli): brotli compression adapter
* [gzip](https://github.com/jaredwray/keyv/tree/main/packages/compress-gzip): gzip compression adapter
* [lz4](https://github.com/jaredwray/keyv/tree/main/packages/compress-lz4): lz4 compression adapter

### Third-party Storage Adapters

We love the community and the third-party storage adapters they have built. They enable Keyv to be used with even more backends and use cases.

View the complete list of third-party storage adapters and learn how to build your own at https://keyv.org/docs/third-party-storage-adapters/

## License

[MIT © Jared Wray](./LICENSE)
