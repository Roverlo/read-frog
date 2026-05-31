FROM node:24-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

COPY apps/learning-daemon ./apps/learning-daemon
COPY src/utils/learning-contracts ./src/utils/learning-contracts

ENV READFROG_LEARNING_HOST=0.0.0.0
ENV READFROG_LEARNING_PORT=7457
ENV READFROG_LEARNING_DATA_DIR=/data

EXPOSE 7457

CMD ["node", "--experimental-strip-types", "apps/learning-daemon/src/cli.ts"]
