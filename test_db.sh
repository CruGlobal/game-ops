#!/bin/bash
docker run --name postgres-test-db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=game_ops_test -p 5433:5432 -d postgres:15-alpine
