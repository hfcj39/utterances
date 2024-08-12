FROM node:14

WORKDIR /app

RUN apt-get update && apt-get install -y nginx supervisor

COPY package*.json ./

RUN npm install

COPY . .
RUN ls
RUN npm run build

RUN cp -r /app/dist/* /var/www/html/

COPY deploy/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80 7000

COPY deploy/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

CMD ["/usr/bin/supervisord"]
