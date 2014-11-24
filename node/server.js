var http = require('http').Server(/* handler */);
var io = require('socket.io')(http);
var fs = require('fs');
var port = 1337;
var cardfile = '../cards.tab';
var cachefile = 'cache/save.json';

var init = 0;
var games = {};
var games_p = {};
var cards = [];
var players = {};
var sockets = {};
var maxgameid = 0;
var changes = false;

var autosave = function() {

    if( changes && init == 2 )
    {
        changes = false;

        var saveme = {
            games: games,
            games_p: games_p,
            players: players,
            maxgameid: maxgameid
        };

        fs.writeFile(cachefile, JSON.stringify(saveme), {mode:0660}, function(err){
            if( err ) console.log(err);
            else console.log('Saved');
        });
    }

    setTimeout(autosave, 5000);
};

setTimeout(autosave, 5000);

fs.readFile(cardfile, {encoding: 'utf8'}, function(err, data){

    if( err ) throw err;
    data = data.trim().split("\n");

    for( var i in data )
    {
        var line = data[i].split("\t");

        if( line.length != 4 )
        {
            console.log("Bad card at line " + i);
            continue;
        }

        cards.push({
            cardid: i,
            color: line[1],
            num: line[2],
            txt: line[3]
        });
    }

    init++;
});

fs.readFile(cachefile, {encoding: 'utf8'}, function(err, data){
    init++;

    if( err )
    {
        console.log("Could not load cache file: " + cachefile);
        return;
    }

    data = JSON.parse(data);
    games = data.games;
    games_p = data.games_p;
    players = data.players;
    maxgameid = data.maxgameid;

    console.log("Loaded " + Object.keys(games).length + " games:");
    for( var x in games )
        console.log('  "' + games[x].name + '"');
    console.log("Loaded " + Object.keys(players).length + " players");
    console.log("Max game id: " + maxgameid);
});

http.listen(port, function(){

    console.log('Listening on ' + port);
});

io.on('connection', function (socket) {

    var playerid = 0;
    var player = {};
    var game = {};
    var cookies = socket.handshake.headers.cookie.split(';');
    var hrtime = process.hrtime();

    if( init != 2 )
        console.log('Connection before init!');

    for( var x in cookies )
    {
        var cookie = cookies[x].trim().split('=');
        if( cookie[0] == 'sj_id' || cookie[0] == 'sj_t_id' ) 
        {
            playerid = cookie[1];
            sockets[playerid] = socket;

            if( playerid in players ) {
                player = players[playerid];
                game = games[player.gameid];
            }

            player = {
                playerid: playerid,
                gameid: 0,
                score: 0,
                idle: 0,
                abandon: 0,
                time: hrtime[0],
                czartime: hrtime[0]
            };
            players[playerid] = player;
        }
    }

    if( !playerid ) {
        console.log('Client is not logged in: ' + socket.id);
        socket.emit('state', {msg:'Please <a href=../!login.php?return=sah>login</a> to play!'});
        socket.disconnect();
        return;
    }

    console.log('Client connected: ' + socket.id + ' -> player ' + playerid);

    socket.on('check', function (data) {

        // console.log(data);
    });

    socket.on('create', function (data) {

        changes = true;

        var gameid = ++maxgameid;
        var game_p = {gameid: gameid};
        game_p.pass = data.game.pass;
        data.game.pass    = game_p.pass ? 1 : 0;
        data.game.gameid  = gameid;
        data.game.state   = 'gather';
        data.game.time    = process.hrtime()[0];
        data.game.secs    = 0;
        data.game.round   = 0;
        data.game.players = 0;
        data.game.high    = 0;

        games[gameid] = data.game;
        games_p[gameid] = game_p;
        console.log('Created game ' + gameid + ' "' + data.game.name + '"');
        players[playerid].gameid = gameid;
    });

    socket.on('join', function (data) {

        if( data.gameid && games[data.gameid] ) {
            game = games[data.gameid];
            player.gameid = data.gameid;

            console.log('Player ' + playerid + ' joined game "' + game.name + '"');
            return;
        }

        console.log('Player ' + playerid + ' tried to join non-existent game');
    });

    socket.on('leave', function (data) {

        if( game ) {
            console.log('Player ' + playerid + ' left game "' + game.name + '"');
            player.gameid = 0;
            game = {};
        }
    });

    socket.on('disconnect', function() {

        console.log('Client disconnected');
    });
});

var heartbeat = function(){

    var hrtime = process.hrtime();

    for( var gameid in games ) {
        var game = games[gameid];
        game.secs = hrtime[0] - game.time;
    }

    for( playerid in players ) {
        var player = players[playerid];
        var socket = sockets[playerid];
        if( !socket || !socket.connected ) continue;
        socket.emit('state', {
            inlobby: player.gameid ? 0 : 1,
            lobby: player.gameid ? null : games,
            game: player.gameid ? games[gameid] : null,
            now: hrtime[0],
            nano: hrtime[1]
        });
    }

    setTimeout( heartbeat, 2000 );
}

setTimeout( heartbeat, 2000 );

// vim: sw=4 ts=4 et
