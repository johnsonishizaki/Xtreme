# Production Multi-Stage / Cloud Run Dockerfile for Xtreme Attendance & Duty Backend
FROM node:22-alpine

# Set working directory inside container
WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json* ./

# Install production and build dependencies
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# Copy application source files
COPY . .

# Build the Vite static frontend bundle (outputs to /app/dist)
RUN npm run build

# Configure production environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose port 8080 for Cloud Run HTTP traffic
EXPOSE 8080

# Start Express server via npm start ("tsx server.ts")
CMD ["npm", "start"]
