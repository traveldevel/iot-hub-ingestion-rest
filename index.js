"use strict";

// Load env vars from .env
require('dotenv').config();

// required modules
var express = require('express');
var bodyParser = require('body-parser');
var cfenv = require("cfenv");
var path = require('path');
const basicAuth = require('basic-auth');

// configs from env vars
var appEnv = cfenv.getAppEnv();
//console.log(appEnv.getServices());

if(!appEnv.isLocal){
    console.log("appEnv.isLocal=", appEnv.isLocal);
}

const port = process.env.PORT || 8080;
var landscapeName = process.env.LANDSCAPE_NAME;
var tenantName = process.env.TENANT_NAME;
var kafkaHost = process.env.KAFKA_HOST;
var kafkaPort = process.env.KAFKA_PORT;

var tenantNameMongoName = tenantName + "_raw_data";

// mongo connect and create missing collections
var mongoServiceName = "iot_hub_mongo_" + landscapeName;
var mongoService = appEnv.getService(mongoServiceName);
var mongoCredentials = appEnv.getServiceCreds(mongoServiceName);
var mongoUrl = mongoCredentials.uri;
var mongoClient = require('mongodb').MongoClient;

console.log(mongoServiceName + " found in VCAP_SERVICES");
console.log(mongoService.credentials);

var mongoDbName = '';
var mongoUrl = '';

if(mongoService !== undefined){

    mongoUrl = mongoService.credentials.uri + "?ssl=false";

    var mongodbUri = require('mongodb-uri');
    var uriObject = mongodbUri.parse(mongoUrl);
    mongoDbName = uriObject.database;
}

console.log("Mongo url : ", mongoUrl);
console.log("Mongo db : ", mongoDbName);

mongoClient.connect(mongoUrl, function(err, mongoDb) {
    
    console.log("Connected to mongo...");

    var cPromise = mongoDb.collections();
    cPromise.then(function(collections){
        var colNames = collections.map(c => c.s.name);
        console.log("Collections : ", colNames);
    });
});

const authorizedUsers = process.env.BASIC_AUTH_USERS.split(',');
const authorizedUserPasswords = process.env.BASIC_AUTH_USER_PASSWORDS.split(',');

// auth global function
const auth = function (req, res, next) {
    function unauthorized(res) {
        res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
        return res.sendStatus(401);
    };

    var user = basicAuth(req);

    if (!user || !user.name || !user.pass) {
        return unauthorized(res);
    };

    if (authorizedUsers.indexOf(user.name) >= 0 && authorizedUserPasswords.indexOf(user.pass) >= 0) {
        return next();
    } else {
        return unauthorized(res);
    };
};

// handle POST / PUT / GET for saving data
var fnSaveDataFor = function(req, res){

    var deviceId = req.params.deviceId;
    var values = req.body;

    var all = {
        "device_id" : deviceId,
        "receive_time": new Date(),
        "values" : values
    };

    // write to kafka <tenant_name>_raw_data
    // TO DO

    res.json(all);
};  

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

// ingest data GET
app.get('/save/data/for/:deviceId', auth, fnSaveDataFor);

// ingest data POST
app.post('/save/data/for/:deviceId', auth, fnSaveDataFor);

// ingest data PUT
app.put('/save/data/for/:deviceId', auth, fnSaveDataFor);

// respond with collections on GET /
app.get('/', auth, function (req, res) {

    mongoClient.connect(mongoUrl, function(err, mongoDb) {
        
        console.log("Connected to mongo");
       
        mongoDb.collections().then(function(cols){
            
            var cols = cols.map(col => col.s.name);
            console.log("Collections at start :", cols);

            mongoDb.close();

            res.send(cols);
        });
    });
});

// app listen
app.listen(port, function () {
    console.log('REST API listening on ' + appEnv.url + ':' + process.env.PORT);
});
