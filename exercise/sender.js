

payload = require("./payload2.json");
listener = require('socket.io-client');
config = require("./config.js").clientConfig;
listenerLocation = config.getListener();
// location of the listener
var listenerLocStr = "http://" + listenerLocation.hostname + ":" + listenerLocation.port + listenerLocation.path;
var listenerSocket = listener(listenerLocStr);
console.log("attempting connection to listener at " + listenerLocStr);

listenerSocket.on('connect_timeout', function (timeout) {
    console.log("could not connect to listener");
});

listenerSocket.emit("clientInit");

listenerSocket.on("serverHello", function () {
  console.log("remote said hello..");
    listenerSocket.emit(
        'bufferPush',
        {
            bodyFrames: payload,
            // auth: token
        }
    );

});

listenerSocket.on("remoteError", function (msg) {
        alert("Oh no! " + msg);
        console.err(msg);
        listenerSocket.emit('clientGoodbye');
    }
);

listenerSocket.on("serverGoodbye", function (msg) {
        console.err("connection closed");
    }
);
