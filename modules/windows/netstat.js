/**
 *  Cygwin Collect Network Statistics
 * 
 */
var process  = require('../process'),
    events   = require('events'),
    os       = require('os'),
    util     = require('util');

/**
  * $ netstat -e
  * Interface Statistics
  * 
  *                            Received            Sent
  * 
  * Bytes                    2190616468      2731744448
  * Unicast packets            24326331        17355436
  * Non-unicast packets         2506457           24290
  * Discards                          0               0
  * Errors                            0               0
  * Unknown protocols              5528
  */

module.exports = (function () {
    
    function Netstat(samplingRate) {
        this.debug         = false;
        this.hostname      = os.hostname();
        this.samplingRate  = samplingRate;
        this.regex = /^[^0-9]+(\d+)\s+(\d+)\s*$/;
        this.nsReceived = 1; this.nsSent = 2; this.regexLen = 3;
        this.bytesSent     = [];
        this.bytesReceived = [];
    }
    
    util.inherits(Netstat, events.EventEmitter);
    
    Netstat.prototype.start = function() {
        var $this         = this,
            interfaceName = 'all',
            totalSent     = 0,
            totalReceived = 0;

        process.setDebug(this.debug);
        var netstat = process.execute('netstat', ['-e'], null, null, function (err, userValue) {
            if (err) {
                if ($this.debug) util.log('windows|netstat|err=' + util.inspect(err));
                throw err;
            }
            userValue = userValue;
            if ($this.bytesSent[interfaceName] !== undefined && $this.bytesReceived[interfaceName] !== undefined) {
                var stats = {};
                stats[$this.hostname + '.network.' + interfaceName + '.inputBytes'    ] = (totalReceived - $this.bytesReceived[interfaceName]);
                stats[$this.hostname + '.network.' + interfaceName + '.outputBytes'   ] = (totalSent     - $this.bytesSent[interfaceName]);
                $this.emit('stats', stats);
            }
            $this.bytesSent[interfaceName]     = totalSent;
            $this.bytesReceived[interfaceName] = totalReceived;

            setTimeout(function () {
                $this.start.call($this);
            }, $this.samplingRate * 1000);
        });
        
        netstat.stdout.on('data', function (data) {
            var lines = ('' + data).split(/\r?\n/);

            for (var i = 0 ; i < lines.length ; ++i) {
                var capture = lines[i].match($this.regex);
                if ($this.debug) util.log('windows|netstat|stout=' + lines[i] + '|capture=' + util.inspect(capture));
                if (capture !== null && capture[0] !== undefined && capture.length === $this.regexLen) { 
                    totalSent     += parseInt(capture[$this.nsSent]);
                    totalReceived += parseInt(capture[$this.nsReceived]);
                }
            }
        });
        netstat.stderr.on('data', function (data) {
            if ($this.debug) util.log('windows|netstat|stderr=' + data + '\n');
        });
    };

    ////////////////////////////////////////////////////////////////////////////

    return  Netstat;
})();


