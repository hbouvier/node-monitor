/**
 *  Mac OS Collect VM Statistics
 * 
 */
var process  = require('../process'),
    events   = require('events'),
    os       = require('os'),
    util     = require('util');

/**
 * droctopus:node-monitor henri$ vm_stat 1
 * Mach Virtual Memory Statistics: (page size of 4096 bytes, cache hits 0%)
 *   free active   spec inactive   wire   faults     copy    0fill reactive  pageins  pageout
 * 247484  1136K  66687   345616 300142 1955893K 90204144 1171715K  2571485 21764748  2981577 
 * 250158  1135K  66687   342876 301137      449        1      378        0        0        0 
 */
 
/**
 * droctopus:node-monitor henri$ iostat 1
 *           disk0           disk1           disk2       cpu     load average
 *     KB/t tps  MB/s     KB/t tps  MB/s     KB/t tps  MB/s  us sy id   1m   5m   15m
 *    32.52   6  0.18   348.20   3  0.99   698.31   1  0.93   2  2 96  1.84 1.82 1.70
 *     0.00   0  0.00     0.00   0  0.00     0.00   0  0.00   1  1 97  1.84 1.82 1.70
 *
 * mt-cloud:~ henri$ iostat 1
 *           disk0       cpu     load average
 *     KB/t tps  MB/s  us sy id   1m   5m   15m
 *    16.44   4  0.07   1  3 96  18.00 15.22 15.89
 *     0.00   0  0.00   2  8 90  18.00 15.22 15.89
 */

module.exports = (function () {
    
    function Vmstat(samplingRate) {
        this.debug         = false;
        this.hostname      = os.hostname();
        this.samplingRate  = samplingRate;
        this.regexVmstat = /^\s*(\d+)[A-Z]?\s+(\d+)[A-Z]?\s+(\d+)[A-Z]?\s+(\d+)[A-Z]?\s+(\d+)[A-Z]?\s+(\d+)[A-Z]?\s+(\d+)[A-Z]?\s+(\d+)[A-Z]?\s+(\d+)[A-Z]?\s+(\d+)[A-Z]?\s+(\d+)[A-Z]?\s*$/;
        this.free=1;this.active=2;this.special=3;this.inactive=4;this.wire=5;this.faults=6;this.copy=7;this.fill=8;this.reactive=9;this.pageins=10;this.pageout=11;this.regexLen=12;
        
        //this.regexIOstatDisk = /^\s+((\d+(?:\.\d+))\s+(\d+)\s+(\d+(?:\.\d+))\s+)+(\d+)\s+(\d+)\s+(\d+)\s+(\d+(?:\.\d+))\s+(\d+(?:\.\d+))\s+(\d+(?:\.\d+))\s*$/;
        this.regexIOstatDisk = /^\s+(\d+(?:\.\d+))\s+(\d+)\s+(\d+(?:\.\d+))(.*)$/;
        this.KBtransfer=1;this.transferPerSec=2;this.MBPerSec=3;this.rest=4;this.regexIOstatDiskLen=5;
        this.regexIOstatCPU = /^\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+(?:\.\d+))\s+(\d+(?:\.\d+))\s+(\d+(?:\.\d+))\s*$/;
        this.user=1;this.system=2;this.idle=3;this.load1m=4;this.load5m=5;this.load15m=6;this.regexIOstatCPULen=7;
    }
    
    util.inherits(Vmstat, events.EventEmitter);
    
    Vmstat.prototype.vm_stat = function() {
        var $this         = this;
        var vmstat = process.execute('vm_stat', [$this.samplingRate], null, null, function (err, userValue) {
            if (err) {
                if ($this.debug) util.log('macosx|vm_stat|err=' + util.inspect(err));
                throw err;
            }
            userValue = userValue;
        });
        vmstat.stderr.on('data', function (data) {
            if ($this.debug) util.log('macosx|vm_stat|stderr=' + data + '\n');
        });
        vmstat.stdout.on('data', function (data) {
            var lines = ('' + data).split(/\r?\n/);

            for (var i = 0 ; i < lines.length ; ++i) {
                var capture = lines[i].match($this.regexVmstat);
                if ($this.debug) util.log('macosx|vm_stat|stout=' + lines[i] + '|capture=' + util.inspect(capture));
                if (capture !== null && capture[0] !== undefined && capture.length === $this.regexLen) {
                    var stats = {};
                    stats[$this.hostname + '.memory.free']   = capture[$this.free];
                    stats[$this.hostname + '.memory.active']   = capture[$this.active];
                    stats[$this.hostname + '.memory.special']   = capture[$this.special];
                    stats[$this.hostname + '.memory.inactive']   = capture[$this.inactive];
                    stats[$this.hostname + '.memory.wire']   = capture[$this.wire];
                    stats[$this.hostname + '.memory.faults']   = capture[$this.faults];
                    stats[$this.hostname + '.memory.copy']   = capture[$this.copy];
                    stats[$this.hostname + '.memory.fill']   = capture[$this.fill];
                    stats[$this.hostname + '.memory.reactive']   = capture[$this.reactive];
                    stats[$this.hostname + '.memory.pageins']   = capture[$this.pageins];
                    stats[$this.hostname + '.memory.pageout']   = capture[$this.pageout];
                    $this.emit('stats', stats);
                }
            }
        });
    };
    
    Vmstat.prototype.iostat = function() {
        var $this         = this;
        var vmstat = process.execute('/usr/sbin/iostat', [$this.samplingRate], null, null, function (err, userValue) {
            if (err) {
                if ($this.debug) util.log('macosx|iotat|err=' + util.inspect(err));
                throw err;
            }
            userValue = userValue;
        });
        vmstat.stderr.on('data', function (data) {
            if ($this.debug) util.log('macosx|iotat|stderr=' + data + '\n');
        });
        vmstat.stdout.on('data', function (data) {
            var lines = ('' + data).split(/\r?\n/);

            for (var i = 0 ; i < lines.length ; ++i) {
                var kbTransfer = 0.0,
                    transferPerSec = 0,
                    mbPerSec = 0.0,
                    rest = '',
                    stats = {},
                    found = false;;
                    
                var capture = lines[i].match($this.regexIOstatDisk);
                if ($this.debug) util.log('macosx|iostat|stout=' + lines[i] + '|capture=' + util.inspect(capture));
                while(capture !== null && capture[0] !== undefined && capture.length === $this.regexIOstatDiskLen) {
                    kbTransfer += parseFloat(capture[$this.KBtransfer]);
                    transferPerSec += parseInt(capture[$this.transferPerSec]);
                    mbPerSec += parseFloat(capture[$this.MBPerSec]);
                    rest = capture[$this.rest];
                    capture = rest.match($this.regexIOstatDisk);
                }
                stats[$this.hostname + '.disk.KBperTransfer']    = kbTransfer;
                stats[$this.hostname + '.disk.transferPerSec']   = transferPerSec;
                stats[$this.hostname + '.disk.MBTransferPerSec'] = mbPerSec;
                    
                capture = rest.match($this.regexIOstatCPU);
                if ($this.debug) util.log('macosx|iostat|stout=' + lines[i] + '|capture=' + util.inspect(capture));
                if(capture !== null && capture[0] !== undefined && capture.length === $this.regexIOstatCPULen) {
                    stats[$this.hostname + '.cpu.user']   = capture[$this.user];
                    stats[$this.hostname + '.cpu.system'] = capture[$this.system];
                    stats[$this.hostname + '.cpu.used']   = (100 - parseInt(capture[$this.idle]));
                    stats[$this.hostname + '.cpu.load1m']   = capture[$this.load1m];
                    stats[$this.hostname + '.cpu.load5m']   = capture[$this.load5m];
                    stats[$this.hostname + '.cpu.load15m']   = capture[$this.load15m];
                    found = true;
                }
                if (found)
                    $this.emit('stats', stats);
            }
        });
    };
    
    Vmstat.prototype.start = function() {
        process.setDebug(this.debug);
        this.vm_stat();
        this.iostat();
    };
    
    ////////////////////////////////////////////////////////////////////////////
    
    return  Vmstat;
})();


