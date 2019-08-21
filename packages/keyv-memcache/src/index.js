"use strict";

const EventEmitter = require("events");
const memcache = require("memjs");

class KeyvMemcache extends EventEmitter {
  constructor(uri, opts) {
    super();
    this.ttlSupport = true;
    opts = Object.assign({}, typeof uri === "string" ? { uri } : uri, opts);

    if (uri === undefined) {
      uri = "localhost:11211";
    }
    
    this.client = memcache.Client.create(uri, opts);

  }

  _getNamespace() {
    return `namespace:${this.namespace}`;
  }

  get(key) {
    return new Promise((resolve, reject) => {
      this.client.get(key, (err, value, flags) => {
        if (err) {
          this.emit("error", err);
          reject(err);
        } else {
          resolve(value, flags);
        }
      });
    });
  }

  set(key, value, ttl) {
    const opts = {};

    if (ttl !== undefined) {
      opts.ttl = ttl;
    }

    return new Promise((resolve, reject) => {
      this.client.set(key, value, opts, (err, success) => {
        if (err) {
          this.emit("error", err);
          reject(err);
        } else {
          resolve(success);
        }
      });
    });
  }

  delete(key) {
    return new Promise((resolve, reject) => {
      this.client.delete(key, (err, success) => {
        if (err) {
          this.emit("error", err);
          reject(err);
        } else {
          resolve(success);
        }
      });
    });
  }

  clear() {
    return new Promise((resolve, reject) => {
      this.client.flush((err, success) => {
        if (err) {
          this.emit("error", err);
          reject(err);
        } else {
          resolve(success);
        }
      });
    });
  }
}

module.exports = KeyvMemcache;
