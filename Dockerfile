FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
COPY style.css /usr/share/nginx/html/style.css
COPY script.js /usr/share/nginx/html/script.js
COPY mobile-flow.js /usr/share/nginx/html/mobile-flow.js
COPY smart-dashboard.js /usr/share/nginx/html/smart-dashboard.js
EXPOSE 80
