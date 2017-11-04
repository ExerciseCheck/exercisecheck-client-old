/*
 * Logging
 */

const
    fs          = require('fs'),
    logConfig   = require('./config.js').logConfig;
var logfile = undefined;

const
    getTime = () => { return new Date().getTime().toString(); },
    _logPrefix = (app) => { return "[" + app + " " + getTime() + "] "; },
    _error = (app, str) => { return _logPrefix(app) + str; };

const logger = {
    /**
     * a generic logger
     * @param {string} app     -- the application writing to the log
     * @param {bool} toOut     -- enable writing to stdout and stderr (default: true)
     * @param {bool} toFile    -- enable writing to log file (default: true)
     */
    Logger: (app, toOut, toFile) => {
        if (toOut !== null) {
            toOut = true;
        }
        if (toFile !== null) {
            toFile = true;
        }
        var attemptWrite = true;

        // touch logging directory  and log file if neither exist
        if (toFile && !logfile) {
            // make the logging directory if it does not exist
            fs.statSync(logConfig.dir, (err) => {
                if (err) {
                    _error(app, err);
                    if (err.code === "ENOENT") {
                        fs.mkdirSync(logConfig.dir, (err) => {
                            console.error("LOGGER: " + err);
                        });
                    }
                }
            });
            logfile = logConfig.dir + app.toString() + "." + getTime() + ".log";
            fs.openSync(logfile, "a", (err) => {
                if (err) {
                    attemptWrite = false;
                    console.error("LOGGER: could not open file at " + logfile);
                    console.error("LOGGER: " + err);
                }
            });
        }

        // log entry for this logger instance gets a custom prefix based on the name of the app
        this.logPrefix = () => { return _logPrefix(app); };

        this.__writeToLog = function (logstr) {
            if (attemptWrite && toFile) {
                return fs.appendFileSync(logfile, logstr, "utf8", function (err) {
                    if (err) {
                        console.error("LOGGER: " + err);
                    }
                });
            }
        }

        this.log = function (str) {
            const logstr = this.logPrefix() + str.toString();
            this.__writeToLog(logstr + '\n');
            if (toOut) {
                console.log(logstr);
            }
        };

        this.error = function (str) {
            const logstr = this.logPrefix() + str.toString();
            this.__writeToLog(logstr + '\n');
            if (toOut) {
                console.error(logstr);
            }
        };

        this.close = function () {
            attemptWrite = false;
            logfile = undefined;
        };

        this.logloc = () => { return logfile };

        return this;
    }
};

module.exports = logger;

