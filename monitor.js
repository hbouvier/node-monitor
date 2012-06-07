var util  = require('util'),
    spawn = require('child_process').spawn,
    dgram = require('dgram'),
    os    = require("os");

/**
 * vmstat -n 10
 * procs -----------memory---------- ---swap-- -----io---- --system-- -----cpu------
 *  r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 *  0  0  45080 10970204 120756 437012    0    0     0     2   11    4  0  0 100  0  0
 *  0  0  45080 10970204 120756 437012    0    0     0     0 1012   70  0  0 100  0  0
 *  0  0  45080 10970204 120756 437012    0    0     0     0 1010   78  0  0 100  0  0
 */


(function () {
    var debug    = true,
        client   = dgram.createSocket("udp4"),
        server   = process.env.STATSD_HOST || '127.0.0.1',
        port     = process.env.STATSD_PORT || 8125,
        samplingRate = process.env.SAMPLING_RATE || 10,
        hostname = os.hostname(),
        regex    = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d)+\s+(\d)+\s+(\d+)\s+(\d)+\s+(\d+)\s+(\d)+\s+(\d)+\s*$/,
        waitForRuntime=1,nbUninterruptibleSleep=2,swpd=3,free=4,buffers=5,cache=6,swappedIn=7,swappedOut=8,read=9,write=10,interrupt=11,contextSwitch=12,user=13,system=14,idle=15,waitIO=16,stolenVM=17,regexLen=18;

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
    
    function execute(command, args, userValue, options, callback) {
        var $this = this,
            finalOptions = {
                "cwd": "/tmp/",
                "env": {
                    "ENV":"development"
                },
                "customFds":[-1, -1, -1]
            },
            output = '';
        if (options) for (var prop in options) { finalOptions[prop] = options[prop]; }
            
        if (debug) util.log('monitor|execute|command='+command+'|args=' + util.inspect(args)+'|options='+util.inspect(finalOptions));
        var child = spawn(command, args, finalOptions);
        child.on('exit', function (code /*, signal*/) {
            if (debug) util.log('monitor|execute|command='+command+'|args=' + util.inspect(args)+'|exit_code='+code);
            if (code === 0) {
                if (debug) util.log('monitor|execute|command='+command+'|args=' + util.inspect(args)+'|exit_code='+code+'|'+output);
                callback.call($this, null, userValue);
            } else {
                callback.call($this, new Error(output), userValue);
            }
        });
        child.stdout.on('data', function (data) {
             var line = '' + data;
             var capture = line.match(regex);
             if (debug) util.log('monitor|execute|stout=' + data + '|capture=' + util.inspect(capture));
             if (capture !== null && capture[0] !== undefined && capture.length === regexLen) {
                 send(hostname + '.cpu.used:' + (100 - capture[idle]) + '|g');
                 send(hostname + '.cpu.user:' + capture[user] + '|g');
                 send(hostname + '.cpu.system:' + capture[system] + '|g');
                 
                 send(hostname + '.memory.swapused:' + capture[swpd] + '|g');
                 send(hostname + '.memory.free:' + capture[free] + '|g');
                 send(hostname + '.memory.used_for_buffers:' + capture[buffers] + '|g');
                 send(hostname + '.memory.used_for_cache:' + capture[cache] + '|g');
                 send(hostname + '.memory.swap.in:' + capture[swappedIn] + '|c');
                 send(hostname + '.memory.swap.out:' + capture[swappedOut] + '|c');

                 send(hostname + '.disk.read:' + capture[read] + '|c');
                 send(hostname + '.disk.write:' + capture[write] + '|c');
                 
                 send(hostname + '.kernel.interrupt:' + capture[interrupt] + '|c');
                 send(hostname + '.kernel.contextswitch:' + capture[contextSwitch] + '|c');
                 send(hostname + '.kernel.wait.io:' + capture[waitIO] + '|c');
                 send(hostname + '.vmware.overhead:' + capture[stolenVM] + '|c');

                 send(hostname + '.process.wait:' + capture[waitForRuntime] + '|c');
                 send(hostname + '.process.sleep:' + capture[nbUninterruptibleSleep] + '|c');
                 
             }
        });
        child.stderr.on('data', function (data) {
            if (debug) util.log('monitor|execute|stderr=' + data + '\n');
            output += 'STDERR:' + data + '\n';
        });
    }
    util.log('Starting monitor on ' + hostname + ' to ' + server + ':' + port);    
    execute('vmstat', ['-n', samplingRate], null, null, function (err, userValue) {
        if (err) {
            if (debug) util.log('monitor|host='+server+':'+port+'|err=' + util.inspect(err));
            throw err;
        }
        userValue = userValue;
    });
})();
