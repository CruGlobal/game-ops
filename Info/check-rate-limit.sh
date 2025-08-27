#!/bin/bash

CHECK_LIMIT_URL="https://api.github.com/rate_limit"

# Set your GitHub token as an environment variable: export GITHUB_TOKEN=your_token_here
if [ -z "$GITHUB_TOKEN" ]; then
    echo "Error: GITHUB_TOKEN environment variable is not set"
    echo "Usage: export GITHUB_TOKEN=your_token && $0"
    exit 1
fi

curl -H "Authorization: token $GITHUB_TOKEN" -X GET $CHECK_LIMIT_URL
