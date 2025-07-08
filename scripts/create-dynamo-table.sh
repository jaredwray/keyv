#!/bin/bash

export AWS_ACCESS_KEY_ID=dummyAccessKeyId
export AWS_SECRET_ACCESS_KEY=dummySecretAccessKey
export AWS_REGION=local

# Set local DynamoDB endpoint
ENDPOINT_URL="http://localhost:8000"

# Wait for DynamoDB to be ready
echo "Waiting for DynamoDB to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0
aws dynamodb list-tables --endpoint-url $ENDPOINT_URL
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if aws dynamodb list-tables --endpoint-url $ENDPOINT_URL > /dev/null 2>&1; then
        echo "DynamoDB is ready!"
        break
    else
        echo "DynamoDB not ready yet, retrying in 2 seconds... ($((RETRY_COUNT + 1))/$MAX_RETRIES)"
        sleep 2
        RETRY_COUNT=$((RETRY_COUNT + 1))
    fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "Error: DynamoDB failed to start after $MAX_RETRIES attempts"
    exit 1
fi

# Create table
aws dynamodb create-table \
  --endpoint-url $ENDPOINT_URL \
  --table-name keyv \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Enable ttl
aws dynamodb update-time-to-live \
  --endpoint-url $ENDPOINT_URL \
  --table-name keyv \
  --time-to-live-specification "Enabled=true, AttributeName=expiresAt"

# Ensure ttl is enabled
aws dynamodb describe-time-to-live \
  --endpoint-url $ENDPOINT_URL \
  --table-name keyv