# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Route modules validate env at import time during `next build` page-data
# collection (e.g. src/lib/mongodb.ts throws without MONGODB_URI). Dummy
# build-only values; this stage is discarded and the runner gets none.
ENV MONGODB_URI=mongodb://build-placeholder:27017/mentorher \
    GROQ_API_KEY=build-placeholder \
    JWT_SECRET=build-placeholder
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev
COPY --chown=node:node --from=build /app/.next ./.next
COPY --chown=node:node --from=build /app/public ./public
COPY --chown=node:node --from=build /app/next.config.ts ./next.config.ts
COPY --chown=node:node --from=build /app/tsconfig.json ./tsconfig.json
COPY --chown=node:node --from=build /app/src ./src
COPY --chown=node:node --from=build /app/worker ./worker
USER node
EXPOSE 3001
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3001"]
