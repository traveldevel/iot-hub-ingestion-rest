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

var tenantNameMongoName = tenantName + "_raw_data";

// mongo connect and create missing collections
var mongoServiceName = "mongo_" + landscapeName;
var mongoService = appEnv.getService(mongoServiceName);
var mongoCredentials = appEnv.getServiceCreds(mongoServiceName);
var mongoUrl = mongoCredentials.uri;
var mongoClient = require('mongodb').MongoClient;
var mongoCA = [new Buffer(mongoCredentials.ca_certificate_base64, 'base64')];

var colections = [];

console.log(mongoServiceName + " found in VCAP_SERVICES : ")
console.log(mongoService);

mongoClient.connect(mongoUrl, {
    mongos: {
        ssl: true,
        sslValidate: true,
        sslCA: mongoCA,
        poolSize: 10,
        reconnectTries: 5
    }
},
function(err, mongoDb) {
    
    console.log("Connected to mongo...");

    colections = mongoDb.collections();
    
    var exists = false;
    if(collections !== undefined && collections.length > 0){
        collections.map(c => c.s.name).includes(tenantNameMongoName);
    }

    if (!exists) {
        mongoDb.createCollection(tenantNameMongoName, function(err, res) {
            
            if (err) {
                console.log(err);
            }

            console.log("Collection '" + tenantNameMongoName + "' created!");
            colections = mongoDb.collections();
            mongoDb.close();
        });
    }
});

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

// ingest respond back
app.get('/', function (req, res) {

    mongoClient.connect(mongoUrl, function(err, mongoDb) {
        
        console.log("Connected to mongo");
       
        var collections = mongoDb.collections();
        mongoDb.close();

        res.send(collections);
    });
});

// app listen
app.listen(8080, function () {
    console.log('REST API listening on ' + appEnv.url + ':' + process.env.PORT);
});
