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

var zookeeperHost = getZookeeperFromEnv();

// handle POST / PUT for saving data
var fnSaveDataFor = function(req, res){

    var deviceId = req.params.deviceId;
    var values = req.body;

    var message = {
        "device_id" : deviceId,
        "receive_time": new Date().toISOString(),
        "values" : values
    };

    // data to be written
    var sKey = deviceId;
    var sMessage = JSON.stringify(message);
    //console.log("To send : ", sKey, sMessage);

    // write to kafka <landscape_name>-<tenant_name>-raw-data
    var saveToKafkaRawData = function(req, res)
    {
        var topicName = process.env.KAFKA_TOPIC_PREFIX + landscapeName + "-" + tenantName + "-raw-data";

        var client = new Client(zookeeperHost);

        var producer = new Producer(client);

        producer.on('ready', function() {
            
            //console.log('kafka producer ready...');

            var KeyedMessage = kafka.KeyedMessage;

            var keyedMessage = new KeyedMessage(deviceId, sMessage);
            
            // send to raw data
            producer.send([
                { 
                    topic: topicName, 
                    messages: [keyedMessage]
                }
            ], 
            function (err, result) {
                
                if(err){
                    keyedMessage.status = err;
                    console.log('Send for raw data err : ', err); 
                }

                if(result[topicName]){
                    keyedMessage.status = 'OK';
                    //console.log('Sent for raw data OK :', keyedMessage); 
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
    }

    // write to kafka <landscape_name>-<tenant_name>-for-event-rules
    var saveToKafkaEvent = function(req, res)
    {
        var clientEvent = new Client(zookeeperHost);
        
        var producerEvent = new Producer(clientEvent);

        producerEvent.on('ready', function() {
            
            //console.log('kafka producer ready...');

            var topicNameEvent = process.env.KAFKA_TOPIC_PREFIX + landscapeName + "-" + tenantName + "-for-event-rules";

            var KeyedMessage = kafka.KeyedMessage;

            var keyedMessage = new KeyedMessage(deviceId, sMessage);
            
            // send to raw data
            producerEvent.send([
                { 
                    topic: topicNameEvent, 
                    messages: [keyedMessage]
                }
            ], 
            function (err, result) {
                
                if(err){
                    keyedMessage.status = err;
                    console.log('Send for raw data err : ', err); 
                }

                if(result[topicNameEvent]){
                    //console.log('Sent for raw data OK :', keyedMessage); 
                }

                producerEvent.close();
                clientEvent.close();
            });

        });
            
        producerEvent.on('error', function (err) {

            console.log('kafka error : ', err);

            producerEvent.close();
            clientEvent.close();        
        });
    }

    // write to kafka <landscape_name>-<tenant_name>-for-coldstore-history
    var saveToKafkaColdstore = function(req, res)    
    {
        var clientColdstore= new Client(zookeeperHost);
        
        var producerColdstore = new Producer(clientColdstore);

        producerColdstore.on('ready', function() {
            
            //console.log('kafka producer ready...');

            var topicNameColdstore = process.env.KAFKA_TOPIC_PREFIX + landscapeName + "-" + tenantName + "-for-coldstore-history";

            var KeyedMessage = kafka.KeyedMessage;

            var keyedMessage = new KeyedMessage(deviceId, sMessage);
            
            // send to raw data
            producerColdstore.send([
                { 
                    topic: topicNameColdstore, 
                    messages: [keyedMessage]
                }
            ], 
            function (err, result) {
                
                if(err){
                    keyedMessage.status = err;
                    console.log('Send for cold store err : ', err); 
                }

                if(result[topicNameColdstore]){
                    //console.log('Sent for cold store OK :', keyedMessage); 
                }

                producerColdstore.close();
                clientColdstore.close();
            });

        });
            
        producerColdstore.on('error', function (err) {

            console.log('kafka error : ', err);
            
            producerColdstore.close();
            clientColdstore.close();        
        });  
    }  

    // start functions to write in Kafka
    saveToKafkaRawData(req, res);
    saveToKafkaEvent(req, res);
    saveToKafkaColdstore(req, res);
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
