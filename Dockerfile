FROM node:16

WORKDIR /usr/src/app
COPY package*.json ./

COPY package.json .
COPY tsconfig.json .

RUN npm install
RUN npm run build

COPY . .

CMD [ "node", "lib/index.js" ]
