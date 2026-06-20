# Stage 1: Build the Vite frontend
FROM node:20-slim AS builder

WORKDIR /usr/src/app

# Copy package files and install all dependencies (including dev)
COPY package*.json ./
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build the frontend assets into dist/
RUN npm run build

# Stage 2: Production runtime
FROM node:20-slim

WORKDIR /usr/src/app

# Copy only what we need from the builder stage
COPY --from=builder /usr/src/app/package*.json ./

# Install only production dependencies (much smaller image)
RUN npm ci --omit=dev

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/server.ts ./server.ts

# Create data directory for persistence
RUN mkdir -p data

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=7860
ENV NODE_OPTIONS="--max-old-space-size=400 --expose-gc"

# Default port for hosting platforms (Hugging Face Spaces uses 7860)
EXPOSE 7860

# Start the Express server using tsx
CMD ["npm", "start"]
