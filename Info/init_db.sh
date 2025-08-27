#!/bin/bash

# URL to get the token
LOGIN_URL="http://localhost:3000/api/admin/login"
# URL to initialize the database
INIT_DB_URL="http://localhost:3000/api/initialize-database"

# Credentials for login
USERNAME="admin"
PASSWORD="admin"

# Get the token
TOKEN=$(curl -s -X POST $LOGIN_URL -H "Content-Type: application/json" -d "{\"username\": \"$USERNAME\", \"password\": \"$PASSWORD\"}" | jq -r '.token')

# Check if the token is not empty
if [ -z "$TOKEN" ]; then
  echo "Failed to get the token."
  exit 1
fi

# Perform the curl command with progress bar to initialize the database
curl -# -X GET $INIT_DB_URL -H "Authorization: Bearer $TOKEN" -o /dev/null

echo "Database initialization complete."