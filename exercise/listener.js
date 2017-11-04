/*
 * Client-side listener to receive exercisecheck buffer JSONObjects and forward to Anchor
 */

const
    http        = require("http"),
    express     = require("express"),
    app         = express(),
    server      = require('http').Server(app),
    io          = require('socket.io')(server),
    bp          = require('body-parser'),
    process     = require('process'),
    logger      = require('./log.js').Logger('listener'),
    config      = require('./config.js').listenerConfig;

// TODO: should we keep buffertrials in a queue to hold onto, in case the listener is down?
const bufferQueue = [];

const remote = config.remote;

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
        logger.log("received SIGINT; attempting graceful shutdown");
        goodbye();
    }
);

// ---

// set the listener up
server.listen(config.local.port);
io.path(config.local.path);
//io.origins(['localhost:8000']); // TODO: enforce localhost origin @ 8000?
logger.log("Ec JSON buffer listener started on localhost:" + config.local.port.toString() + config.local.path);

var clients = 0;
/* socket logic */
io.on("connection", function (socket) {
        logger.log("received connection");

        /* Process and verify client initialization request */
        socket.on("clientInit", function () {
           logger.log("received init request from client");

           // limit number of connections to 1
           if (++clients > 1) {
               logger.error("dropping connection attempted since EC is already connected to this socket");
               socket.disconnect();
           } else {
               logger.log("accepting connection, sending serverHello back");
               socket.emit("serverHello");
           };
        });

        /* Close a connection on goodbye */
        socket.on("clientGoodbye", function (bye) {
            logger.log("client disconnected");
            clients = Math.max(--clients, 0);
            socket.emit("serverGoodbye");
            socket.disconnect();
        });

        /* Receive a buffer from the patient */
        socket.on("bufferPush", function (patientBuffer) {
            // TODO: verify JSON?
            logger.log("buffer received");

            /* write to anchor; on fail, inform EC client contact has failed */
            if (!sendToAnchor(patientBuffer)) {
                // TODO: forward error from remote
                socket.emit("remoteError", "Could not connect to remote");
            }
        });

        /* EC client tells listener to close */
        socket.on("listenerClose", function() {
            logger.log("received listener close request from client");
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
    logger.log("attempting " + remote.method + " to remote at " + remote.host + ":" + remote.port + remote.path );
    const postReq = http.request(remote, function (res) {
        logger.log("requested accepted by remote");
    });

    var success = true;
    postReq.on("error", function (err) {
        success = false;
        logger.error(err);
    });
    postReq.write(JSON.stringify(JSONpayload));
    postReq.end();
    return success;
};

/* shut server down in a graceful manner */
function goodbye() {
    logger.log("listener ending gracefully");
    io.close();
    server.close();
    process.exit(0);
}
