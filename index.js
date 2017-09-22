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
const kafka = require('kafka-node');

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

var Client = kafka.Client;
var Producer = kafka.Producer;

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

function getZookeeperFromEnv(){

    var host = process.env.ZOOKEEPER_HOST + ':' + process.env.ZOOKEEPER_PORT;

    //console.log("zookeeper hosts : ", host);

    return host;
}

// handle POST / PUT for saving data
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
    //console.log("To send : ", topicName, sKey, sMessage);

    // write to kafka <lansdcape_name>-<tenant_name>-raw-data
    var client = new Client(getZookeeperFromEnv());

    var producer = new Producer(client);

    producer.on('ready', function() {
        
        //console.log('kafka producer ready...');

        var KeyedMessage = kafka.KeyedMessage;

        var keyedMessage = new KeyedMessage(deviceId, sMessage);
        
        producer.send([
            { 
                topic: topicName, 
                messages: [keyedMessage]
            }
        ], 
        function (err, result) {
            
            if(err){
                keyedMessage.status = err;
                console.log('Send err : ', err); 
            }

            if(result[topicName]){
                keyedMessage.status = 'OK';
                console.log('Sent OK :', keyedMessage); 
            }

            res.json(keyedMessage);    
            res.end();

            producer.close();
            client.close();
        });
    });
       
    producer.on('error', function (err) {

        console.log('kafka error : ', err);
        res.json(err);
        res.end();

        producer.close();
        client.close();        
    });
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
