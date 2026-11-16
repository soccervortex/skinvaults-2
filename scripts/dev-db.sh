#!/bin/sh
# Starts a throwaway local PostgreSQL 17 (same major version as the Nebula template) on 127.0.0.1:55432.
# The password is random and printed once so you can put the URL in .env.
set -e
PW=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)
docker run -d --name skinvaults2-dev-pg -e POSTGRES_PASSWORD="$PW" -e POSTGRES_DB=skinvaults2 \
  -p 127.0.0.1:55432:5432 -v skinvaults2-dev-pg:/var/lib/postgresql/data postgres:17 >/dev/null
echo "DATABASE_URL=postgresql://postgres:$PW@127.0.0.1:55432/skinvaults2"
