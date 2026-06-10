# Stage 1: Base image for dependencies
FROM node:22-slim AS base

# Use non-root user for subsequent instructions
RUN mkdir /app && chown node:node /app
WORKDIR /app

# Install dependencies with cache mount for speed
COPY --chown=node:node package*.json ./
COPY --chown=node:node .npmrc ./

USER node
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    npm ci

# Stage 2: Development (Angular dev server)
FROM base AS development
COPY --chown=node:node . .
# Angular's default port
EXPOSE 4200
CMD ["npm", "start", "--", "--host", "0.0.0.0"]

# Stage 3: Build artifacts
FROM base AS build
COPY --chown=node:node . .
RUN npm run build

# Stage 4: Production (Nginx)
FROM nginx:stable-alpine AS production
COPY --from=build /app/dist/wms-frontend/browser/ /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
