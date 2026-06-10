# Stage 1: Base image for dependencies
FROM node:22-slim AS base

# Use non-root user for subsequent instructions
RUN mkdir /app && chown node:node /app
WORKDIR /app

# Install dependencies with cache mount for speed
COPY --chown=node:node package*.json ./
USER node
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    npm ci

# Stage 2: Development (Vite dev server)
FROM base AS development
COPY --chown=node:node . .
# Vite's default port
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Stage 3: Build artifacts
FROM base AS build
COPY --chown=node:node . .
RUN npm run build

# Stage 4: Production (Nginx)
FROM nginx:stable-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
