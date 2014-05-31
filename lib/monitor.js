(function() {
    var util         = require('util'),
        os           = require('os'),
        dgram        = require('dgram'),
        winston      = require('winston'),
        MacNetstat   = require('./macosx/netstat'),
        LinuxNetstat = require('./linux/netstat'),
        WinNetstat   = require('./windows/netstat'),
        VmstatLinux  = require('./linux/vmstat'),
        VmstatWin    = require('./windows/vmstat'),
        VmstatMacOsX = require('./macosx/vmstat'),
        Df           = require('./df'),
        client       = dgram.createSocket("udp4"),
        level        = process.env.NODE_MONITOR_LEVEL || 'info',
        server       = process.env.STATSD_HOST   || process.env.STATSD_PORT_9200_TCP_ADDR || '127.0.0.1',
        port         = process.env.STATSD_PORT   || process.env.STATSD_PORT_9200_TCP_PORT || 8125,
        samplingRate = process.env.SAMPLING_RATE || process.env.STATSD_SAMPLING_RATE      || 10;


    var transports = [new (winston.transports.Console)({
            "level"    : level,
            "json"     : false,
            "colorize" : true
        })];
    transports.push(new (winston.transports.File)({
        "filename" : './monitor.log',
        "level"    : level,
        "json"     : true,
        "colorize" : false
    }));
    var logger = new (winston.Logger)({ transports: transports});
        
    function isWindows() {
        var win = 'Windows';
        return (os.type().substring(0, win.length) == win);
    }
    function isMacOs() {
        var darwin = 'Darwin';
        return (os.type().substring(0, darwin.length) == darwin);
    }
    function isLinux() {
        var linux = 'Linux';
        return (os.type().substring(0, linux.length) == linux);
    }
    
    function send(message) {
        var buffer = new Buffer(message);
        client.send(buffer, 0, buffer.length, port, server, function (err, bytes) {
            if (err) {
                logger.log('error', 'monitor|send|message=', {host:server, port:port, msg:message, err:err});
                client.close();
                throw err;
            }
            logger.log('debug', 'monitor|send|message=', {host:server, port:port, msg:message, bytessent:bytes});
        });
    }
    
    function sendStats(stats) {
        var buffer = '';
        var addLF = false;
        for (var stat in stats) {
            if (addLF) {
                buffer += '\n' + stat + ':' + stats[stat] + '|g';
            } else {
                addLF = true;
                buffer += stat + ':' + stats[stat] + '|g';
            }
        }
        send(buffer);
    }

    var netstat = isMacOs() ? new MacNetstat(samplingRate, logger) : (isLinux() ? new LinuxNetstat(samplingRate, logger) : new WinNetstat(samplingRate, logger));
    logger.log('info', 'Starting Monitoring Service on ' + os.hostname() + ', reporting to ' + server + ':' + port);
    netstat.start();
    netstat.on('stats', function (stats) {
        sendStats(stats);
    });
    
    var df = new Df(samplingRate, logger);
    df.start();
    df.on('stats', function (stats) {
        sendStats(stats);
    });
    
    var vmstat = isLinux() ? new VmstatLinux(samplingRate, logger) : (isMacOs() ? new VmstatMacOsX(samplingRate, logger) : new VmstatWin(samplingRate, logger));
    if (vmstat) {
        vmstat.start();
        vmstat.on('stats', function (stats) {
            sendStats(stats);
        });
    }    
})();
