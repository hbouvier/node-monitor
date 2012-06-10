/**
 *  Cygwin Collect Network Statistics
 * 
 */
var process  = require('../process'),
    events   = require('events'),
    os       = require('os'),
    util     = require('util');

/**
  * Cygwin
 * procs -----------memory---------- ---swap-- -----io---- -system-- ----cpu----
 *  r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa
 *  0  0  10020 1977732      0      0    0    0     0     0    0    0  0  1 99  0
 * 
 */

module.exports = (function () {
    
    function Vmstat(samplingRate) {
        this.debug         = false;
        this.hostname      = os.hostname();
        this.samplingRate  = samplingRate;
        this.regex = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/;
        this.waitForRuntime=1;this.nbUninterruptibleSleep=2;this.swpd=3;this.free=4;this.buffers=5;this.cache=6;this.swappedIn=7;this.swappedOut=8;this.read=9;this.write=10;
        this.interrupt=11;this.contextSwitch=12;this.user=13;this.system=14;this.idle=15;this.waitIO=16;this.vmstatRegexLen=17;
    }
    
    util.inherits(Vmstat, events.EventEmitter);
    
    Vmstat.prototype.start = function() {
        var $this         = this,
            vmstatBuffer = '';

        process.setDebug(this.debug);
        var vmstat = process.execute('\\cygwin\\bin\\vmstat.exe', ['-n', 1, 2], null, null, function (err, userValue) {
            if (err) {
                if ($this.debug) util.log('windows|vmstat|err=' + util.inspect(err));
                throw err;
            }
            userValue = userValue;
            var stats = processVmStatData(vmstatBuffer.split(/\n/)[3]);
            $this.emit('stats', stats);
            setTimeout(function () {
                $this.vmstatBuffer = '';
                $this.start.call($this);
            }, $this.samplingRate * 1000);
        });

        vmstat.stdout.on('data', function (data) {
            vmstatBuffer += data;
        });
        vmstat.stderr.on('data', function (data) {
            if ($this.debug) util.log('windows|vmstat|stderr=' + data + '\n');
        });
        
        function processVmStatData(line) {
            var stats = {},
                capture = line.match($this.regex);
            if ($this.debug) util.log('windows|vmstat|stout=' + line + '|capture=' + util.inspect(capture));
            if (capture !== null && capture[0] !== undefined && capture.length === $this.vmstatRegexLen) {
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
            }
            return stats;
        }
    };
    
    ////////////////////////////////////////////////////////////////////////////
    
    return  Vmstat;
})();


