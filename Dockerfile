FROM node:lts-alpine
WORKDIR /repo
RUN yarn install
RUN yarn build
CMD yarn test