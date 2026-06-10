# Stage 1: Base image
FROM node:22-slim AS base

# Use non-root user
RUN mkdir /app && chown node:node /app
WORKDIR /app

# Stage 2: Dependencies
COPY --chown=node:node package*.json ./
COPY --chown=node:node .npmrc ./

USER node

# Install dependencies with cache mount
# We use npm install instead of npm ci to allow for automatic resolution of native bindings 
# across different platforms (especially when the lockfile might be out of sync)
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    npm install

# Stage 3: Development
FROM base AS development
ENV NODE_ENV=development
COPY --chown=node:node . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Stage 4: Build
FROM base AS build
ENV NODE_ENV=production
COPY --chown=node:node . .
RUN npm run build

# Stage 5: Production
FROM node:22-slim AS production
WORKDIR /app
ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000

# Copy built output and dependencies
COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=base --chown=node:node /app/node_modules ./node_modules

EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "fetch('http://localhost:3000').then(r => r.ok ? process.exit(0) : process.exit(1))" || exit 1
CMD ["node", ".output/server/index.mjs"]
