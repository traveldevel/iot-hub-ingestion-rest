"use strict";

// Load env vars from .env
require('dotenv').config();

// required modules
const express = require('express');
const bodyParser = require('body-parser');
const cfenv = require("cfenv");
const path = require('path');
const basicAuth = require('basic-auth');

// Kafka configuration
const kafka = require('kafka-node');
const Producer = kafka.Producer;
const KeyedMessage = kafka.KeyedMessage;

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

    var message = {
        "device_id" : deviceId,
        "receive_time": new Date(),
        "values" : values
    };

    // write to kafka <lansdcape_name>-<tenant_name>-raw-data
    var client = new kafka.Client(kafkaHost + ":" + kafkaPort);
    //var client = new kafka.KafkaClient(kafkaHost);
    
    var producer = new Producer(client, { requireAcks: 1 });
    
    var kMessage = new KeyedMessage(deviceId, JSON.stringify(message));

    var payloads = [
        { 
            topic: process.env.KAFKA_TOPIC_PREFIX + landscapeName + "-" + tenantName + "-raw-data",
            messages: kMessage, 
            partition: 0 
        }
    ];

    producer.on('ready', function () {
        producer.send(payloads, function (err, data) {
            console.log(data);
            res.end("OK : ", JSON.stringify(data));
        });    
    });

    producer.on('error', function (err) {
        res.end("Error : ", JSON.stringify(err));
    });
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
    res.end("Pong");
});

// app listen
app.listen(port, function () {
    console.log('REST API listening on ' + appEnv.url + ':' + process.env.PORT);
});
