/*
 * Client-side listener to receive exercisecheck buffer JSONObjects and forward to Anchor
 */

const
    http    = require("http"),
    express = require("express"),
    app     = express(),
    server  = require('http').Server(app),
    io      = require('socket.io')(server),
    bp      = require('body-parser'),
    process = require('process');

/* Listener configs */
const
    listenerPort = 8001,
    keepAliveTimeout = 5000,
    path = "/";

// TODO: do we need to keep buffertrials in a queue?
const
    bufferQueue = [];

// remote server receiving HTTP(S) POST requests
const
    remote = {
        method: "POST",
        host: "sail.bu.edu",
        port: "9001",
        path: "/api/refexercises",
        headers: {
            'Content-Type': 'application/json',
        }
    };

/* logging, time utils */
const
    getTime = () => { return new Date().getTime().toString(); };

const
    logTimePrefix = () => { return "[" + getTime() + "] " };

// ---

// set the listener up
server.listen(listenerPort);
console.log(logTimePrefix() + "Ec JSON buffer listener started on localhost:" + listenerPort.toString());

io.on("connection", function(socket) {

        /* Receive a buffer from the patient */
        socket.on("bufferPush", function (patientBuffer) {
            const timeOf = getTime();
            console.log(logTimePrefix() + "Buffer received at " + timeOf);
            //makePostToAnchor(patientBuffer);
        });

        /* EC client tells listener to close */
        socket.on("listenerClose", goodbye);
    }
);

// ---

/* make post request to anchor server */
function makePostToAnchor(JSONpayload) {
    // TODO: TASKS:
    // TODO:	1: unhardcode port + url
    // TODO:	2: Splitting or cleaning up the buffer to reduce data sent overall?
    // TODO:	3: Encryption?
    console.log(logTimePrefix() + "Attempting POST to remote");
    const postReq = http.request(remote, function (res) {
        console.log("request received");
    });
    postReq.write(JSON.stringify(JSONpayload));
    postReq.end();
};

/* shut server down in a graceful manner */
function goodbye() {
    console.log(logTimePrefix() + "listener ending gracefully");
    io.close();
    server.close();
    process.exit(0);
}