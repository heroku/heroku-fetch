#!/bin/bash

if [ -z "$1" ]; then
  echo "Usage: ./run.sh <command> [args...]"
  echo ""
  echo "Available commands:"
  echo "  login        - Log in with your Heroku credentials"
  echo "  logout       - Clear local authentication credentials"
  echo "  apps-list    - List apps"
  echo "  apps-info    - Get app info (requires --app flag)"
  echo "  apps-create  - Create an app"
  echo "  logs         - Stream logs (requires --app flag)"
  echo "  pg-info      - Get PostgreSQL database info (requires --app flag)"
  echo ""
  echo "Examples:"
  echo "  ./run.sh login"
  echo "  ./run.sh login --browser"
  echo "  ./run.sh logout"
  echo "  ./run.sh apps-list"
  echo "  ./run.sh apps-list --json"
  echo "  ./run.sh apps-info --app my-app"
  exit 1
fi

COMMAND=$1
shift

if [ ! -f "examples/oclif/$COMMAND.ts" ]; then
  echo "Command '$COMMAND' not found in examples/oclif directory"
  exit 1
fi

NODE_NO_WARNINGS=1 npx tsx "examples/oclif/$COMMAND.ts" "$@"
