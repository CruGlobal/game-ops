#!/bin/bash

owner=$1
repo=$2
username=$3

GITHUB_TOKEN="${GITHUB_TOKEN:-}"

if [[ -z "$GITHUB_TOKEN" ]]; then
  echo "Error: GITHUB_TOKEN environment variable not set."
  exit 1
fi

count=0
page=1
per_page=100
url="https://api.github.com/repos/$owner/$repo/pulls?state=all&per_page=$per_page&page=$page"

while [[ ! -z "$url" ]]; do
  response=$(curl -s -H "Authorization: token $GITHUB_TOKEN" "$url")
  echo "Response: $response"

  # Extract PRs by the specified author
  pr_count=$(echo "$response" | jq -r --arg username "$username" '[.[] | select(.user.login == $username)] | length' 2>/dev/null)
  if [[ -z "$pr_count" || "$pr_count" == "null" ]]; then
    pr_count=0
  fi
  count=$((count + pr_count))

  # Check if there are more pages
  if [[ $(echo "$response" | jq 'length') -lt $per_page ]]; then
    url=""
  else
    page=$((page + 1))
    url="https://api.github.com/repos/$owner/$repo/pulls?state=all&per_page=$per_page&page=$page"
  fi
  echo "Next URL: $url"
done

echo "Total PRs by $username: $count"