/*
 * Logging
 */

module.exports = Logger;

const
    fs          = require('fs'),
    logConfig   = require('./config.js').logConfig;
var logfile = undefined;

const
    getTime = () => { return new Date().getTime().toString(); },
    _logPrefix = (app) => { return "[" + app + " " + getTime() + "] " };

/**
 * a generic logger
 * @param app   -- the application writing to the log
 */
Logger = function(app) {
    var attemptWrite = true;

    // touch log file if it doesn't exist
    if (!logfile) {
        logfile = logConfig.dir + app.toString() + "." + getTime() + ".log";
        fs.open(logfile, "a", function (err, fd) {
            if (err) {
                console.error(logPrefix() + "couldn't open log file " + logfile);
                attemptWrite = false;
            }
        });
        var app = app;
    }
    
    // log entry for this logger instance gets a custom prefix based on the name of the app
    this.logPrefix = function () { return _logPrefix(app) };

    this.__writeToLog = function (logstr) {
        if (attemptWrite) {
            return fs.appendFile(logfile, logstr, "utf8", function () {});
        }
    }

    this.log = function (str) {
        const logstr = this.logPrefix() + str.toString();
        this.__writeToLog(logstr + '\n');
        console.log(logstr);
    };

    this.error = function (str) {
        const logstr = this.logPrefix() + str.toString();
        this.__writeToLog(logstr + '\n');
        console.error(logstr);
    };

    this.close = function () {
        logfile = undefined;
    };

};
