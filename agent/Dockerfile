FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY templates ./templates

# Create a non-root user for the agent
RUN groupadd -r evo && useradd -r -g evo -m evo

# Workspace is mounted as a volume at runtime
RUN mkdir -p /workspace && chown evo:evo /workspace

ENV EVO_WORKSPACE=/workspace
ENV NODE_ENV=production

USER evo

ENTRYPOINT ["npx", "tsx", "src/index.ts"]
