FROM node:12-alpine AS base
RUN apk --no-cache add \
    python3 \
    make \
    g++ \
    libc6-compat

WORKDIR /usr/src/app

COPY package.json /usr/src/app

RUN yarn install --production

COPY . /usr/src/app

RUN chown -R node:node .

USER node
ENTRYPOINT ["./start.sh"]