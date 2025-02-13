FROM node:23-alpine
WORKDIR /app
COPY app/package*.json ./
# install node modules
RUN npm install
COPY app ./
EXPOSE 3000

# Run the web service on container startup
CMD ["npm", "start"]
#CMD [ "node", "github-pr-scoreboard.js" ]
