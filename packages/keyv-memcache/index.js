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
      opts.url = opts.uri = uri;
    }
    
    this.opts = opts;

    this.client = memcache.Client.create(uri, opts);

  }

  _getNamespace() {
    return `namespace:${this.namespace}`;
  }

  get(key) {
    return new Promise((resolve, reject) => {
      this.client.get(this.formatKey(key), (err, value) => {
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
    let opts = {};

    if (ttl !== undefined) {
      opts.ttl = Math.floor(ttl/1000); //moving to seconds
    }

    return new Promise((resolve, reject) => {
      this.client.set(this.formatKey(key), value, opts, (err, success) => {
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
      this.client.delete(this.formatKey(key), (err, success) => {
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
      this.client.flush((err) => {
        if (err) {
          this.emit("error", err);
          reject(err);
        } else {
          resolve(undefined);
        }
      });
    });
  }

  formatKey(key) {
    let result = key;

    if(this.namespace) {
      result = this.namespace.trim() + ":" + key.trim();
    }

    return result;
  }
}

module.exports = KeyvMemcache;
