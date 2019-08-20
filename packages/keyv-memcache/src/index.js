"use strict";

const EventEmitter = require("events");

class KeyvMemcache extends EventEmitter {
  constructor(uri, opts) {
    super();
    this.ttlSupport = true;
    opts = Object.assign({}, typeof uri === "string" ? { uri } : uri, opts);
    if (opts.uri && typeof opts.url === "undefined") {
      opts.url = opts.uri;
    }

  }

  _getNamespace() {
    return `namespace:${this.namespace}`;
  }

  get(key) {

  }

  set(key, value, ttl) {
  }

  delete(key) {

  }

  clear() {
  }
}

module.exports = KeyvMemcache;
