# Verdant Finance — Backend Dockerfile
# Node.js 20 LTS on Debian Slim for stable, reliable native better-sqlite3 compilation.

FROM node:20-slim

# Install build tools required by better-sqlite3's native bindings
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests first to leverage Docker cache
COPY package*.json ./

# Install all dependencies (including native compilation)
RUN npm install

# Copy application source
COPY . .

# Create the data directory for the SQLite database file
RUN mkdir -p /app/data

EXPOSE 3000

# Start the Express server
CMD ["node", "src/index.js"]
