#!/bin/bash

architecture=$(uname -m)

if [[ "$architecture" == "arm"* || "$architecture" == "aarch64" ]]; then
  echo "Running on an ARM platform"
  # Call ARM-specific command
  docker compose -f ./docker-compose-arm64.yaml down -v
else
  echo "Running on a non-ARM platform"
  # Call non-ARM command
  docker compose -f ./docker-compose.yaml down -v
fi
