var util  = require('util'),
    spawn = require('child_process').spawn;
    
module.exports = (function () {
    var _debug = false;
    
    function setDebug(debug) {
        _debug = debug;
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
            
        if (_debug) util.log('monitor|execute|command='+command+'|args=' + util.inspect(args)+'|options='+util.inspect(finalOptions));
        var child = spawn(command, args, finalOptions);
        child.on('exit', function (code /*, signal*/) {
            if (_debug) util.log('monitor|execute|command='+command+'|args=' + util.inspect(args)+'|exit_code='+code);
            if (code === 0) {
                if (_debug) util.log('monitor|execute|command='+command+'|args=' + util.inspect(args)+'|exit_code='+code+'|'+output);
                callback.call($this, null, userValue);
            } else {
                callback.call($this, new Error(output), userValue);
            }
        });
        return child;
    }
    
    ////////////////////////////////////////////////////////////////////////////
    
    return  {
        'setDebug' : setDebug,
        'execute'  : execute
    };
})();
