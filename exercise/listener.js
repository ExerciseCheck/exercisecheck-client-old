/*
 * Rudimentary server to receive bufferTrial JSONObjects
 */

const
    express = require("express"),
    app     = express(),
    server  = require('http').Server(app),
    bp      = require('body-parser');

const
    bufferQueue = [];

// TODO: for now the server's listening on localhost:8001, though this is
// TODO: *probably* not what we want moving forward
server.listen(8001);

app.use(bp.json());
console.log("Server started on localhost:8001");

// forbid GET requests
app.get('/', function(req, res) {
        console.log("rejecting GET request");
        res.status(403);
        res.send("<h1>403 Forbidden</h1>");
    });

// receive POST request
app.post('/', function(req, res) {
        // TODO: validate buffer
        console.log("Buffer received at " + (new Date().getTime().toString()));
        console.log(JSON.stringify(req.body));
        res.send();
    });

// ---

