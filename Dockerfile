# Use a lightweight Node.js 20 image
FROM node:20-slim

# Install system dependencies (ffmpeg, python3, pip, curl, unzip)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Deno (yt-dlp's default supported JS runtime for YouTube signature solving)
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

# Install latest master build of yt-dlp with latest anti-bot fixes
RUN pip3 install --upgrade --no-cache-dir https://github.com/yt-dlp/yt-dlp/archive/master.tar.gz --break-system-packages

# Set working directory
WORKDIR /app

# ---- Build Frontend ----
COPY client/package*.json ./client/
RUN cd client && npm install

COPY client/ ./client/
RUN cd client && npm run build

# ---- Setup Backend ----
COPY server/package*.json ./server/
RUN cd server && npm install

COPY server/ ./server/

# Expose the API port
EXPOSE 3001

# Start the Express server
CMD ["node", "server/server.js"]
