var http = require('http').Server(/* handler */);
var io = require('socket.io')(http);
var port = 1337;

http.listen(port, function(){

       console.log('Listening on ' + port);
});

io.on('connection', function (socket) {

        console.log('Client connected');

        socket.on('cope', function (data) {

                dout = {output: data.input};
                io.emit('reassure', dout);
                console.log('Cope: ' + data.input);
        });

        socket.on('disconnect', function() {

                console.log('Client disconnected');
        });
});

// vim: sw=8 ts=8 et
