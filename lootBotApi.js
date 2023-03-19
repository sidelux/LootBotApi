var fs = require('fs');
var http = require('http');
var https = require('https');
var privateKey  = fs.readFileSync('/etc/ssl/fenixweb/fenixweb.key', 'utf8');
var certificate = fs.readFileSync('/etc/ssl/fenixweb/fenixweb_nginx.crt', 'utf8');
var credentials = {key: privateKey, cert: certificate};

var express = require('express');
var subdomain = require('express-subdomain');
var api = require('./api');

var app = express();
var port = 3300;

 app.use(function(req, res, next) {
   res.header("Access-Control-Allow-Origin", "*");
   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
   next();
 });

app.use('/api', api);

var httpServer = http.createServer(app);
var httpsServer = https.createServer(credentials, app);

httpServer.listen(3300);
httpsServer.listen(6600);