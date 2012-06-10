/**
 *  CentOS Collect Network Statistics
 * 
 */
var process  = require('../process'),
    events   = require('events'),
    os       = require('os'),
    util     = require('util');

/**
 * # ifconfig
 * 
 * eth0      Link encap:Ethernet  HWaddr 00:50:56:86:63:22  
 *           inet addr:10.3.39.106  Bcast:10.3.39.255  Mask:255.255.252.0
 *           inet6 addr: fd51:ffbb:ffbb:324:250:56ff:fe86:6322/64 Scope:Global
 *           inet6 addr: fe80::250:56ff:fe86:6322/64 Scope:Link
 *           UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
 *           RX packets:30184720 errors:0 dropped:0 overruns:0 frame:0
 *           TX packets:3390966 errors:0 dropped:0 overruns:0 carrier:0
 *           collisions:0 txqueuelen:1000 
 *           RX bytes:3930128736 (3.6 GiB)  TX bytes:2094861790 (1.9 GiB)
 * 
 * lo        Link encap:Local Loopback  
 *           inet addr:127.0.0.1  Mask:255.0.0.0
 *           inet6 addr: ::1/128 Scope:Host
 *           UP LOOPBACK RUNNING  MTU:16436  Metric:1
 *           RX packets:219953 errors:0 dropped:0 overruns:0 frame:0
 *           TX packets:219953 errors:0 dropped:0 overruns:0 carrier:0
 *           collisions:0 txqueuelen:0 
 *           RX bytes:270297634 (257.7 MiB)  TX bytes:270297634 (257.7 MiB)
 */

module.exports = (function () {
    
    function Netstat(samplingRate) {
        this.debug         = false;
        this.hostname      = os.hostname();
        this.bytesSent     = [];
        this.bytesReceived = [];
        this.samplingRate  = samplingRate;
        this.interfaceNameRegex = /^([a-zA-Z0-9]+)\s+/;
        this.regex = /^\s+RX\s+bytes:\s*(\d+)\s+\([^)]+\)\s+TX\s+bytes:\s*(\d+)\s+\([^)]*\)\s*$/;
        this.received = 1; this.sent = 2; this.regexLen=3;
    }
    
    util.inherits(Netstat, events.EventEmitter);
    
    Netstat.prototype.start = function() {
        var $this         = this,
            interfaceName = 'all';

        process.setDebug(this.debug);
        var netstat = process.execute('/sbin/ifconfig', null, null, null, function (err, userValue) {
            if (err) {
                if ($this.debug) util.log('linux|netstat|err=' + util.inspect(err));
                throw err;
            }
            userValue = userValue;
            setTimeout(function () {
                $this.start.call($this);
            }, $this.samplingRate * 1000);
        });
        
        netstat.stdout.on('data', function (data) {
            var lines = ('' + data).split(/\r?\n/);

            for (var i = 0 ; i < lines.length ; ++i) {
                var capture = lines[i].match($this.interfaceNameRegex);
                if ($this.debug) util.log('linux|netstat|stout=' + lines[i] + '|capture=' + util.inspect(capture));
                if (capture !== null && capture[0] !== undefined && capture.length === 2) {
                    interfaceName = capture[1];
                } else {
                    capture = lines[i].match($this.regex);
                    if ($this.debug) util.log('linux|netstat|stout=' + lines[i] + '|capture=' + util.inspect(capture));
                    if (capture !== null && capture[0] !== undefined && capture.length === $this.regexLen) { 
                        if ($this.bytesSent[interfaceName] !== undefined && $this.bytesReceived[interfaceName] !== undefined) {
                            var stats = {};
                            stats[$this.hostname + '.network.' + interfaceName + '.inputBytes'    ] = capture[$this.received] - $this.bytesReceived[interfaceName];
                            stats[$this.hostname + '.network.' + interfaceName + '.outputBytes'   ] = capture[$this.sent] - $this.bytesSent[interfaceName];
                            $this.emit('stats', stats);
                        }
                        $this.bytesSent[interfaceName]     = parseInt(capture[$this.sent]);
                        $this.bytesReceived[interfaceName] = parseInt(capture[$this.received]);
                    }
                }
            }
        });
        netstat.stderr.on('data', function (data) {
            if ($this.debug) util.log('linux|netstat|stderr=' + data + '\n');
        });
    };
    
    ////////////////////////////////////////////////////////////////////////////
    
    return  Netstat;
})();


