/*
 * Client-side listener to receive exercisecheck buffer JSONObjects and forward to Anchor
 */

'use strict';

const http        = require('http');
const express     = require('express');
const app         = express();
const server      = require('http').Server(app);
const io          = require('socket.io')(server);
const process     = require('process');
const logger      = require('./log.js').Logger('listener');
const config      = require('./config.js').listenerConfig;

// TODO: should we keep buffertrials in a queue to hold onto, in case the listener is down?
// const bufferQueue = [];

const remote = config.remote;

// ---

/* Windows isn't POSIX compliant so we need to open a readline object to translate process signals;
 * credit: https://stackoverflow.com/a/14861513 */
if (process.platform === 'win32') {
  const rl = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.on('SIGINT', () => {
    process.emit('SIGINT');
  });
};

/* Quit gracefully on a keyboard interrupt */
process.on('SIGINT', () => {
  logger.log('received SIGINT; attempting graceful shutdown');
  Listener.goodbye();
}
);

// ---

const Listener = {
  listener: () => {
    // set the listener up
    server.listen(config.local.port);
    io.path(config.local.path);
    //io.origins(['localhost:8000']); // TODO: enforce localhost origin @ 8000?
    logger.log('Ec JSON buffer listener started on localhost:' + config.local.port.toString() + config.local.path);

    let clients = 0;
    /* socket logic */
    io.on('connection', (socket) => {
      logger.log('received connection');

      /* Process and verify client initialization request */
      socket.on('clientInit', () => {
        logger.log('received init request from client');

        // limit number of connections to 1
        if (config.limit > 0 && ++clients > 1) {
          logger.error('dropping connection attempted since EC is already connected to this socket');
          socket.disconnect();
        }
        else {
          logger.log('accepting connection, sending serverHello back');
          socket.emit('serverHello');
        }
      });

      /* Close a connection on goodbye */
      socket.on('clientGoodbye', (bye) => {
        logger.log('client disconnected');
        clients = Math.max(--clients, 0);
        socket.emit('serverGoodbye');
        socket.disconnect();
      });

      /* Receive a buffer from the patient */
      socket.on('bufferPush', (patientBuffer) => {
        // TODO: verify JSON?
        logger.log('buffer received');
        if (config.logBuffer) {
          logger.log(JSON.stringify(patientBuffer));
        }

        /* write to anchor */
        this.sendToAnchor(patientBuffer);
      });

      /* EC client tells listener to close */
      socket.on('listenerClose', () => {
        logger.log('received listener close request from client');
        Listener.goodbye();
      });
    });

    // ---

    /* make HTTP request to anchor server; returns bool (true if successful, false otherwise) */
    const sendToAnchor = (JSONpayload) => {
      // TODO: TASKS:
      // TODO:	1: unhardcode port + url
      // TODO:	2: Splitting or cleaning up the buffer to reduce data sent overall?
      // TODO:	3: Encryption?
      logger.log('attempting ' + remote.method + ' to remote at ' + remote.host + ':' + remote.port + remote.path);
      const postReq = http.request(remote, (res) => {
        logger.log('requested accepted by remote');
      });

      let success = true;
      postReq.on('error', (err) => {
        success = false;
        logger.error(err);
        socket.emit('remoteError', err);
      });
      postReq.write(JSON.stringify(JSONpayload));
      postReq.end();
      if (success) {
        socket.emit('remoteSuccess');
      };
      return success;
    };

    /* shut server down in a graceful manner */
    const goodbye = () => {
      logger.log('listener ending gracefully');
      io.close();
      server.close();
      process.exit(0);
    };
  }
};

module.exports = Listener;
