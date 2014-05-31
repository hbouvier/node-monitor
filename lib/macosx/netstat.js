/**
 *  Mac OS X: Collect Network Statistics
 * 
 */
var process  = require('../process'),
    events   = require('events'),
    os       = require('os'),
    util     = require('util');

/**
 * root@mt-nme-cosnme2 ~]# df -P
 * Filesystem         1024-blocks      Used Available Capacity Mounted on
 * /dev/mapper/VolGroup00-LogVol00  40756536   3619856  35032976      10% /
 * /dev/sda1               101086     12711     83156      14% /boot
 * tmpfs                  6667044         0   6667044       0% /dev/shm
*/

module.exports = (function () {
    
    function Netstat(samplingRate, log) {
        this.logger        = log;
        this.hostname      = os.hostname();
        this.samplingRate  = samplingRate;
        this.regex = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/;
        this.inPackets = 1; this.inErrors = 2; this.inBytes = 3; this.outPackets = 4; this.outErrors = 5; this.outBytes = 6; this.collisions = 7; this.regexLen = 8;
    }
    
    util.inherits(Netstat, events.EventEmitter);
    
    Netstat.prototype.start = function() {
        var $this = this,
            interfaceName = 'all';
        process.setLogger(this.logger);
        var netstat = process.execute('/usr/sbin/netstat', ['-w', $this.samplingRate], null, null, function (err, userValue) {
            if (err) {
                $this.logger.log('error', 'macosx|netstat|err=' + util.inspect(err));
                throw err;
            }
            userValue = userValue;
            $this.logger.log('info', 'macosx|netstat|terminating normally');
        });
        
        netstat.stdout.on('data', function (data) {
            var lines = ('' + data).split(/\r?\n/);

            for (var i = 0 ; i < lines.length ; ++i) {
                var capture = lines[i].match($this.regex);
                $this.logger.log('debug', 'macosx|netstat|stout=' + lines[i] + '|capture=' + util.inspect(capture));
                if (capture !== null && capture[0] !== undefined && capture.length === $this.regexLen) { 
                    var stats = {};
                    stats[$this.hostname + '.network.' + interfaceName + '.inputPackets'  ] = capture[$this.inPackets];
                    stats[$this.hostname + '.network.' + interfaceName + '.inputErrors'   ] = capture[$this.inErrors];
                    stats[$this.hostname + '.network.' + interfaceName + '.inputBytes'    ] = capture[$this.inBytes];
                    stats[$this.hostname + '.network.' + interfaceName + '.outputPackets' ] = capture[$this.outPackets];
                    stats[$this.hostname + '.network.' + interfaceName + '.outputErrors'  ] = capture[$this.outErrors];
                    stats[$this.hostname + '.network.' + interfaceName + '.outputBytes'   ] = capture[$this.outBytes];
                    stats[$this.hostname + '.network.' + interfaceName + '.collisions'    ] = capture[$this.collisions];
                    $this.emit('stats', stats);
                }
            }
        });
        netstat.stderr.on('data', function (data) {
            $this.logger.log('error', 'macosx|netstat|stderr=' + data + '\n');
        });
    };
    
    ////////////////////////////////////////////////////////////////////////////
    
    return  Netstat;
})();


