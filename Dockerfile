FROM node:lts-alpine
WORKDIR /repo
CMD yarn install && \
    yarn build && \
    yarn test