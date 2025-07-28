#!/bin/bash

architecture=$(uname -m)

if [[ "$architecture" == "arm"* || "$architecture" == "aarch64" ]]; then
  echo "Running on an ARM platform"
  # Call ARM-specific command
  docker compose -f ./scripts/docker-compose-arm64.yaml -f ./scripts/docker-compose-redis-cluster.yaml -f ./scripts/docker-compose-redis-sentinel.yaml --project-name keyv --parallel 1 up -d
else
  echo "Running on a non-ARM platform"
  # Call non-ARM command
  docker compose -f ./scripts/docker-compose.yaml -f ./scripts/docker-compose-redis-cluster.yaml -f ./scripts/docker-compose-redis-sentinel.yaml --project-name keyv --parallel 1 up -d
fi
