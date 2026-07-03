# Verdant Finance — Backend Dockerfile
# Node.js 20 LTS on Alpine for a minimal, production-ready image.
# better-sqlite3 requires native compilation — we install build tools,
# compile, then keep them since this is a dev/demo container.

FROM node:20-alpine

# Install build tools required by better-sqlite3's native bindings
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy dependency manifests first to leverage Docker layer cache
COPY package*.json ./

# Install all dependencies (including native compilation for better-sqlite3)
RUN npm install

# Copy application source
COPY . .

# Create the data directory for the SQLite database file
RUN mkdir -p /app/data

EXPOSE 3000

# Start the Express server
CMD ["node", "src/index.js"]
