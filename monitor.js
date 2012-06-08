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

/**
 * root@mt-nme-cosnme2 ~]# df -P
 * Filesystem         1024-blocks      Used Available Capacity Mounted on
 * /dev/mapper/VolGroup00-LogVol00  40756536   3619856  35032976      10% /
 * /dev/sda1               101086     12711     83156      14% /boot
 * tmpfs                  6667044         0   6667044       0% /dev/shm
*/

/**
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

(function () {
    var debug    = false,
        client   = dgram.createSocket("udp4"),
        server   = process.env.STATSD_HOST || '127.0.0.1',
        port     = process.env.STATSD_PORT || 8125,
        samplingRate = process.env.SAMPLING_RATE || 10,
        disksamplingRate = process.env.DISK_SAMPLING_RATE || 60000,
        hostname = os.hostname(),
        vmstatRegex = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/,
        waitForRuntime=1,nbUninterruptibleSleep=2,swpd=3,free=4,buffers=5,cache=6,swappedIn=7,swappedOut=8,read=9,write=10,interrupt=11,contextSwitch=12,user=13,system=14,idle=15,waitIO=16,stolenVM=17,vmstatRegexLen=18,
        dfRegex =  /^\s*([^\s]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%\s+([^\s]+)\s*$/,
        fileSystem=1,blocks=2,used=3,available=4,capacity=5,mount=6,dfRegexLen=7,
        ifconfigInterfaceNameRegex = /^([a-zA-Z0-9]+)\s+/,
        ifconfigRegex = /^\s+RX\s+bytes:\s*(\d+)\s+\([^)]+\)\s+TX\s+bytes:\s*(\d+)\s+\([^)]*\)\s*$/,
        received=1,sent=2,ifconfigRegexLen=3;
        

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
        return child;
    }
    
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    var bytesSent     = -1,
        bytesReceived = -1;
    function checkNetwork() {
        var interfaceName = 'unknown';
        var ifconfig = execute('/sbin/ifconfig', null, null, null, function (err, userValue) {
            if (err) {
                if (debug) util.log('monitor|ifconfig|host='+server+':'+port+'|err=' + util.inspect(err));
                throw err;
            }
            userValue = userValue;
        });
        ifconfig.stdout.on('data', function (data) {
            var lines = ('' + data).split(/\r?\n/);
            for (var i = 0 ; i < lines.length ; ++i) {
                var capture = lines[i].match(ifconfigInterfaceNameRegex);
                if (debug) util.log('monitor|ifconfig|stout=' + lines[i] + '|capture=' + util.inspect(capture));
                if (capture !== null && capture[0] !== undefined && capture.length === 2) {
                    interfaceName = capture[1];
                } else {
                    capture = lines[i].match(ifconfigRegex);
                    if (debug) util.log('monitor|ifconfig|stout=' + lines[i] + '|capture=' + util.inspect(capture));
                    if (capture !== null && capture[0] !== undefined && capture.length === ifconfigRegexLen) { 
                        if (bytesSent !== -1 && bytesReceived !== -1) {
                            send(hostname + '.network.' + interfaceName + '.sent:' + (capture[sent] - bytesSent) + '|c');
                            send(hostname + '.network.' + interfaceName + '.received:' + (capture[received] - bytesReceived) + '|c');
                        }
                        bytesSent     = capture[sent];
                        bytesReceived = capture[received];
                    }
                }
            }
        });
        ifconfig.stderr.on('data', function (data) {
            if (debug) util.log('monitor|ifconfig|stderr=' + data + '\n');
        });
        setTimeout(checkNetwork, disksamplingRate);
    }
    
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    

    function checkDisk() {
        var df = execute('df', ['-P'], null, null, function (err, userValue) {
            if (err) {
                if (debug) util.log('monitor|df|host='+server+':'+port+'|err=' + util.inspect(err));
                throw err;
            }
            userValue = userValue;
        });
        df.stdout.on('data', function (data) {
            var lines = ('' + data).split(/\r?\n/);
            for (var i = 0 ; i < lines.length ; ++i) {
                var capture = lines[i].match(dfRegex);
                if (debug) util.log('monitor|df|stout=' + lines[i] + '|capture=' + util.inspect(capture));
                if (capture !== null && capture[0] !== undefined && capture.length === dfRegexLen) {
                    send(hostname + '.disk.' + capture[mount].replace(/\//g,"_") + '.used:' + capture[capacity] + '|g');
                }
            }
        });
        df.stderr.on('data', function (data) {
            if (debug) util.log('monitor|df|stderr=' + data + '\n');
        });
        setTimeout(checkDisk, disksamplingRate);
    }
    
    
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    
    util.log('Starting monitor on ' + hostname + ' to ' + server + ':' + port);  
    var vmstat = execute('vmstat', ['-n', samplingRate], null, null, function (err, userValue) {
        if (err) {
            if (debug) util.log('monitor|vmstat|host='+server+':'+port+'|err=' + util.inspect(err));
            throw err;
        }
        userValue = userValue;
    });
    
    vmstat.stdout.on('data', function (data) {
         var line = '' + data;
         var capture = line.match(vmstatRegex);
         if (debug) util.log('monitor|vmstat|stout=' + data + '|capture=' + util.inspect(capture));
         if (capture !== null && capture[0] !== undefined && capture.length === vmstatRegexLen) {
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
    vmstat.stderr.on('data', function (data) {
        if (debug) util.log('monitor|vmstat|stderr=' + data + '\n');
    });
    checkDisk();
    checkNetwork();
})();
