FROM node:16

WORKDIR /usr/src/app
COPY package*.json ./

RUN npm install --production
RUN npm run build

COPY . .

CMD [ "node", "lib/index.js" ]
