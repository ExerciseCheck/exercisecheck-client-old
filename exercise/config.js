/*
 * Configuration
 */

'use strict';

const config = {
  //
  // Client -- index.js
  //
  clientConfig: {
    port: 8000,
    path: '/',

    // is the bodyFrame sitting on localhost?
    localListener: true,

    // location of listener if not on localhost
    listener: {
      hostname: NaN, 
      port: NaN,
      path: NaN,
      keepAliveTimeout: NaN
    },

    // return JSON with connection info to listener, dependening on whether or not the listener is local
    getListener: () => {
      return config.clientConfig.localListener ? config.listenerConfig.local : config.clientConfig.listener;
    }
  },

  //
  // Logger -- log.js
  //
  logConfig: {
    // where to store log files
    dir: './log/',
    // log file prefix
    pre: 'ec'
  },

  //
  // Listener -- listener.js
  //
  listenerConfig: {
    // describe the port and path where the listener can expect input
    local: {
      hostname: 'sail.bu.edu',
      port: '8005',
      path: '/',
      keepAliveTimeout: '5000'
    },

    // remote server receiving HTTP(S) POST requests
    remote: {
      method: 'POST',
      host: 'sail.bu.edu',
      port: '9001',
      path: '/api/refexercises',
      headers: {
        'Content-Type': 'application/json'
      }
    },

    // should I log the buffers I receive? (default: false; they can get pretty big)
    logBuffer: false,

    // should I enforce a connection limit policy (default: 0, i.e. no limit)
    limit: 0
  }
};

module.exports = config;
