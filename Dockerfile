# Use a lightweight Node.js 20 image
FROM node:20-slim

# Install system dependencies (ffmpeg, python3, pip)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp via pip (this ensures we have the latest Linux version)
RUN pip3 install yt-dlp --break-system-packages

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
