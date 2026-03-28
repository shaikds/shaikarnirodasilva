#!/bin/bash
echo "Waiting for database..."
sleep 3
cd /app/backend
npx prisma migrate deploy
echo "Database initialized!"
