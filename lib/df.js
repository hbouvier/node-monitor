/**
 *  MacOsX/Linux/Cygwin: Collect Disk Space Statistics
 * 
 */
var process  = require('./process'),
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
    function isWindows() {
        var win = 'Windows';
        return (os.type().substring(0, win.length) == win);
    }
    
    function Df(samplingRate, log) {
        this.logger        = log;
        this.hostname      = os.hostname();
        this.samplingRate  = samplingRate;
        this.regex =  /^\s*([^\s]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%\s+([^\s]+)\s*$/;
        this.fileSystem = 1; this.blocks = 2; this.used = 3; this.available = 4; this.capacity = 5; this.mount = 6; this.regexLen = 7;
        this.command = isWindows() ? '\\cygwin\\bin\\df.exe' : 'df';
        this.params  = isWindows() ? null : ['-P'];
    }
    
    util.inherits(Df, events.EventEmitter);
    
    Df.prototype.start = function() {
        var $this         = this;

        process.setLogger(this.logger);
        var df = process.execute($this.command, $this.params, null, null, function (err, userValue) {
            if (err) {
                $this.logger.log('error', 'all|df|err=' + util.inspect(err));
                throw err;
            }
            userValue = userValue;
            setTimeout(function () {
                $this.start.call($this);
            }, $this.samplingRate * 1000);
        });
        
        df.stdout.on('data', function (data) {
            var lines = ('' + data).split(/\r?\n/);
            for (var i = 0 ; i < lines.length ; ++i) {
                var capture = lines[i].match($this.regex);
                $this.logger.log('debug', 'all|df|stout=' + lines[i] + '|capture=' + util.inspect(capture));
                if (capture !== null && capture[0] !== undefined && capture.length === $this.regexLen) {
                    var stats = {};
                    stats[$this.hostname + '.disk.' + capture[$this.mount].replace(/\//g,'_') + '.used'] = capture[$this.capacity];
                    $this.emit('stats', stats);
                }
            }
        });
        df.stderr.on('data', function (data) {
            $this.logger.log('debug', 'all|df|stderr=' + data + '\n');
        });
    };

    ////////////////////////////////////////////////////////////////////////////

    return  Df;
})();


