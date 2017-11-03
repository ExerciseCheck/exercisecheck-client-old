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
        host: "localhost",
        port: "9001",
        path: "/api/refexercises",
        headers: {
            'Content-Type': 'application/json',
        }
    };

/* logging, time utils */
// TODO: refactor logging utils into separate file log.js
const
    scriptname = require('path').basename(__filename);

const
    getTime = () => { return new Date().getTime().toString(); },
    logPrefix = () => { return "[" + scriptname + " " + getTime() + "] " };

// ---

/* Windows isn't POSIX compliant so we need to open a readline object to translate process signals;
 * credit: https://stackoverflow.com/a/14861513 */
if (process.platform === "win32") {
    var rl = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.on("SIGINT", function() {
        process.emit("SIGINT");
    });
};

/* Quit gracefully on a keyboard interrupt */
process.on("SIGINT", function () {
        console.log(logPrefix() + "received SIGINT; attempting graceful shutdown");
        goodbye();
    }
);

// ---

// set the listener up
server.listen(listenerPort);
io.path(path);
//io.origins(['localhost:8000']); // TODO: enforce localhost origin @ 8000?
console.log(logPrefix() + "Ec JSON buffer listener started on localhost:" + listenerPort.toString() + path);

var clients = 0;
/* socket logic */
io.on("connection", function (socket) {
        console.log(logPrefix() + "received connection");

        /* Process and verify client initialization request */
        socket.on("clientInit", function () {
           console.log(logPrefix() + "received init request from client");

           // limit number of connections to 1
           if (++clients > 1) {
               console.error(logPrefix() + "dropping connection attempted since EC is already connected to this socket");
               socket.disconnect();
           } else {
               console.log(logPrefix() + "accepting connection, sending serverHello back");
               socket.emit("serverHello");
           };
        });

        /* Close a connection on goodbye */
        socket.on("clientGoodbye", function (bye) {
            console.log(logPrefix() + "client disconnected");
            clients = Math.max(--clients, 0);
            socket.emit("serverGoodbye");
            socket.disconnect();
        });

        /* Receive a buffer from the patient */
        socket.on("bufferPush", function (patientBuffer) {
            // TODO: verify JSON?
            console.log(logPrefix() + "buffer received");

            /* write to anchor; on fail, inform EC client contact has failed */
            if (!sendToAnchor(patientBuffer)) {
                // TODO: forward error from remote
                socket.emit("remoteError", "Could not connect to remote");
            }
        });

        /* EC client tells listener to close */
        socket.on("listenerClose", function() {
            console.log(logPrefix() + "received listener close request from client");
            goodbye();
        });
    }
);

// ---

/* make HTTP request to anchor server; returns bool (true if successful, false otherwise) */
function sendToAnchor(JSONpayload) {
    // TODO: TASKS:
    // TODO:	1: unhardcode port + url
    // TODO:	2: Splitting or cleaning up the buffer to reduce data sent overall?
    // TODO:	3: Encryption?
    console.log(logPrefix() + "attempting " + remote.method + " to remote at " + remote.host + ":" + remote.port + remote.path );
    const postReq = http.request(remote, function (res) {
        console.log(logPrefix() + "requested accepted by remote");
    });

    var success = true;
    postReq.on("error", function (err) {
        const prefix = logPrefix();
        success = false;
        console.error(prefix + err);
    });
    postReq.write(JSON.stringify(JSONpayload));
    postReq.end();
    return success;
};

/* shut server down in a graceful manner */
function goodbye() {
    console.log(logPrefix() + "listener ending gracefully");
    io.close();
    server.close();
    process.exit(0);
}