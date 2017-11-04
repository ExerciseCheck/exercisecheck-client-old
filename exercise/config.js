/*
 * Configuration
 */

const config = {
    // Logger -- log.js
    logConfig: {
        // where to store log files
        dir: "./log/"
    },

    // Listener -- listener.js
    listenerConfig: {
        // describe the port and path where the listener can expect input
        hostname: "localhost",
        port: 8001,
        path: "/",
        keepAliveTimeout: 5000,

        // remote server receiving HTTP(S) POST requests
        remote: {
            method: "POST",
            host: "localhost",
            port: "9001",
            path: "/api/refexercises",
            headers: {
                'Content-Type': 'application/json',
            }
        }
    },
}

module.exports = config;
