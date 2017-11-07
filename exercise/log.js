/*
 * Logging
 */

const
    fs          = require('fs'),
    logConfig   = require('./config.js').logConfig;
var logfile     = undefined;

const
    getTime = () => { return new Date().getTime().toString(); },
    _logPrefix = (app) => { return "[" + getTime() + "] " + app + ": "; },
    _error = (app, str) => { return console.error(_logPrefix(app) + str); };

// ---

function loggerBase(app, toOut, toFile, attemptWrite) {

    this.app = app;
    this.toOut = toOut;
    this.toFile = toFile;
    this.attemptWrite = attemptWrite;

    // log entry for this logger instance gets a custom prefix based on the name of the app
    const logPrefix = () => { return _logPrefix(app); };

    const __writeToLog = (logstr) => {
        if (attemptWrite && toFile) {
            try {
                fs.appendFileSync(logfile, logstr, "utf8");
            } catch (err) {
                _error("LOGGER", err);

                // ENOENT? The log file disappeared somehow!
                if (err.code === "ENOENT") {
                    _error("LOGGER", "the log file has disappeared; will stop attempting to write to file");
                    attemptWrite = false;
                    logfile = undefined;
                };
            }
        }
    };

    this.log = (str) => {
        const logstr = logPrefix() + str.toString();
        __writeToLog(logstr + '\n');
        if (toOut) {
            console.log(logstr);
        }
    };

    this.error = (str) => {
        const logstr = logPrefix() + str.toString();
        __writeToLog(logstr + '\n');
        if (toOut) {
            console.error(logstr);
        }
    };

    this.close =  () => {
        attemptWrite = false;
        logfile = undefined;
    };
};

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

        // touch logging directory and log file if neither exist
        if (toFile && !logfile) {

            try {
                fs.statSync(logConfig.dir);
            } catch (err) {
                if (err.code === "ENOENT") {
                    _error("LOGGER", "mkdir " + logConfig.dir);
                    fs.mkdirSync(logConfig.dir, (err) => {
                        _error("LOGGER", err);
                    });
                } else {
                    attemptWrite = false;
                    _error("LOGGER", "failed to stat " + logConfig.dir + ", error " + err.code);
                    _error("LOGGER", "will not write to file");
                }
            }

            logfile = logConfig.dir + logConfig.pre + "." + getTime() + ".log";
            if (attemptWrite) {
                fs.openSync(logfile, "a", (err) => {
                    if (err) {
                        attemptWrite = false;
                        _error("LOGGER", "could not open file at " + logfile);
                        _error("LOGGER", err);
                    }
                });
            }
        }

        return new loggerBase(app, toOut, toFile, attemptWrite);
    }
};

module.exports = logger;

