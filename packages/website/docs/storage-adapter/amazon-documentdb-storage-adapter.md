---
title: 'Amazon DocumentDB Storage Adapter'
sidebarTitle: 'Amazon DocumentDB'
parent: 'Storage Adapter'
---

# Configure Keyv with an Amazon DocumentDB Storage Adapter
To connect to DocumentDB with `keyv`, you will need to ensure that your cluster is `tls` enabled.
>**Note** Amazon DocumentDB Clusters have `tls` enabled by default. See [AWS documentation](https://docs.aws.amazon.com/documentdb/latest/developerguide/connect_programmatically.html#connect_programmatically-determine_tls_value) for further information.


## Example Code

Download the public key for Amazon DocumentDB to encrypt the data in transit:
`wget https://s3.amazonaws.com/rds-downloads/rds-combined-ca-bundle.pem`

The following code shows how you would create an instance of Keyv that connects to a `tls-enabled` DocumentDB using `node.js`.

```js
const Keyv = require('keyv');

// Create a Keyv instance that uses Amazon DocumentDB for storage
// Add the AWS SSL CA certificate filepath to the keyv options:
const keyv = new Keyv('your-document-db-connection-string?tls=true', {
        tlsCAFile: "rds-combined-ca-bundle.pem",
      });

// Handle DB connection errors
keyv.on('error', err => console.log('Connection Error', err));
```

> **Note** Remember to include `tls=true` in the connection URL.
