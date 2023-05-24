FROM node:14-alpine AS base

ENV ELASTICIO_OTEL_SERVICE_NAME=COMPONENT:REST

RUN apk --no-cache add \
    g++ \
    libc6-compat

WORKDIR /usr/src/app

COPY package.json /usr/src/app

RUN yarn install --production

COPY . /usr/src/app

RUN chown -R node:node .

USER node
ENTRYPOINT ["./start.sh"]