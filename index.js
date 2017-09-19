"use strict";

// Load env vars from .env
require('dotenv').config();

// required modules
const express = require('express');
const bodyParser = require('body-parser');
const cfenv = require("cfenv");
const path = require('path');
const basicAuth = require('basic-auth');
const fs = require('fs');

// Kafka configuration
const kafka = require('node-rdkafka');
console.log("version : ", kafka.librdkafkaVersion);
console.log("features : ", kafka.features);

// configs from env vars
var appEnv = cfenv.getAppEnv();
//console.log(appEnv.getServices());

if(!appEnv.isLocal){
    console.log("appEnv.isLocal=", appEnv.isLocal);
}

const port = process.env.PORT || 8080;
var landscapeName = process.env.LANDSCAPE_NAME;
var tenantName = process.env.TENANT_NAME;

var tenantNameMongoName = tenantName + "_raw_data";

const authorizedUsers = process.env.BASIC_AUTH_USERS.split(',');
const authorizedUserPasswords = process.env.BASIC_AUTH_USER_PASSWORDS.split(',');

fs.writeFileSync("/tmp/kafka.ca", process.env.CLOUDKARAFKA_CA); 
fs.writeFileSync("/tmp/kafka.crt", process.env.CLOUDKARAFKA_CERT);
fs.writeFileSync("/tmp/kafka.key", process.env.CLOUDKARAFKA_PRIVATE_KEY);

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

function getKafkaHostsFromEnv(){

    var hosts = process.env.KAFKA_HOST1 + ':' + process.env.KAFKA_PORT1;
    
    if(process.env.KAFKA_HOST2 !== undefined && process.env.KAFKA_PORT2 != undefined){
        hosts += ',' + process.env.KAFKA_HOST2 + ':' + process.env.KAFKA_PORT2;
    }
    
    if(process.env.KAFKA_HOST3 !== undefined && process.env.KAFKA_PORT3 != undefined){
        hosts += ',' + process.env.KAFKA_HOST3 + ':' + process.env.KAFKA_PORT3;
    }

    console.log("kafka hosts : ", hosts);

    return hosts;
}

// handle POST / PUT / GET for saving data
var fnSaveDataFor = function(req, res){

    var deviceId = req.params.deviceId;
    var values = req.body;

    var message = {
        "device_id" : deviceId,
        "receive_time": new Date(),
        "values" : values
    };

    // data to be written
    var topicName = process.env.KAFKA_TOPIC_PREFIX + landscapeName + "-" + tenantName + "-raw-data";
    var sKey = deviceId;
    var sMessage = JSON.stringify(message);
    var partition = -1;
    console.log("To send : ", topicName, partition, sKey, sMessage);

    // write to kafka <lansdcape_name>-<tenant_name>-raw-data
    var producer = new kafka.Producer({
        'metadata.broker.list' : getKafkaHostsFromEnv(),
        'dr_cb' : true,
        'debug' : 'all',
        'ssl.ca.location' : '/tmp/kafka.ca',
        'ssl.certificate.location' : '/tmp/kafka.crt',
        'ssl.key.location' : '/tmp/kafka.key',
        'security.protocol' : 'ssl'
    });

    producer.on('ready', function() {
        try {
            producer.produce(
                topicName,
                null,
                Message,
                deviceId
            );
        } catch (err) {
            console.error('A problem occurred when sending kafka message...');
            console.error(err);
            res.write(JSON.stringify(err));
        }

        producer.disconnect();

        res.end("OK");
    });
       
    // Any errors we encounter, including connection errors
    producer.on('event.error', function(err) {
        console.error('Error from producer...');
        console.error(err);
        res.write(JSON.stringify(err));
    });

    producer.on('event.log', function(log) {
        console.log(log);
        res.write(JSON.stringify(log));
    });

    producer.on('delivery-report', function(err, report) {
        console.log('delivery-report: ' + JSON.stringify(report));
        res.write(JSON.stringify(report));
    });

    producer.on('disconnected', function(arg) {
        console.log('producer disconnected. ' + JSON.stringify(arg));
    });

    // connect after all events are defined
    producer.connect();
};  

// new express app
var app = express();

const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('swagger.yml');
 
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({
    extended: true
}));

// parse application/json
app.use(bodyParser.json());

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
    console.log('REST API listening on ' + appEnv.url + ':' + port);
});
