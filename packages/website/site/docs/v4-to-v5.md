---
title: 'v4 to v5 Migration'
order: 2
---

# v4 to v5 Migration

Keyv v5 is a major release with breaking changes. The biggest breaking changes are the removal of the URI. Here is how you can change your code to work with Keyv v5.

## Before with v4
```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
const keyv = new Keyv('redis://user:pass@localhost:6379');
```

In the past this would have worked but now you need to pass in the store either directly to the constructor like below or via the options object parameter called `store`. The constructor will take the storage adapter or the options as the first parameter.

## Now with v5
```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
const keyv = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379'));
```

## An example with options
When passing in options you can do the following using the `store` parameter:
```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
const keyv = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379',{ namespace: 'my-namespace' }));
```

## Removing support for Nodejs 18 and below

We have stopped testing on Nodejs 18 and below and while we do not force or require you to use Nodejs 20+ we do recommend it.


# New Features
Here are a list of new features in Keyv v5:
- **Typescript Support**: Keyv v5 is written in Typescript and has full typescript support.
- **ESM Support**: Keyv v5 is written in ESM and has full ESM support.
- **Event Emitter**: Keyv v5 is now an event emitter and emits events for `set`, `delete`, `clear`, and `error` with no reliance on third party libraries.
- **Built in Statistics**: Keyv v5 has built in statistics for `hits`, `misses`, `sets`, `deletes`, and `errors`.
- **Hooks**: Keyv v5 has hooks for pre and post processing on `set()`, `get()`, `getMany()`, and `delete()`.

You can learn about any of these features in the Keyv API documentation.

