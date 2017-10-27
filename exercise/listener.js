/*
 * Rudimentary server to receive bufferTrial JSONObjects
 */

const
    express = require("express"),
    app     = express(),
    server  = require('http').Server(app),
    io      = require('socket.io')(server),
    bp      = require('body-parser');

const
    bufferQueue = [];

// TODO: for now the server's listening on localhost:8001, though this is
// TODO: *probably* not what we want moving forward
server.listen(8001);

console.log("Server started on localhost:8001");
io.on("connection", function(socket) {

        /* Receive a buffer from the patient */
        socket.on("bufferPush", function (patientBuffer) {
            const payloadSize = sizeof();
            console.log("Buffer received at " + (new Date().getTime().toString()));
            console.log('---\n');
            bufferQueue.push(patientBuffer);
        });

    }
);

// ---

