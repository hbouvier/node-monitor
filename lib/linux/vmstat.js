/**
 *  CentOS Collect Network Statistics
 * 
 */
var process  = require('../process'),
    events   = require('events'),
    os       = require('os'),
    util     = require('util');

/**
 * Linux
 * vmstat -n 10
 * procs -----------memory---------- ---swap-- -----io---- --system-- -----cpu------
 *  r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 *  0  0  45080 10970204 120756 437012    0    0     0     2   11    4  0  0 100  0  0
 *  0  0  45080 10970204 120756 437012    0    0     0     0 1012   70  0  0 100  0  0
 *  0  0  45080 10970204 120756 437012    0    0     0     0 1010   78  0  0 100  0  0
 * 
 */

module.exports = (function () {
    
    function Vmstat(samplingRate, log) {
        this.hostname      = os.hostname();
        this.logger        = log;
        this.samplingRate  = samplingRate;
        this.regex = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/;
        this.waitForRuntime=1;this.nbUninterruptibleSleep=2;this.swpd=3;this.free=4;this.buffers=5;this.cache=6;this.swappedIn=7;this.swappedOut=8;this.read=9;this.write=10;
        this.interrupt=11;this.contextSwitch=12;this.user=13;this.system=14;this.idle=15;this.waitIO=16;this.stolenVM=17;this.vmstatRegexLen=18;
    }
    
    util.inherits(Vmstat, events.EventEmitter);
    
    Vmstat.prototype.start = function() {
        var $this         = this;

        process.setLogger(this.logger);
        var vmstat = process.execute('vmstat', ['-n', $this.samplingRate], null, null, function (err, userValue) {
            if (err) {
                $this.logger.log('error', 'linux|vmstat|err=' + util.inspect(err));
                throw err;
            }
            userValue = userValue;
        });
        
        vmstat.stdout.on('data', function (data) {
            var lines = ('' + data).split(/\r?\n/);

            for (var i = 0 ; i < lines.length ; ++i) {
                var capture = lines[i].match($this.regex);
                $this.logger.log('debug', 'linux|vmstat|stout=' + lines[i] + '|capture=' + util.inspect(capture));
                if (capture !== null && capture[0] !== undefined && capture.length === $this.vmstatRegexLen) {
                    var stats = {};
                    stats[$this.hostname + '.cpu.used']   = (100 - capture[$this.idle]);
                    stats[$this.hostname + '.cpu.user']   = capture[$this.user];
                    stats[$this.hostname + '.cpu.system'] = capture[$this.system];
                     
                    stats[$this.hostname + '.memory.swapused']         = capture[$this.swpd];
                    stats[$this.hostname + '.memory.free']             = capture[$this.free];
                    stats[$this.hostname + '.memory.used_for_buffers'] = capture[$this.buffers];
                    stats[$this.hostname + '.memory.used_for_cache']   = capture[$this.cache];
                    stats[$this.hostname + '.memory.swap.in']          = capture[$this.swappedIn];
                    stats[$this.hostname + '.memory.swap.out']         = capture[$this.swappedOut];

                    stats[$this.hostname + '.disk.read']  = capture[$this.read];
                    stats[$this.hostname + '.disk.write'] = capture[$this.write];
        
                    stats[$this.hostname + '.kernel.interrupt']     = capture[$this.interrupt];
                    stats[$this.hostname + '.kernel.contextswitch'] = capture[$this.contextSwitch];
                    stats[$this.hostname + '.kernel.wait.io']       = capture[$this.waitIO];
                    stats[$this.hostname + '.vmware.overhead']      = capture[$this.stolenVM];
                     
                    stats[$this.hostname + '.process.wait']  = capture[$this.waitForRuntime];
                    stats[$this.hostname + '.process.sleep'] = capture[$this.nbUninterruptibleSleep];
        
                    $this.emit('stats', stats);
                 }
            }
        });

        vmstat.stderr.on('data', function (data) {
            $this.logger.log('error', 'linux|vmstat|stderr=' + data + '\n');
        });
    };
    
    ////////////////////////////////////////////////////////////////////////////
    
    return  Vmstat;
})();


