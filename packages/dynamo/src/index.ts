import EventEmitter from 'events';
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDB,
  DynamoDBClientConfig,
  ResourceNotFoundException,
  ResourceInUseException,
  UpdateTimeToLiveCommand,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommandInput,
  BatchWriteCommandInput,
  DeleteCommandInput,
  DynamoDBDocument,
  GetCommandInput,
  PutCommandInput,
  ScanCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import {KeyvStoreAdapter, type StoredData} from 'keyv';

export class KeyvDynamo extends EventEmitter implements KeyvStoreAdapter {
  ttlSupport = true;
  sixHoursInMilliseconds = 6 * 60 * 60 * 1000;
  namespace?: string;
  opts: Omit<KeyvDynamoOptions, 'tableName'> & {tableName: string};
  private readonly client: DynamoDBDocument;
  private readonly tableReady: Promise<void>;

  constructor(options: KeyvDynamoOptions | string) {
    super();
    options ??= {};
    if (typeof options === 'string') {
      options = {endpoint: options};
    }

    this.opts = {
      tableName: 'keyv',
      dialect: 'dynamo',
      ...options,
    };

    this.client = DynamoDBDocument.from(new DynamoDB(this.opts));

    this.tableReady = this.ensureTable(this.opts.tableName).catch((error: unknown) => {
      this.emit('error', error);
    });
  }

  async set(key: string, value: unknown, ttl?: number) {
    await this.tableReady;

    const sixHoursFromNowEpoch = Math.floor((Date.now() + this.sixHoursInMilliseconds) / 1000);

    const expiresAt
      = typeof ttl === 'number'
        ? Math.floor((Date.now() + (ttl + 1000)) / 1000)
        : sixHoursFromNowEpoch;

    const putInput: PutCommandInput = {
      TableName: this.opts.tableName,
      Item: {
        id: key,
        value,
        expiresAt,
      },
    };

    await this.client.put(putInput);
  }

  async get<Value>(key: string): Promise<StoredData<Value>> {
    await this.tableReady;

    const getInput: GetCommandInput = {
      TableName: this.opts.tableName,
      Key: {
        id: key,
      },
    };
    const {Item} = await this.client.get(getInput);
    return Item?.value as StoredData<Value>;
  }

  async delete(key: string) {
    await this.tableReady;

    const deleteInput: DeleteCommandInput = {
      TableName: this.opts.tableName,
      Key: {
        id: key,
      },
      ReturnValues: 'ALL_OLD',
    };

    const {Attributes} = await this.client.delete(deleteInput);
    return Boolean(Attributes);
  }

  async getMany<Value>(keys: string[]): Promise<Array<StoredData<Value | undefined>>> {
    await this.tableReady;

    const batchGetInput: BatchGetCommandInput = {
      RequestItems: {
        [this.opts.tableName]: {
          Keys: keys.map(key => ({
            id: key,
          })),
        },
      },
    };
    const {Responses: {[this.opts.tableName]: items = []} = {}}
      = await this.client.batchGet(batchGetInput);

    return keys.map(key =>
      items.find(item => item?.id === key)?.value as StoredData<Value>);
  }

  async deleteMany(keys: string[]) {
    await this.tableReady;

    if (keys.length === 0) {
      return false;
    }

    const items = await this.getMany(keys);

    if (items.filter(Boolean).length === 0) {
      return false;
    }

    const batchDeleteInput: BatchWriteCommandInput = {
      RequestItems: {
        [this.opts.tableName]: keys.map(key => ({
          DeleteRequest: {
            TableName: this.opts.tableName,
            Key: {
              id: key,
            },
          },
        })),
      },
    };

    const response = await this.client.batchWrite(batchDeleteInput);
    return Boolean(response);
  }

  async clear() {
    await this.tableReady;

    const scanResult = await this.client.scan({
      TableName: this.opts.tableName,
    });

    const keys = this.extractKey(scanResult);

    await this.deleteMany(keys);
  }

  private extractKey(output: ScanCommandOutput, keyProperty = 'id'): string[] {
    return (output.Items ?? [])
      .map(item => item[keyProperty])
      .filter(key => key.startsWith(this.namespace ?? ''));
  }

  private async ensureTable(tableName: string): Promise<void> {
    try {
      await this.client.send(new DescribeTableCommand({TableName: tableName}));
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        await this.createTable(tableName);
      } else {
        throw error;
      }
    }
  }

  private async createTable(tableName: string): Promise<void> {
    try {
      await this.client.send(new CreateTableCommand({
        TableName: tableName,
        KeySchema: [{AttributeName: 'id', KeyType: 'HASH'}],
        AttributeDefinitions: [{AttributeName: 'id', AttributeType: 'S'}],
        BillingMode: 'PAY_PER_REQUEST',
      }));

      await waitUntilTableExists(
        {client: this.client, maxWaitTime: 60},
        {TableName: tableName},
      );

      await this.client.send(new UpdateTimeToLiveCommand({
        TableName: tableName,
        TimeToLiveSpecification: {
          AttributeName: 'expiresAt',
          Enabled: true,
        },
      }));
    } catch (error) {
      if (error instanceof ResourceInUseException) {
        await waitUntilTableExists(
          {client: this.client, maxWaitTime: 60},
          {TableName: tableName},
        );
      } else {
        throw error;
      }
    }
  }
}

export default KeyvDynamo;
export type KeyvDynamoOptions = {
  namespace?: string;
  dialect?: string;
  tableName?: string;
} & DynamoDBClientConfig;
