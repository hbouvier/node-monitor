var MacNetstat   = require('./modules/macosx/netstat'),
    LinuxNetstat = require('./modules/linux/netstat'),
    WinNetstat   = require('./modules/windows/netstat'),
    VmstatLinux  = require('./modules/linux/vmstat'),
    VmstatWin    = require('./modules/windows/vmstat'),
    VmstatMacOsX = require('./modules/macosx/vmstat'),
    Df           = require('./modules/df'),
    util    = require('util'),
    os      = require('os'),
    dgram = require('dgram');

(function() {
    var debug        = false,
        client       = dgram.createSocket("udp4"),
        server       = process.env.STATSD_HOST || '127.0.0.1',
        port         = process.env.STATSD_PORT || 8125,
        samplingRate = process.env.SAMPLING_RATE || 10;
        
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
                if (debug) util.log('monitor|send|host='+server+':'+port+'|message='+message+'|err=' + util.inspect(err));
                client.close();
                throw err;
            }
            if (debug) util.log('monitor|send|host='+server+':'+port+'|message='+message+'|bytes-sent=' + bytes);
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

    var netstat = isMacOs() ? new MacNetstat(samplingRate) : (isLinux() ? new LinuxNetstat(samplingRate) : new WinNetstat(samplingRate));
    util.log('Starting Monitoring Service on ' + os.hostname() + ', reporting to ' + server + ':' + port);
    netstat.start();
    netstat.on('stats', function (stats) {
        sendStats(stats);
    });
    
    var df = new Df(samplingRate);
    df.start();
    df.on('stats', function (stats) {
        sendStats(stats);
    });
    
    var vmstat = isLinux() ? new VmstatLinux(samplingRate) : (isMacOs() ? new VmstatMacOsX(samplingRate) : new VmstatWin(samplingRate));
    if (vmstat) {
        vmstat.start();
        vmstat.on('stats', function (stats) {
            sendStats(stats);
        });
    }    
})();
