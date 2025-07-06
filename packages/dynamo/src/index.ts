import EventEmitter from 'events';
import {
  DescribeTableCommand,
  DynamoDB,
  DynamoDBClientConfig,
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

    this.checkTableExists(this.opts.tableName).catch((error: unknown) => {
      this.emit('error', error);
    });
  }

  async checkTableExists(tableName: string): Promise<void> {
    await this.client.send(new DescribeTableCommand({TableName: tableName}));
  }

  async set(key: string, value: unknown, ttl?: number) {
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
}

export default KeyvDynamo;
export type KeyvDynamoOptions = {
  namespace?: string;
  dialect?: string;
  tableName?: string;
} & DynamoDBClientConfig;
