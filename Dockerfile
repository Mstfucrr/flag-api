# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# .env.example below defaults NODE_ENV=development for local dev; a real env
# var set here always wins over the baked .env, so this keeps prod behavior
# (e.g. dev-only seed data) off unless someone deliberately overrides it.
ENV NODE_ENV=production

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
# --ignore-scripts: "prepare" (husky) is a devDependency-only concern and
# there's no .git in this stage's context anyway.
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY .env.example .env

EXPOSE 3001

CMD ["pnpm", "run", "start:prod"]
