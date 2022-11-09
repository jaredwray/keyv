
# How to Implement Caching with Node.js

## What is Node.js?
Node.js is an async event-driven cross-platform JavaScript runtime environment for building scalable network applications. Using Node.js enables developers to write server-side scripts and command line tools and run them everywhere.

As Node.js applications run in a single process, they do not create threads for each request; they use a set of async I/O primitives to prevent blocking. A single Node.js server can handle thousands of concurrent connections as it doesn't wait for responses; it resumes operations when the response comes back.
=======
# How to Implement Caching with Node

## What is a Cache?
A cache is a short-term, high-speed data storage layer that stores a subset of data, enabling it to be retrieved faster than accessing it from its primary storage location. Caching allows you to reuse previously retrieved data efficiently.

## Caching Support in Keyv
Caching will work in memory by default. However, users can also install a Keyv storage adapter that is initialized with a connection string or any other storage that implements the Map API.

## Extend your own Module with Keyv to Add Cache Support
- Keyv can be easily embedded into other modules to add cache support.
- You should also set a namespace for your module to safely call `.clear()` without clearing unrelated app data.

>**Note**:
> The recommended pattern is to expose a cache option in your module's options which is passed through to Keyv.

### Example - Add Cache Support to a Module

1. Install whichever storage adapter you will be using, `keyv-redis` in this example
```sh
npm install --save keyv-redis
```
2. Declare the Module with the cache controlled by a Keyv instance
```js
class AwesomeModule {
	constructor(opts) {
		this.cache = new Keyv({
			uri: typeof opts.cache === 'string' && opts.cache,
			store: typeof opts.cache !== 'string' && opts.cache,
			namespace: 'awesome-module'
		});
	}
}
```

3. Create an Instance of the Module with caching support
```js
const AwesomeModule = require('awesome-module');
const awesomeModule = new AwesomeModule({ cache: 'redis://localhost' });
```
