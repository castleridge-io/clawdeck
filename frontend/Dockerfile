# Multi-stage build for ClawDeck Frontend
# Build context should be monorepo root
FROM node:20-alpine AS builder

WORKDIR /app

# Enable Corepack for Yarn 4 support
RUN corepack enable && corepack prepare yarn@4.9.1 --activate

# Copy workspace root files
COPY package.json yarn.lock .yarnrc.yml ./
COPY frontend/package.json ./frontend/

# Install all workspaces
RUN yarn install

# Copy frontend source
COPY frontend ./frontend

WORKDIR /app/frontend

# Build production bundle
RUN yarn build

# Production stage with nginx
FROM nginx:alpine

# Copy built files from builder
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Copy nginx config
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
