"use strict";

const EventEmitter = require("events");
const memcache = require("memjs");
const JSONB = require('json-buffer');

class KeyvMemcache extends EventEmitter {
  constructor(uri, opts) {
    super();
    this.ttlSupport = true;

    opts = Object.assign(
			{},
			(typeof uri === 'string') ? { uri } : uri,
			opts
		);
		if (opts.uri && typeof opts.url === 'undefined') {
			opts.url = opts.uri;
    }

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
      this.client.get(key, (err, value) => {
        if (err) {
          this.emit("error", err);
          reject(err);
        } else {
          let val = {};
          if(value === null){
            val = {
              value: undefined,
              expires: 0
            }
          } else {
            val = JSONB.parse(value);
          }
          resolve(val);
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
          resolve(undefined);
        }
      });
    });
  }
}

module.exports = KeyvMemcache;
