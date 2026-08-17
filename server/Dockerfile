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

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy all server files
COPY . .

# Expose the API port
EXPOSE 3001

# Start the Express server
CMD ["node", "server.js"]
