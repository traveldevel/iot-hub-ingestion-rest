"use strict";

// required modules
var express = require('express');
var bodyParser = require('body-parser');
var cfenv = require("cfenv");
var path = require('path');

// configs from env vars
var appEnv = cfenv.getAppEnv();

if(!appEnv.isLocal){
    console.log("appEnv.isLocal=", appEnv.isLocal);
}

var landscapeName = process.env.landscapeName;
var tenantName = process.env.tenantName;

// new express app
var app = express();

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({
    extended: true
}));

// parse application/json
app.use(bodyParser.json());

// swagger ui for api is static resource
app.use('/swagger', express.static(path.join(__dirname, 'swagger')));

// ingest respond back
app.get('/ingest/:deviceId', function (req, res) {
    res.send(req.params);
});

// app listen
app.listen(8080, function () {
    console.log('App listening on http://' + process.env.IP + ':' + process.env.PORT);
});